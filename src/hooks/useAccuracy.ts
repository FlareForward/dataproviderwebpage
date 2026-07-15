import { useQuery } from "@tanstack/react-query";

/**
 * Per-feed FTSO accuracy, fetched from a small PUBLIC data repo that the
 * provider box force-pushes every ~10 min (github.com/FlareForward/ftso-accuracy-data).
 * Same cross-origin raw-URL pattern useProviders uses for the provider list, so
 * the board refreshes live without redeploying the site. Override with
 * VITE_ACCURACY_URL for local/preview.
 */
const ACCURACY_URL =
  import.meta.env.VITE_ACCURACY_URL ??
  "https://raw.githubusercontent.com/FlareForward/ftso-accuracy-data/main/ftso-accuracy.json";

export interface AccuracySummary {
  feeds_count: number;
  overall_primary_6h: number;
  overall_secondary_6h: number;
  overall_primary_24h: number;
  overall_secondary_24h: number;
  median_primary_24h: number;
  median_secondary_24h: number;
}

export interface AccuracyEpoch {
  reward_epoch: number;
  primary: number;
  secondary: number;
  n?: number;
}

export interface AccuracyTrendPoint {
  bucket_start_unix: number;
  primary: number;
  secondary: number;
  n: number;
}

export interface AccuracyFeed {
  feed: string;
  primary_6h: number;
  secondary_6h: number;
  primary_24h: number;
  secondary_24h: number;
  n_6h?: number;
  n_24h: number;
  trend?: AccuracyTrendPoint[];
}

export interface AccuracyData {
  generated_at_unix: number;
  current_round: number;
  summary: AccuracySummary;
  epochs: AccuracyEpoch[];
  feeds: AccuracyFeed[];
}

export function useAccuracy() {
  const query = useQuery({
    queryKey: ["ftso-accuracy"],
    // Cache for the publish cadence; refetch quietly in the background so a
    // long-open tab stays current without hammering the CDN.
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<AccuracyData> => {
      const res = await fetch(ACCURACY_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error(`Failed to load accuracy feed (${res.status})`);
      return (await res.json()) as AccuracyData;
    },
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
