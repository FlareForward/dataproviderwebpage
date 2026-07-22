import { useQuery } from "@tanstack/react-query";

/**
 * Flare Forward's performance history. A scheduled job (see
 * .github/workflows/snapshot-performance.yml) snapshots the public
 * ftso-accuracy.json into an append-only time-series on this repo's `data`
 * branch — band accuracy + submissions backfilled from the accuracy feed's
 * verified epochs[], uptime accumulated forward from status snapshots. Same
 * cross-origin raw-URL pattern as useAccuracy / useProviders. Override with
 * VITE_PERFORMANCE_URL for local/preview (e.g. `/ftso-performance-history.json`
 * served from public/).
 *
 * Per the box's convention, a `null` metric means "no data for this window",
 * never "0%": uptime is null for epochs before the job started, and band
 * accuracy is null during on-chain registration gaps.
 */
const PERFORMANCE_URL =
  import.meta.env.VITE_PERFORMANCE_URL ??
  "https://raw.githubusercontent.com/FlareForward/dataproviderwebpage/data/ftso-performance-history.json";

export interface PerformanceProvider {
  name: string;
  identity_address: string;
  delegation_address: string;
}

const EMPTY_PROVIDER: PerformanceProvider = {
  name: "Flare Forward",
  identity_address: "",
  delegation_address: "",
};

export interface PerformanceStatus {
  submitting: boolean;
  reward_epoch_current: number | null;
  reward_epoch_registered: boolean;
  gap_reason: string | null;
  expected_resume_utc: string | null;
}

/**
 * One sample per reward epoch (~3.5 days on Flare). The frontend rolls these
 * up into weekly / monthly / yearly buckets. Metric fields are nullable: null
 * means "no data", never 0%.
 */
export interface PerformancePoint {
  /** UTC unix seconds marking the start of this sample's reward epoch. */
  bucket_start_unix: number;
  reward_epoch: number;
  /** % of this epoch the provider was registered and submitting. */
  uptime_pct: number | null;
  /** Voting rounds the provider actually submitted (revealed) in this epoch. */
  submissions_count: number | null;
  /** Voting rounds the provider was expected to submit in this epoch. */
  submissions_total: number | null;
  /** % of rounds landing inside the tight (primary) reward band. */
  band_primary_pct: number | null;
  /** % of rounds landing inside the wider (secondary) reward band. */
  band_secondary_pct: number | null;
}

export interface PerformanceData {
  generated_at_unix: number;
  schema_version?: number;
  source?: string;
  provider: PerformanceProvider;
  status?: PerformanceStatus | null;
  series: PerformancePoint[];
}

export type Granularity = "week" | "month" | "year";

/**
 * A single chart-ready row after rolling raw points into a bucket. Metrics are
 * nullable so gaps (no data) render as line breaks rather than drops to 0.
 */
export interface PerformanceBucket {
  /** Sortable UTC-unix key for the start of the bucket. */
  key: number;
  /** Short axis label, e.g. "2026-W12", "Mar 2026", "2026". */
  label: string;
  uptime: number | null;
  /** Submission participation rate as a percentage. */
  submissions: number | null;
  bandPrimary: number | null;
  bandSecondary: number | null;
}

