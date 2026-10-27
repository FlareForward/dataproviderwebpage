import assert from "node:assert/strict";
import test from "node:test";
import {
  mergePastStakes,
  parseStakeTx,
  parseTxInfo,
  walkStakeAncestry,
  type PastStake,
  type TxInfo,
} from "../src/lib/stakeHistory.js";

/**
 * Shape read live from the P-chain (platform.getTx, json) on 2026-10-27 for
 * the 170,665.46 FLR delegation that ended 2026-10-24 17:00 UTC.
 */
const DELEGATION_TX = {
  unsignedTx: {
    validator: {
      nodeID: "NodeID-DqtFZusCw713o96Hx29iHKUhFyZ4eBDpw",
      start: 1791644040,
      end: 1792861200,
      weight: 170665460000000,
    },
    stake: [{ output: { amount: 170665460000000 } }],
    rewardsOwner: { addresses: ["P-flare1mdqpf29px95crchp9ytyashue2g4yxqqndcjxw"] },
  },
};

test("reads a delegation transaction", () => {
  const s = parseStakeTx("tx1", DELEGATION_TX);
  assert.ok(s);
  assert.equal(s.type, "delegator");
  assert.equal(s.nodeId, "NodeID-DqtFZusCw713o96Hx29iHKUhFyZ4eBDpw");
  assert.equal(s.amount, 170_665_460_000_000n * 1_000_000_000n);
  assert.equal(s.endTime, 1792861200n);
});

test("a validator transaction is told apart by delegation shares", () => {
  const tx = {
    unsignedTx: { ...DELEGATION_TX.unsignedTx, delegationShares: 100000 },
  };
  assert.equal(parseStakeTx("tx2", tx)?.type, "validator");
});

test("transfers and exports are not stakes", () => {
  const exportTx = { unsignedTx: { outputs: [], destinationChain: "x", stake: null } };
  assert.equal(parseStakeTx("tx3", exportTx), null);
  assert.equal(parseStakeTx("tx4", null), null);
});

const mk = (txId: string, end: number): PastStake => ({
  txId,
  nodeId: "NodeID-x",
  amount: 1n,
  startTime: 1n,
  endTime: BigInt(end),
  type: "delegator",
});

test("history keeps ended stakes only, one per transaction, newest first", () => {
  const now = 2000n;
  const merged = mergePastStakes(
    [
      [mk("a", 1000), mk("live", 3000)],
      [mk("a", 1000), mk("b", 1500)],
    ],
    now
  );
  assert.deepEqual(
    merged.map((s) => s.txId),
    ["b", "a"]
  );
});

test("a spent stake is found through the transaction that spent it", async () => {
  // Shape of the 2026-10 case: the export that moved the returned FLR names
  // both stake transactions as inputs, and a stake funds the next one.
  const exportTx = { unsignedTx: { inputs: [{ txID: "stakeB" }, { txID: "stakeA" }] } };
  assert.deepEqual(parseTxInfo("exp", exportTx).parents, ["stakeB", "stakeA"]);

  const graph: Record<string, TxInfo> = {
    exp: { stake: null, parents: ["stakeB", "stakeA"] },
    stakeB: { stake: mk("stakeB", 1500), parents: ["stakeOld"] },
    stakeA: { stake: mk("stakeA", 1400), parents: [] },
    stakeOld: { stake: mk("stakeOld", 900), parents: [] },
  };
  const budget = { remaining: 10 };
  const found = await walkStakeAncestry(["exp"], async (id) => graph[id], budget);
  assert.deepEqual(
    found.map((s) => s.txId).sort(),
    ["stakeA", "stakeB", "stakeOld"]
  );
});

test("the walk stops at its budget and never loops", async () => {
  const graph: Record<string, TxInfo> = {
    a: { stake: null, parents: ["b"] },
    b: { stake: null, parents: ["a", "c"] },
    c: { stake: mk("c", 10), parents: [] },
  };
  const budget = { remaining: 2 };
  let calls = 0;
  const found = await walkStakeAncestry(
    ["a"],
    async (id) => {
      calls++;
      budget.remaining--;
      return graph[id];
    },
    budget,
    1
  );
  assert.equal(calls, 2);
  assert.equal(found.length, 0);
});
