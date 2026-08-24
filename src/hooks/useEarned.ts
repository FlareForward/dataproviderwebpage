import { useQuery } from "@tanstack/react-query";

/**
 * What this wallet has actually been PAID, from the Worker's `/api/earned`.
 *
 * Claimable figures go to zero the moment someone claims, so they can never
 * answer "what has this wallet earned". Paid history lives only in
 * `RewardClaimed` logs; the Worker reads them. Tracking runs FORWARD from the
 * block the feature shipped — nothing before it is claimed to be covered, and
 * `trackingStartUnix` is what the UI must date the total from.
 */
const EARNED_URL = import.meta.env.VITE_EARNED_URL ?? "/api/earned";

export type EarnedKind = "delegation" | "staking";

export interface EarnedClaim {
  block: number;
  unix: number;
  epoch: number | null;
  kind: EarnedKind;
  amountWei: bigint;
}

export interface EarnedData {
  trackingStartUnix: number;
  /** True when the scan could not span the whole range — never show a total. */
  partial: boolean;
  claims: EarnedClaim[];
}

interface EarnedPayload {
  tracking_start_unix: number;
  partial: boolean;
  claims: Array<{
    block: number;
    unix: number;
    epoch: number | null;
    kind: EarnedKind;
    amount_wei: string;
  }>;
  error?: string;
}

export function useEarned(address: string | undefined) {
  const query = useQuery({
    queryKey: ["earned", address],
    enabled: !!address,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<EarnedData> => {
      const res = await fetch(`${EARNED_URL}?address=${address}`, {
        cache: "no-cache",
      });
      const data = (await res.json()) as EarnedPayload;
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `Failed to load claim history (${res.status})`);
      }
      return {
        trackingStartUnix: data.tracking_start_unix,
        partial: data.partial,
        claims: (data.claims ?? []).map((c) => ({
          block: c.block,
          unix: c.unix,
          epoch: c.epoch,
          kind: c.kind,
          amountWei: BigInt(c.amount_wei),
        })),
      };
    },
  });

  return {
    data: query.data ?? null,
    isLoading: !!address && query.isLoading,
    error: query.error as Error | null,
  };
}

/** Sum the claims at or after `sinceUnix`. Pass 0 for everything tracked. */
export function sumClaims(claims: EarnedClaim[], sinceUnix = 0): bigint {
  return claims.reduce(
    (total, c) => (c.unix >= sinceUnix ? total + c.amountWei : total),
    0n
  );
}
