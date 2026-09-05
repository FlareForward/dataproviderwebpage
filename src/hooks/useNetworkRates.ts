import { useQuery } from "@tanstack/react-query";

const NETWORK_RATES_URL =
  (import.meta as ImportMeta & { env?: { VITE_NETWORK_RATES_URL?: string } })
    .env?.VITE_NETWORK_RATES_URL ?? "/api/network-rates";

export interface NetworkRateStream {
  network_weighted_median_pct: number;
  network_median_pct: number;
  n: number;
  flareforward_pct: number | null;
}

export interface NetworkRatesData {
  generated_at_unix: number;
  reward_epoch: number;
  epochs_per_year: number;
  delegation: NetworkRateStream;
  staking: NetworkRateStream;
}

export function useNetworkRates() {
  const query = useQuery<NetworkRatesData>({
    queryKey: ["network-rates"],
    queryFn: async () => {
      const res = await fetch(NETWORK_RATES_URL, {
        headers: { Accept: "application/json" },
      });
      const data = (await res.json()) as NetworkRatesData & { error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `network-rates ${res.status}`);
      }
      return data;
    },
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
