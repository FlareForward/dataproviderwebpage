/**
 * Snapshot / accumulate measured FlareForward BOND yield history.
 *
 * Why this exists: the Flare Systems Explorer only exposes the *latest* reward
 * epoch's reward figures (`entityrewardslatest`) — there is no historical
 * per-epoch rewards endpoint. So nobody, including us, can look backwards at
 * what a validator bond actually earned. Post-FIP.16 that is precisely the
 * number that matters, and it is unmeasured. This job builds that record
 * forward: one append-only row per reward epoch, from the day it starts.
 *
 * It is the evidence engine behind the FlareForward Bonds promise: we publish
 * MEASURED numbers, never projections. Run it at least once per reward epoch
 * (epochs are 3.5 days; hourly or daily is comfortable — rows are keyed by
 * reward_epoch and updated in place until that epoch closes).
 *
 * RATE SEMANTICS — verified against live epoch 422 data, three identities that
 * hold to full float precision. Do not "simplify" these without re-deriving:
 *   self_bond_earnings = self_bond      x reward_rate_pure
 *   pure               = delegated_stake x reward_rate_pure
 *   reward_rate_total_mirror = reward_rate_mirror + reward_rate_pure
 *
 * The consequence matters: `self_bond_earnings / self_bond` is ONLY the `pure`
 * component (3.60% annualized at epoch 422) — it is NOT the bond's return. The
 * bond's total measured rate is `reward_rate_total_mirror` (21.67% at epoch
 * 422), which is the staking component plus the pure component. Reporting the
 * former as "the bond's yield" understates it ~6x. Note also that the portal's
 * headline "Staking APY" uses `reward_rate_mirror` alone (18.06%), so it reads
 * lower than the bond's total rate.
 *
 * Metrics per epoch (canonical Explorer fields, no modelling):
 *   - self_bond_flr / delegated_stake_flr -> the bond's size that epoch
 *   - bond_rate_epoch (reward_rate_total_mirror) -> THE headline measured rate
 *   - staking_rate_epoch / pure_rate_epoch       -> its two components
 *   - provider_income_flr -> self_bond_earnings + total_fee, the pool that
 *                            holder distributions are actually funded from
 *
 * Deliberately NOT stored: any annualized/projected figure. Annualization is a
 * presentation choice made downstream and clearly labelled; the log holds only
 * what was actually observed.
 *
 * Storage is a single JSON file (the "light DB"): append-only, keyed by
 * reward_epoch — same shape and publishing pattern as
 * `snapshot-performance.mjs`, so the public history is a git history and any
 * revision to a past row is visible to anyone.
 *
 * Env:
 *   EXPLORER_BASE  Flare Systems Explorer backend
 *   IDENTITY       entity identity address (default: FlareForward)
 *   HISTORY_URL    existing history to extend (default: public repo)
 *   OUT_PATH       where to write (default: ./bond-yield-history.json)
 */

import { writeFile } from "node:fs/promises";

const EXPLORER_BASE =
  process.env.EXPLORER_BASE ??
  "https://flare-systems-explorer-backend.flare.network/api/v0";
const IDENTITY =
  process.env.IDENTITY ?? "0x1FBB55a1877817A0f90cAE60c1ab22FC94f97110";
const HISTORY_URL =
  process.env.HISTORY_URL ??
  "https://raw.githubusercontent.com/FlareForward/ftso-accuracy-data/bond-yield/bond-yield-history.json";
const OUT_PATH = process.env.OUT_PATH ?? "./bond-yield-history.json";

/** P-chain stake amounts are 9-decimal; reward amounts are 18-decimal. */
const STAKE_DECIMALS = 1e9;
const REWARD_DECIMALS = 1e18;

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

function num(raw, decimals) {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return n / decimals;
}

/** Existing history, or an empty log on first run / unreachable source. */
async function loadHistory() {
  try {
    const data = await getJson(HISTORY_URL);
    if (Array.isArray(data?.epochs)) return data.epochs;
  } catch {
    // First run, or the published log isn't reachable — start the record here.
  }
  return [];
}

