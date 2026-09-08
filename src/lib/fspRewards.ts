/**
 * Splitting Flare Systems Protocol (FSP) rewards into "delegation" and
 * "staking" by claim type.
 *
 * Flare's V2 RewardManager pays BOTH delegation rewards and staking rewards
 * through one contract, one `getStateOfRewards()` read and one `claim()`
 * transaction. The SDK's `getClaimableFtsoReward()` sums every claim type, so
 * showing it under "Delegation" silently folded a member's staking rewards
 * into the delegation figure (bug seen 2026-09-08: 320 WFLR delegated showed
 * 1,779 FLR "delegation" claimable — 1,776 of it was MIRROR, i.e. staking).
 *
 * Claim types (RewardManager `ClaimType`):
 *   0 DIRECT  — paid straight to the beneficiary (delegation side)
 *   1 FEE     — provider fee (delegation side; 0 for members)
 *   2 WNAT    — WFLR delegation rewards
 *   3 MIRROR  — P-chain stake, mirrored to the C-chain (staking)
 *   4 CCHAIN  — C-chain staking (staking)
 *
 * The same mapping the worker uses for reward history (worker/earned.ts), so
 * "claimable now" and the history rows agree on what counts as staking.
 */

export const STAKING_CLAIM_TYPES: ReadonlySet<number> = new Set([3, 4]);

/** One row of RewardManager.getStateOfRewards, as the SDK returns it. */
export interface RewardStateRow {
  rewardEpochId: bigint;
  amount: bigint;
  claimType: number;
  initialised: boolean;
}

export interface ClaimableSplit {
  /** WNAT + DIRECT + FEE, in wei. */
  delegationWei: bigint;
  /** MIRROR + CCHAIN, in wei. */
  stakingWei: bigint;
  /** Everything the RewardManager will pay in one claim, in wei. */
  totalWei: bigint;
}

/**
 * Sum claimable rewards by kind, using the SDK's own epoch rule so the parts
 * always add up to what `getClaimableFtsoReward()` reports: epochs are read in
 * order, empty epochs are skipped, and reading stops at the first epoch with
 * any uninitialised entry (those rewards need a Merkle proof and are not
 * claimable by a plain claim).
 */
export function splitClaimableRewards(
  states: ReadonlyArray<ReadonlyArray<RewardStateRow>>
): ClaimableSplit {
  let delegationWei = 0n;
  let stakingWei = 0n;
  for (const epochStates of states) {
    if (epochStates.length === 0) continue;
    if (epochStates.some((s) => !s.initialised)) break;
    for (const s of epochStates) {
      if (STAKING_CLAIM_TYPES.has(Number(s.claimType))) {
        stakingWei += s.amount;
      } else {
        delegationWei += s.amount;
      }
    }
  }
  return { delegationWei, stakingWei, totalWei: delegationWei + stakingWei };
}
