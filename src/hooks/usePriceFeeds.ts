import { useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import {
  CONTRACT_REGISTRY_ADDRESS,
  contractRegistryAbi,
  ftsoV2ReadAbi,
} from "../lib/flare";
import {
  decodeFeedId,
  fullName,
  logoUrl,
  FALLBACK_CRYPTO_FEEDS,
  FEED_CATEGORY,
} from "../lib/feeds";

export interface FeedRow {
  feedId: `0x${string}`;
  symbol: string;
  name: string;
  quote: string;
  price: number;
  priceLabel: string;
  logo: string;
  /** Percent change vs the first observed price in this session, or null until known. */
  change: number | null;
}

export interface HistoryPoint {
  time: string;
  [symbol: string]: number | string;
}

const REFRESH_MS = 3500;
const MAX_HISTORY = 60;
const CHART_SYMBOLS = ["BTC", "ETH", "FLR"];

function formatPrice(value: number): string {
  if (value === 0) return "$0.00";
  if (value >= 1000) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (value >= 1) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toPrecision(3)}`;
}

export function usePriceFeeds() {
  const publicClient = usePublicClient();

  const { data: ftsoV2Address } = useQuery({
    queryKey: ["ftsoV2Address"],
    enabled: !!publicClient,
    staleTime: Infinity,
    queryFn: async () => {
      const addr = await publicClient!.readContract({
        address: CONTRACT_REGISTRY_ADDRESS,
        abi: contractRegistryAbi,
        functionName: "getContractAddressByName",
        args: ["FtsoV2"],
      });
      return addr as `0x${string}`;
    },
  });

  const { data: feedIds } = useQuery({
    queryKey: ["supportedFeedIds", ftsoV2Address],
    enabled: !!publicClient && !!ftsoV2Address,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      try {
        const ids = (await publicClient!.readContract({
          address: ftsoV2Address!,
          abi: ftsoV2ReadAbi,
          functionName: "getSupportedFeedIds",
        })) as `0x${string}`[];
        const crypto = ids.filter((id) => decodeFeedId(id).category === FEED_CATEGORY.CRYPTO);
        return crypto.length > 0 ? crypto : FALLBACK_CRYPTO_FEEDS;
      } catch {
        return FALLBACK_CRYPTO_FEEDS;
      }
    },
  });

  const initialPrice = useRef<Record<string, number>>({});
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  const {
    data: feedData,
    isLoading,
    error,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["feedValues", ftsoV2Address, feedIds?.length],
    enabled: !!publicClient && !!ftsoV2Address && !!feedIds && feedIds.length > 0,
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      const [values, timestamp] = (await publicClient!.readContract({
        address: ftsoV2Address!,
        abi: ftsoV2ReadAbi,
        functionName: "getFeedsByIdInWei",
        args: [feedIds!],
      })) as [bigint[], bigint];

      const rows: FeedRow[] = values.map((value, i) => {
        const decoded = decodeFeedId(feedIds![i]);
        const price = Number(formatUnits(value, 18));
        if (initialPrice.current[decoded.symbol] === undefined && price > 0) {
          initialPrice.current[decoded.symbol] = price;
        }
        const base = initialPrice.current[decoded.symbol];
        const change = base && base > 0 ? ((price - base) / base) * 100 : null;
        return {
          feedId: decoded.feedId,
          symbol: decoded.symbol,
          name: fullName(decoded.symbol),
          quote: decoded.quote,
          price,
          priceLabel: formatPrice(price),
          logo: logoUrl(decoded.symbol),
          change,
        };
      });
      return { rows, timestamp: Number(timestamp) };
    },
  });

  useEffect(() => {
    if (!feedData) return;
    const bySymbol = new Map(feedData.rows.map((r) => [r.symbol, r.price]));
    const point: HistoryPoint = {
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    };
    for (const sym of CHART_SYMBOLS) {
      const p = bySymbol.get(sym);
      if (p !== undefined) point[sym] = p;
    }
    setHistory((prev) => [...prev, point].slice(-MAX_HISTORY));
  }, [dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    feeds: feedData?.rows ?? [],
    history,
    chartSymbols: CHART_SYMBOLS,
    timestamp: feedData?.timestamp,
    isLoading,
    error: error as Error | null,
    ftsoV2Address,
  };
}
