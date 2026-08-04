import { useQuery } from "@tanstack/react-query";
import type { RewardsData } from "../lib/rewards";

/**
 * FlareForward's rewards/economics payload, sourced from the Flare Systems
 * Explorer indexer via the same-origin Cloudflare Worker proxy
 * (worker/index.ts, `/api/rewards`). Override with VITE_REWARDS_URL for local
 * dev (point at a `wrangler dev` origin or a deployed worker).
 */
const REWARDS_URL = import.meta.env.VITE_REWARDS_URL ?? "/api/rewards";

export function useRewards() {
  const query = useQuery({
    queryKey: ["rewards"],
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<RewardsData> => {
      const res = await fetch(REWARDS_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error(`Failed to load rewards (${res.status})`);
      const data = (await res.json()) as RewardsData & { error?: string };
      if (data.error) throw new Error(data.error);
      return data;
    },
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
