import { useQuery } from "@tanstack/react-query";

/**
 * Per-provider FTSO accuracy + availability, sourced from the Flare Systems
 * Explorer's canonical indexer — the same figures shown on
 * flare-systems-explorer.flare.network for the Flare Forward entity.
 *
 * The Explorer backend sends no CORS headers, so the browser can't call it
 * directly; a same-origin Cloudflare Worker (worker/index.ts) proxies it at
 * `/api/ftso`, normalizing the Explorer's 0..1 fractions into percentages and
 * flattening its `/entity/{id}/ftso` + `/entity/{id}/feeds` endpoints into one
 * payload. Override with VITE_ACCURACY_URL for local dev (e.g. point it at a
 * deployed worker, or a `wrangler dev` origin).
 */
const ACCURACY_URL = import.meta.env.VITE_ACCURACY_URL ?? "/api/ftso";

/**
 * A `null` metric means "no data for this window" — never "0%". The Explorer
 * reports availability + primary/secondary reward-band landing rates as
 * percentages after normalization in the proxy.
 */
export interface AccuracyWindow {
  /** % of expected voting rounds the provider was available (submitting). */
  availability: number | null;
  /** % of rounds landing inside the tight (primary) reward band. */
  primary: number | null;
  /** % of rounds landing inside the wider (secondary) reward band. */
  secondary: number | null;
}

export interface AccuracyEpoch extends AccuracyWindow {
  reward_epoch: number;
}

export interface AccuracyFeed extends AccuracyWindow {
  /** Human-readable pair, e.g. "BTC/USD". */
  feed: string;
  /** 21-byte feed id (hex), e.g. "0x014254432f5553440000…". */
  feed_id: string;
  /** Whether this feed is currently part of the rewarded set. */
  is_rewarded: boolean;
  /** Handle of whoever authored the algorithm live on this feed (owner || default). */
  owner?: string | null;
}

export interface AccuracyData {
  generated_at_unix: number;
  identity_address: string;
  feeds_count: number;
  last_6h: AccuracyWindow;
  last_24h: AccuracyWindow;
  /** Most recent reward epochs (the Explorer exposes the latest few). */
  per_reward_epoch: AccuracyEpoch[];
  feeds: AccuracyFeed[];
}

/**
 * Whether the provider is actively participating. The Explorer reflects real
 * on-chain participation, so a registration gap surfaces as null/zero
 * availability + band rates; in that case we show a paused notice instead of
 * presenting stale figures as live.
 */
export function isSubmitting(data: AccuracyData): boolean {
  const a = data.last_24h.availability ?? data.last_6h.availability;
  const p = data.last_24h.primary ?? data.last_6h.primary;
  return (a != null && a > 0) || p != null;
}

export function useAccuracy() {
  const query = useQuery({
    queryKey: ["ftso-accuracy"],
    // Match the proxy's edge cache; refetch quietly in the background so a
    // long-open tab stays current without hammering the Explorer.
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
