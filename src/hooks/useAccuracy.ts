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

/**
 * A `null` landing rate means "no data for this window" — never "0%". On-chain
 * windows are null while the provider is out of the signing policy (a
 * registration gap); the `qa` block stays populated regardless.
 */
export interface AccuracySummary {
  feeds_count: number;
  overall_primary_6h: number | null;
  overall_secondary_6h: number | null;
  overall_primary_24h: number | null;
  overall_secondary_24h: number | null;
  median_primary_24h: number | null;
  median_secondary_24h: number | null;
  source?: string;
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
  primary_6h: number | null;
  secondary_6h: number | null;
  primary_24h: number | null;
  secondary_24h: number | null;
  n_6h?: number;
  n_24h: number;
  trend?: AccuracyTrendPoint[];
  source?: string;
}

export interface AccuracyStatus {
  submitting: boolean;
  reward_epoch_current?: number;
  reward_epoch_registered?: boolean;
  gap_reason?: string | null;
  expected_resume_utc?: string | null;
}

/** QA = our local provider values graded against the field reward band; stays
 *  populated during registration gaps but understates ETH/USD and XRP/USD. */
export interface AccuracyQa {
  source?: string;
  description?: string;
  caveat?: string;
  summary: AccuracySummary;
  feeds: AccuracyFeed[];
}

export interface AccuracyData {
  generated_at_unix: number;
  current_round: number;
  summary: AccuracySummary;
  epochs: AccuracyEpoch[];
  feeds: AccuracyFeed[];
  status?: AccuracyStatus;
  qa?: AccuracyQa;
  schema_version?: number;
}

/**
 * Whether the provider is actively submitting this epoch. During a registration
 * gap the on-chain windows are null; we surface a "paused" notice rather than
 * the DA-independent QA estimates, which can be misleading as live figures.
 */
export function isSubmitting(data: AccuracyData): boolean {
  return data.status?.submitting ?? data.summary?.overall_primary_24h != null;
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
