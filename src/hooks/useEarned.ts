import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  combineEarnedTotals,
  type ClaimableEarnedInput,
  type EarnedClaim as BaseEarnedClaim,
  type EarnedKind,
  type EarnedTotals,
} from "../lib/earned.js";

/**
 * What this wallet has earned through FlareForward, from the Worker's
 * attributed paid history plus live claimable amounts supplied by the page.
 *
 * Paid logs and claimable balances are disjoint: claiming moves an epoch out
 * of claimable state in the same transaction that emits `RewardClaimed`.
 */
const EARNED_URL =
  (import.meta as ImportMeta & { env?: { VITE_EARNED_URL?: string } }).env
    ?.VITE_EARNED_URL ?? "/api/earned";
const RATE_HUNDREDTHS_NUMERATOR = 7_300_000n;
const RATE_HUNDREDTHS_DENOMINATOR = 7n;

export interface EarnedClaim extends BaseEarnedClaim {
  principalWei: bigint | null;
  rateAnnualizedPct: number | null;
}

export type { ClaimableEarnedInput, EarnedKind, EarnedTotals };
export { combineEarnedTotals, sumClaims } from "../lib/earned.js";

export function weightedRate(
  claims: Array<Pick<EarnedClaim, "amountWei" | "principalWei">>,
): number | null {
  let amount = 0n;
  let principal = 0n;
  for (const claim of claims) {
    if (claim.principalWei == null || claim.principalWei <= 0n) continue;
    amount += claim.amountWei;
    principal += claim.principalWei;
  }
  if (principal <= 0n) return null;
  const hundredths =
    (amount * RATE_HUNDREDTHS_NUMERATOR) /
    (principal * RATE_HUNDREDTHS_DENOMINATOR);
  return Number(hundredths) / 100;
}

export interface EarnedData {
  trackingStartUnix: number;
  /** True when the scan could not span the whole range — never show a total. */
  partial: boolean;
  epochsPerYear: number;
  ratesPartial: boolean;
  claimed: EarnedTotals;
  claimable: EarnedTotals;
  earned: EarnedTotals;
  claimableReady: boolean;
  claims: EarnedClaim[];
}

interface EarnedBaseData {
  trackingStartUnix: number;
  partial: boolean;
  epochsPerYear: number;
  ratesPartial: boolean;
  claims: EarnedClaim[];
  workerBondsTracked: boolean;
  workerBondsClaimedWei: bigint | null;
  workerBondsWei: bigint | null;
}

interface EarnedPayload {
  tracking_start_unix: number;
  partial: boolean;
  epochs_per_year?: number;
  rates_partial?: boolean;
  claims: Array<{
    block: number;
    unix: number;
    epoch: number | null;
    kind: EarnedKind;
    amount_wei: string;
    principal_wei?: string | null;
    rate_annualized_pct?: number | null;
  }>;
  claimable?: {
    bonds_tracked?: boolean;
    bonds_wei?: string | null;
  };
  claimed?: {
    bonds_wei?: string | null;
  };
  error?: string;
}

export function useEarned(
  address: string | undefined,
  claimableInput: ClaimableEarnedInput = {},
) {
  const query = useQuery({
    queryKey: ["earned", address],
    enabled: !!address,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<EarnedBaseData> => {
      const res = await fetch(`${EARNED_URL}?address=${address}`, {
        cache: "no-cache",
      });
      const data = (await res.json()) as EarnedPayload;
      if (!res.ok || data.error) {
        throw new Error(
          data.error ?? `Failed to load claim history (${res.status})`,
        );
      }
      return {
        trackingStartUnix: data.tracking_start_unix,
        partial: data.partial,
        epochsPerYear: data.epochs_per_year ?? 104.2857,
        ratesPartial: data.rates_partial === true,
        claims: (data.claims ?? []).map((c) => ({
          block: c.block,
          unix: c.unix,
          epoch: c.epoch,
          kind: c.kind,
          amountWei: BigInt(c.amount_wei),
          principalWei:
            c.principal_wei != null ? BigInt(c.principal_wei) : null,
          rateAnnualizedPct: c.rate_annualized_pct ?? null,
        })),
        workerBondsTracked: data.claimable?.bonds_tracked === true,
        workerBondsClaimedWei:
          data.claimed?.bonds_wei != null ? BigInt(data.claimed.bonds_wei) : null,
        workerBondsWei:
          data.claimable?.bonds_wei != null
            ? BigInt(data.claimable.bonds_wei)
            : null,
      };
    },
  });

  const data = useMemo<EarnedData | null>(() => {
    if (!query.data) return null;
    const composed = combineEarnedTotals(query.data.claims, {
      ...claimableInput,
      bondsClaimedWei:
        claimableInput.bondsClaimedWei ?? query.data.workerBondsClaimedWei ?? undefined,
      bondsTracked:
        claimableInput.bondsTracked ?? query.data.workerBondsTracked,
      bondsWei: claimableInput.bondsWei ?? query.data.workerBondsWei,
    });
    return {
      trackingStartUnix: query.data.trackingStartUnix,
      partial: query.data.partial,
      epochsPerYear: query.data.epochsPerYear,
      ratesPartial: query.data.ratesPartial,
      claims: query.data.claims,
      ...composed,
    };
  }, [
    claimableInput.bondsTracked,
    claimableInput.bondsClaimedWei,
    claimableInput.bondsWei,
    claimableInput.claimableReady,
    claimableInput.delegationWei,
    claimableInput.stakingWei,
    query.data,
  ]);

  return {
    data,
    isLoading: !!address && query.isLoading,
    error: query.error as Error | null,
  };
}
