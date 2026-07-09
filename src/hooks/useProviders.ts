import { usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import {
  CONTRACT_REGISTRY_ADDRESS,
  contractRegistryAbi,
  wNatAbi,
} from "../lib/flare";

const PROVIDER_LIST_URL =
  "https://raw.githubusercontent.com/TowoLabs/ftso-signal-providers/master/bifrost-wallet.providerlist.json";

const FLARE_CHAIN_ID = 14;

interface RawProvider {
  chainId: number;
  name: string;
  description?: string;
  url?: string;
  address: string;
  logoURI?: string;
  listed?: boolean;
}

export interface ProviderRow {
  address: `0x${string}`;
  name: string;
  description: string;
  url: string;
  logoURI: string;
  /** Vote power in whole FLR, or null if unavailable. */
  votePower: number | null;
  votePowerLabel: string;
  delegationPct: number | null;
  status: "Active" | "Warning" | "Offline";
}

function formatVotePower(vp: number): string {
  if (vp >= 1e9) return `${(vp / 1e9).toFixed(2)}B`;
  if (vp >= 1e6) return `${(vp / 1e6).toFixed(2)}M`;
  if (vp >= 1e3) return `${(vp / 1e3).toFixed(2)}K`;
  return vp.toFixed(0);
}

export function useWNatAddress() {
  const publicClient = usePublicClient();
  return useQuery({
    queryKey: ["wNatAddress"],
    enabled: !!publicClient,
    staleTime: Infinity,
    queryFn: async () =>
      (await publicClient!.readContract({
        address: CONTRACT_REGISTRY_ADDRESS,
        abi: contractRegistryAbi,
        functionName: "getContractAddressByName",
        args: ["WNat"],
      })) as `0x${string}`,
  });
}

export function useProviders() {
  const publicClient = usePublicClient();
  const { data: wNatAddress } = useWNatAddress();

  const query = useQuery({
    queryKey: ["providers", wNatAddress],
    enabled: !!publicClient && !!wNatAddress,
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await fetch(PROVIDER_LIST_URL);
      if (!res.ok) throw new Error(`Failed to load provider list (${res.status})`);
      const json = (await res.json()) as { providers: RawProvider[] };
      const listed = json.providers.filter(
        (p) => p.chainId === FLARE_CHAIN_ID && p.listed !== false && p.address
      );

      // Read total + per-provider vote power on-chain.
      let totalVotePower = 0;
      try {
        const total = (await publicClient!.readContract({
          address: wNatAddress!,
          abi: wNatAbi,
          functionName: "totalVotePower",
        })) as bigint;
        totalVotePower = Number(formatUnits(total, 18));
      } catch {
        totalVotePower = 0;
      }

      let votePowers: (bigint | null)[] = [];
      try {
        const results = await publicClient!.multicall({
          allowFailure: true,
          contracts: listed.map((p) => ({
            address: wNatAddress!,
            abi: wNatAbi,
            functionName: "votePowerOf",
            args: [p.address as `0x${string}`],
          })),
        });
        votePowers = results.map((r) => (r.status === "success" ? (r.result as bigint) : null));
      } catch {
        votePowers = listed.map(() => null);
      }

      const providers: ProviderRow[] = listed.map((p, i) => {
        const vpWei = votePowers[i];
        const votePower = vpWei !== null ? Number(formatUnits(vpWei, 18)) : null;
        const delegationPct =
          votePower !== null && totalVotePower > 0 ? (votePower / totalVotePower) * 100 : null;
        return {
          address: p.address as `0x${string}`,
          name: p.name,
          description: p.description ?? "",
          url: p.url ?? "",
          logoURI: p.logoURI ?? "",
          votePower,
          votePowerLabel: votePower !== null ? `${formatVotePower(votePower)} FLR` : "-",
          delegationPct,
          status: votePower === null ? "Offline" : votePower > 0 ? "Active" : "Warning",
        };
      });

      providers.sort((a, b) => (b.votePower ?? -1) - (a.votePower ?? -1));
      return { providers, totalVotePower };
    },
  });

  return {
    providers: query.data?.providers ?? [],
    totalVotePower: query.data?.totalVotePower ?? 0,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    wNatAddress,
  };
}
