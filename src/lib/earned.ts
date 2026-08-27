export type EarnedKind = "delegation" | "staking" | "bonds";

export interface EarnedClaim {
  block: number;
  unix: number;
  epoch: number | null;
  kind: EarnedKind;
  amountWei: bigint;
}

export interface ClaimableEarnedInput {
  delegationWei?: bigint;
  stakingWei?: bigint;
  /** Extra claimed bond rewards from RoyaltyDistributor cumulative state. */
  bondsClaimedWei?: bigint;
  bondsWei?: bigint | null;
  bondsTracked?: boolean;
  /** False means a required live claimable read is loading or failed. */
  claimableReady?: boolean;
}

export interface EarnedTotals {
  totalWei: bigint;
  delegationWei: bigint;
  stakingWei: bigint;
  /** Null means the source is not tracked yet, not that it earned zero. */
  bondsWei: bigint | null;
}

function totals(
  delegationWei: bigint,
  stakingWei: bigint,
  bondsWei: bigint | null,
): EarnedTotals {
  return {
    delegationWei,
    stakingWei,
    bondsWei,
    totalWei: delegationWei + stakingWei + (bondsWei ?? 0n),
  };
}

/** Sum claims within an inclusive unix range. */
export function sumClaims(
  claims: EarnedClaim[],
  sinceUnix = 0,
  kind?: EarnedKind,
  untilUnix = Number.POSITIVE_INFINITY,
): bigint {
  return claims.reduce((total, c) => {
    if (c.unix < sinceUnix || c.unix > untilUnix) return total;
    if (kind && c.kind !== kind) return total;
    return total + c.amountWei;
  }, 0n);
}

export function claimedEarnedTotals(
  claims: EarnedClaim[],
  sinceUnix = 0,
): EarnedTotals {
  return totals(
    sumClaims(claims, sinceUnix, "delegation"),
    sumClaims(claims, sinceUnix, "staking"),
    sumClaims(claims, sinceUnix, "bonds"),
  );
}

/**
 * Claimed logs and live claimable balances are disjoint by contract state:
 * claiming emits the log and removes that epoch from getStateOfRewards in the
 * same transaction. Keep both buckets visible so the UI can add them exactly
 * once and still show which part is already realized.
 */
export function combineEarnedTotals(
  claims: EarnedClaim[],
  claimable: ClaimableEarnedInput = {},
  sinceUnix = 0,
): {
  claimed: EarnedTotals;
  claimable: EarnedTotals;
  earned: EarnedTotals;
  claimableReady: boolean;
} {
  const claimedFromLogs = claimedEarnedTotals(claims, sinceUnix);
  const bondsTracked =
    claimable.bondsTracked === true ||
    claimable.bondsWei != null ||
    claimable.bondsClaimedWei != null ||
    (claimedFromLogs.bondsWei ?? 0n) > 0n;
  const claimed = totals(
    claimedFromLogs.delegationWei,
    claimedFromLogs.stakingWei,
    bondsTracked
      ? (claimedFromLogs.bondsWei ?? 0n) + (claimable.bondsClaimedWei ?? 0n)
      : null,
  );
  const claimableTotals = totals(
    claimable.delegationWei ?? 0n,
    claimable.stakingWei ?? 0n,
    bondsTracked ? (claimable.bondsWei ?? 0n) : null,
  );
  const earned = totals(
    claimed.delegationWei + claimableTotals.delegationWei,
    claimed.stakingWei + claimableTotals.stakingWei,
    bondsTracked
      ? (claimed.bondsWei ?? 0n) + (claimableTotals.bondsWei ?? 0n)
      : null,
  );

  return {
    claimed,
    claimable: claimableTotals,
    earned,
    claimableReady: claimable.claimableReady !== false,
  };
}
