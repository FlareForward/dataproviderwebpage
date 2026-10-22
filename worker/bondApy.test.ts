import assert from "node:assert/strict";
import test from "node:test";
import { parseUnits } from "viem";
import {
  BOND_STAKE_START,
  realizedBondApyPct,
} from "../src/lib/bondApy.js";

test("realized bond APY annualizes lifetime payouts since capital started earning", () => {
  const payout = parseUnits("47545", 18);
  const capital = parseUnits("4832500", 18);
  const asOf = new Date(Date.parse(BOND_STAKE_START) + 26 * 86_400_000);

  const apy = realizedBondApyPct(payout, capital, asOf);

  assert.ok(apy != null);
  assert.ok(Math.abs(apy - 13.812) < 0.001);
});

test("realized bond APY declines elapsed-time weighting and rejects unmeasured inputs", () => {
  const payout = parseUnits("100", 18);
  const capital = parseUnits("10000", 18);
  const afterTenDays = new Date(Date.parse(BOND_STAKE_START) + 10 * 86_400_000);
  const afterTwentyDays = new Date(Date.parse(BOND_STAKE_START) + 20 * 86_400_000);

  const early = realizedBondApyPct(payout, capital, afterTenDays);
  const late = realizedBondApyPct(payout, capital, afterTwentyDays);

  assert.ok(early != null && late != null && early > late);
  assert.equal(realizedBondApyPct(0n, capital, afterTenDays), null);
  assert.equal(realizedBondApyPct(payout, 0n, afterTenDays), null);
  assert.equal(
    realizedBondApyPct(payout, capital, new Date(BOND_STAKE_START)),
    null,
  );
});