/** ISO-8601 week number (1..53) for a UTC date. */
function isoWeek(date: Date): { year: number; week: number } {
  // Copy so we don't mutate the input; work in UTC.
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  // Thursday of the current week decides the ISO year.
  const day = d.getUTCDay() || 7; // Sun=0 -> 7
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return { year, week };
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Bucket id + label + representative sort key for a point at a granularity. */
function bucketFor(
  point: PerformancePoint,
  granularity: Granularity
): { id: string; label: string; key: number } {
  const date = new Date(point.bucket_start_unix * 1000);
  if (granularity === "year") {
    const year = date.getUTCFullYear();
    return {
      id: `${year}`,
      label: `${year}`,
      key: Date.UTC(year, 0, 1) / 1000,
    };
  }
  if (granularity === "month") {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    return {
      id: `${year}-${month}`,
      label: `${MONTHS[month]} ${year}`,
      key: Date.UTC(year, month, 1) / 1000,
    };
  }
  const { year, week } = isoWeek(date);
  return {
    id: `${year}-W${week}`,
    label: `${year}-W${String(week).padStart(2, "0")}`,
    key: Date.UTC(year, 0, 1 + (week - 1) * 7) / 1000,
  };
}

interface BucketAcc {
  label: string;
  key: number;
  /** Weighted sums per metric, tracked independently so a null in one metric
   *  doesn't drop the whole bucket. weight = rounds observed for band metrics. */
  uptimeSum: number;
  uptimeWeight: number;
  primarySum: number;
  primaryWeight: number;
  secondarySum: number;
  secondaryWeight: number;
  subCount: number;
  subTotal: number;
}

/** Weighted mean, or null when no (non-null) samples contributed. */
function mean(sum: number, weight: number): number | null {
  return weight > 0 ? sum / weight : null;
}

/**
 * Roll per-epoch points into weekly / monthly / yearly buckets. Null metrics
 * are skipped (never counted as 0). Band rates are averaged weighting by rounds
 * observed; uptime is an equal-weight epoch mean; submissions is a true
 * participation rate sum(count) / sum(total). A bucket's metric is null when no
 * epoch in it carried data for that metric.
 */
export function aggregate(
  series: PerformancePoint[],
  granularity: Granularity
): PerformanceBucket[] {
  const groups = new Map<string, BucketAcc>();

  for (const point of series) {
    const { id, label, key } = bucketFor(point, granularity);
    let g = groups.get(id);
    if (!g) {
      g = {
        label,
        key,
        uptimeSum: 0,
        uptimeWeight: 0,
        primarySum: 0,
        primaryWeight: 0,
        secondarySum: 0,
        secondaryWeight: 0,
        subCount: 0,
        subTotal: 0,
      };
      groups.set(id, g);
    }
    const bandWeight =
      point.submissions_total && point.submissions_total > 0
        ? point.submissions_total
        : 1;
    if (point.uptime_pct !== null) {
      g.uptimeSum += point.uptime_pct;
      g.uptimeWeight += 1;
    }
    if (point.band_primary_pct !== null) {
      g.primarySum += point.band_primary_pct * bandWeight;
      g.primaryWeight += bandWeight;
    }
    if (point.band_secondary_pct !== null) {
      g.secondarySum += point.band_secondary_pct * bandWeight;
      g.secondaryWeight += bandWeight;
    }
    if (point.submissions_count !== null && point.submissions_total !== null) {
      g.subCount += point.submissions_count;
      g.subTotal += point.submissions_total;
    }
  }

  return [...groups.values()]
    .map((g) => ({
      key: g.key,
      label: g.label,
      uptime: mean(g.uptimeSum, g.uptimeWeight),
      submissions: g.subTotal > 0 ? (g.subCount / g.subTotal) * 100 : null,
      bandPrimary: mean(g.primarySum, g.primaryWeight),
      bandSecondary: mean(g.secondarySum, g.secondaryWeight),
    }))
    .sort((a, b) => a.key - b.key);
}

export function usePerformanceHistory() {
  const query = useQuery({
    queryKey: ["ftso-performance-history"],
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<PerformanceData> => {
      const res = await fetch(PERFORMANCE_URL, { cache: "no-cache" });
      // The publisher may not have shipped the feed yet — treat a missing file
      // as "no data published" (friendly empty state) rather than a hard error.
      if (res.status === 404) {
        return { generated_at_unix: 0, provider: EMPTY_PROVIDER, series: [] };
      }
      if (!res.ok)
        throw new Error(`Failed to load performance history (${res.status})`);
      return (await res.json()) as PerformanceData;
    },
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