async function findValidatorRow(nodeIds) {
  const first = await getJson(`${EXPLORER_BASE}/validators?limit=100&offset=0`);
  const count = first.count ?? 0;
  let row = first.results?.find((r) => r.node_id && nodeIds.has(r.node_id));
  for (let off = 100; !row && off < count && off <= 500; off += 100) {
    const pg = await getJson(`${EXPLORER_BASE}/validators?limit=100&offset=${off}`);
    row = pg.results?.find((r) => r.node_id && nodeIds.has(r.node_id));
  }
  return row;
}

async function main() {
  const entity = await getJson(`${EXPLORER_BASE}/entity?query=${IDENTITY}`);
  const e = entity.results?.[0];
  if (!e) throw new Error("entity not found");

  const rewards = e.entityrewardslatest;
  if (!rewards || typeof rewards.reward_epoch !== "number") {
    throw new Error("no latest reward epoch on entity");
  }

  const nodeIds = new Set(e.denormalizedentity?.node_ids ?? []);
  const row = await findValidatorRow(nodeIds);

  const selfBond = num(row?.self_bond, STAKE_DECIMALS);
  const delegatedStake = num(row?.delegated, STAKE_DECIMALS);
  const selfBondEarnings = num(rewards.self_bond_earnings, REWARD_DECIMALS);
  const totalFee = num(rewards.total_fee, REWARD_DECIMALS);

  const record = {
    reward_epoch: rewards.reward_epoch,
    observed_at_unix: Math.floor(Date.now() / 1000),
    self_bond_flr: selfBond,
    delegated_stake_flr: delegatedStake,
    total_stake_flr:
      selfBond != null && delegatedStake != null ? selfBond + delegatedStake : null,
    self_bond_earnings_flr: selfBondEarnings,
    staking_rewards_flr: num(rewards.mirror, REWARD_DECIMALS),
    delegation_rewards_flr: num(rewards.wnat, REWARD_DECIMALS),
    fees_flr: totalFee,
    // The pool holder distributions are funded from: what the bonded capital
    // itself earned, plus the provider fees that bond capacity makes possible.
    provider_income_flr:
      selfBondEarnings != null && totalFee != null ? selfBondEarnings + totalFee : null,
    // Explorer's canonical per-epoch rates (fractions of stake, NOT annualized
    // and NOT projections — these are what the epoch actually paid).
    bond_rate_epoch:
      typeof rewards.reward_rate_total_mirror === "number"
        ? rewards.reward_rate_total_mirror
        : null,
    staking_rate_epoch:
      typeof rewards.reward_rate_mirror === "number" ? rewards.reward_rate_mirror : null,
    pure_rate_epoch:
      typeof rewards.reward_rate_pure === "number" ? rewards.reward_rate_pure : null,
    delegation_rate_epoch:
      typeof rewards.reward_rate_wnat === "number" ? rewards.reward_rate_wnat : null,
  };

  const history = await loadHistory();
  const idx = history.findIndex((r) => r.reward_epoch === record.reward_epoch);
  if (idx >= 0) {
    // The current epoch is still accruing — refresh it in place until it closes.
    history[idx] = { ...history[idx], ...record };
  } else {
    history.push(record);
  }
  history.sort((a, b) => a.reward_epoch - b.reward_epoch);

  const out = {
    updated_at_unix: Math.floor(Date.now() / 1000),
    identity_address: IDENTITY,
    note:
      "Measured per-reward-epoch bond performance, appended forward. The Flare Systems Explorer retains only the latest epoch, so this log is the record. No projections are stored.",
    epochs: history,
  };
  await writeFile(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
  const pct = (r) => (r != null ? (r * 100).toFixed(4) + "%" : "?");
  console.log(
    `epoch ${record.reward_epoch}: bond ${record.self_bond_flr ?? "?"} FLR | ` +
      `bond rate ${pct(record.bond_rate_epoch)} this epoch ` +
      `(staking ${pct(record.staking_rate_epoch)} + pure ${pct(record.pure_rate_epoch)}) | ` +
      `provider income ${record.provider_income_flr?.toFixed(2) ?? "?"} FLR ` +
      `-> ${history.length} epochs logged, wrote ${OUT_PATH}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
