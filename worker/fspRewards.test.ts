import assert from "node:assert/strict";
import test from "node:test";
import { splitClaimableRewards, type RewardStateRow } from "../src/lib/fspRewards.js";

const row = (
  epoch: number,
  claimType: number,
  amount: bigint,
  initialised = true
): RewardStateRow => ({ rewardEpochId: BigInt(epoch), claimType, amount, initialised });

/**
 * Read live from RewardManager 0xC8f55c5a… for wallet 0xC1c5…FE3C6 on
 * 2026-09-08 — the exact state behind the reported bug. WNAT (2) is the tiny
 * delegation share; MIRROR (3) is the staking share that was being shown as
 * delegation.
 */
const LIVE_STATE: RewardStateRow[][] = [
  [row(427, 2, 1595846851689918189n), row(427, 3, 322739742994860830035n)],
  [row(428, 2, 1584640005357746434n), row(428, 3, 328805606579767528497n)],
  [row(429, 2, 100497077257009047n), row(429, 3, 564528792869276015249n)],
  [row(430, 2, 99691032283458581n), row(430, 3, 560000943817973819212n)],
];

test("MIRROR rewards land under staking, WNAT under delegation", () => {
  const split = splitClaimableRewards(LIVE_STATE);
  assert.equal(split.delegationWei, 3380674966588132251n);
  assert.equal(split.stakingWei, 1776075086261878192993n);
  // Parts add up to what the SDK's getClaimableFtsoReward() reports.
  assert.equal(split.totalWei, split.delegationWei + split.stakingWei);
  assert.equal(split.totalWei, 1779455761228466325244n);
});

test("DIRECT and FEE count as delegation; CCHAIN counts as staking", () => {
  const split = splitClaimableRewards([
    [row(1, 0, 10n), row(1, 1, 20n), row(1, 2, 30n), row(1, 3, 40n), row(1, 4, 50n)],
  ]);
  assert.equal(split.delegationWei, 60n);
  assert.equal(split.stakingWei, 90n);
});

test("stops at the first epoch with an uninitialised entry, like the SDK", () => {
  const split = splitClaimableRewards([
    [row(1, 2, 5n), row(1, 3, 100n)],
    [], // empty epochs are skipped, not terminal
    [row(3, 2, 7n), row(3, 3, 200n, false)],
    [row(4, 2, 9n), row(4, 3, 300n)],
  ]);
  assert.equal(split.delegationWei, 5n);
  assert.equal(split.stakingWei, 100n);
});

test("empty state is all zeros", () => {
  assert.deepEqual(splitClaimableRewards([]), {
    delegationWei: 0n,
    stakingWei: 0n,
    totalWei: 0n,
  });
});
