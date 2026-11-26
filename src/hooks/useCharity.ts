import { useQuery } from "@tanstack/react-query";

/** The charity Safe's live totals, from the worker's `/api/charity`. */
export type CharityData = {
  address: string;
  received_flr: number | null;
  payouts: number | null;
  last_received_unix: number | null;
  balance_flr: number | null;
};

const CHARITY_URL = import.meta.env.VITE_CHARITY_URL ?? "/api/charity";

export function useCharity() {
  const query = useQuery({
    queryKey: ["charity"],
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<CharityData> => {
      const res = await fetch(CHARITY_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error(`Failed to load charity totals (${res.status})`);
      return (await res.json()) as CharityData;
    },
  });
  return { data: query.data ?? null };
}
