/**
 * `/api/bond-yield` — measured validator-bond performance for FlareForward
 * Bonds. Serves the append-only log written by `scripts/snapshot-bond-yield.mjs`
 * plus the live current epoch, bucketed into weeks.
 *
 * Everything here is MEASURED. The only derived figure is annualization, which
 * is a labelled restatement of an observed epoch rate (x 365/3.5), never a
 * forecast. No projections are computed or served.
 *
 * Rate semantics (verified live, epoch 422 — see snapshot-bond-yield.mjs):
 *   reward_rate_total_mirror = reward_rate_mirror + reward_rate_pure
 * `reward_rate_total_mirror` is THE bond rate. Do not substitute
 * `self_bond_earnings / self_bond` — that is only the pure component and
 * understates the bond ~6x.
 */

const EXPLORER_BASE =
  "https://flare-systems-explorer-backend.flare.network/api/v0";
const IDENTITY_ADDRESS = "0x1FBB55a1877817A0f90cAE60c1ab22FC94f97110";

/** Published measurement log. Its git history is the audit trail. */
const HISTORY_URL =
  "https://raw.githubusercontent.com/FlareForward/ftso-accuracy-data/bond-yield/bond-yield-history.json";

/** Flare reward epochs are 3.5 days -> 2 per week, ~104.3 per year. */
const EPOCHS_PER_WEEK = 2;
const EPOCHS_PER_YEAR = 365 / 3.5;

const CACHE_SECONDS = 1800;

/**
 * Epoch the current bond opened, if we want weeks counted forward from a bond
 * open rather than trailing from now. null = trailing mode (week 1 is the most
 * recent two epochs). Set this when a Bonds lot closes and its capital bonds.
 */
const BOND_OPEN_EPOCH: number | null = null;

const REWARD_DECIMALS = 1e18;

interface EpochRow {
  reward_epoch: number;
  observed_at_unix?: number;
  self_bond_flr?: number | null;
  delegated_stake_flr?: number | null;
  total_stake_flr?: number | null;
  self_bond_earnings_flr?: number | null;
  fees_flr?: number | null;
  provider_income_flr?: number | null;
  delegation_fee_pct?: number | null;
  bond_rate_epoch?: number | null;
  delegation_rate_epoch?: number | null;
  staking_rate_epoch?: number | null;
  pure_rate_epoch?: number | null;
}

function flr(raw: unknown, decimals: number): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return n / decimals;
}

async function getJson(url: string, ttl = 300): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cf: { cacheTtl: ttl, cacheEverything: true },
  } as RequestInit);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

/** The published log; empty (not an error) before the first snapshot lands. */
async function loadHistory(): Promise<EpochRow[]> {
  try {
    const data = (await getJson(HISTORY_URL)) as { epochs?: EpochRow[] };
    return Array.isArray(data?.epochs) ? data.epochs : [];
  } catch {
    return [];
  }
}

/** Live current epoch, read the same way the snapshot job records it. */
async function loadCurrent(): Promise<EpochRow | null> {
  try {
    const entity = (await getJson(
      `${EXPLORER_BASE}/entity?query=${IDENTITY_ADDRESS}`,
      120,
    )) as { results?: Array<Record<string, any>> };
    const e = entity.results?.[0];
    const r = e?.entityrewardslatest;
    if (!r || typeof r.reward_epoch !== "number") return null;

    const selfBondEarnings = flr(r.self_bond_earnings, REWARD_DECIMALS);
    const fees = flr(r.total_fee, REWARD_DECIMALS);
    const policy = e?.denormalizedsigningpolicy ?? {};

    return {
      reward_epoch: r.reward_epoch,
      observed_at_unix: Math.floor(Date.now() / 1000),
      self_bond_earnings_flr: selfBondEarnings,
      fees_flr: fees,
      // `total_fee` already INCLUDES self_bond_earnings (verified identity:
      // total_fee = fee + pure_fee + self_bond_earnings). Adding them
      // double-counts the self-bond earnings.
      provider_income_flr: fees,
      total_stake_flr: flr(policy.staking_weight, REWARD_DECIMALS),
      delegation_fee_pct:
        typeof policy.delegation_fee_bips === "number" ? policy.delegation_fee_bips / 100 : null,
      bond_rate_epoch:
        typeof r.reward_rate_total_mirror === "number" ? r.reward_rate_total_mirror : null,
      staking_rate_epoch:
        typeof r.reward_rate_mirror === "number" ? r.reward_rate_mirror : null,
      pure_rate_epoch:
        typeof r.reward_rate_pure === "number" ? r.reward_rate_pure : null,
    };
  } catch {
    return null;
  }
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

interface Bucket {
  label: string;
  epochs: number[];
  epoch_count: number;
  /** Mean observed per-epoch bond rate across the bucket (fraction). */
  bond_rate_epoch_mean: number | null;
  /** The same rate restated annually — a labelled restatement, not a forecast. */
  bond_rate_annualized_pct: number | null;
  /** Sum of what the provider actually took in over the bucket. */
  provider_income_flr: number | null;
}

/**
 * An epoch counts as measured once it has actually paid something out.
 *
 * The live epoch reports a rate and income of exactly 0 until it settles, and
 * `typeof 0 === "number"`, so it used to pass straight into the averages as a
 * genuine observation of zero — halving the published rate. A zero on both
 * measures is indistinguishable from "no data yet", so it is excluded rather
 * than averaged in. This only ever drops epochs that paid nothing at all; a
 * bad-but-real epoch still lands in the record, good or not.
 */
function isMeasured(r: EpochRow): boolean {
  const rate = r.bond_rate_epoch;
  const income = r.provider_income_flr;
  return (typeof rate === "number" && rate > 0) || (typeof income === "number" && income > 0);
}

function bucketOf(label: string, allRows: EpochRow[]): Bucket {
  const rows = allRows.filter(isMeasured);
  const rates = rows
    .map((r) => r.bond_rate_epoch)
    .filter((v): v is number => typeof v === "number");
  const incomes = rows
    .map((r) => r.provider_income_flr)
    .filter((v): v is number => typeof v === "number");
  const m = mean(rates);
  return {
    label,
    epochs: rows.map((r) => r.reward_epoch),
    epoch_count: rows.length,
    bond_rate_epoch_mean: m,
    bond_rate_annualized_pct: m != null ? m * EPOCHS_PER_YEAR * 100 : null,
    provider_income_flr: incomes.length
      ? incomes.reduce((a, b) => a + b, 0)
      : null,
  };
}

export async function handleBondYield(): Promise<Response> {
  const [history, current] = await Promise.all([loadHistory(), loadCurrent()]);

  // Merge the live epoch over any logged copy of it — the current epoch is
  // still accruing, so the freshest read wins.
  const byEpoch = new Map<number, EpochRow>();
  for (const row of history) byEpoch.set(row.reward_epoch, row);
  if (current) {
    byEpoch.set(current.reward_epoch, {
      ...(byEpoch.get(current.reward_epoch) ?? {}),
      ...current,
    });
  }
  const rows = [...byEpoch.values()].sort((a, b) => a.reward_epoch - b.reward_epoch);

  const weeks: Bucket[] = [];
  if (rows.length) {
    if (BOND_OPEN_EPOCH != null) {
      // Weeks counted FORWARD from the bond opening — the "first weeks of a
      // fresh bond" view.
      const since = rows.filter((r) => r.reward_epoch >= BOND_OPEN_EPOCH);
      for (let w = 0; w * EPOCHS_PER_WEEK < since.length && w < 8; w++) {
        weeks.push(
          bucketOf(`Week ${w + 1}`, since.slice(w * EPOCHS_PER_WEEK, (w + 1) * EPOCHS_PER_WEEK)),
        );
      }
    } else {
      // Trailing view: week 1 = the two most recent epochs, and back from there.
      for (let w = 0; w < 3; w++) {
        const end = rows.length - w * EPOCHS_PER_WEEK;
        const start = end - EPOCHS_PER_WEEK;
        if (end <= 0) break;
        const slice = rows.slice(Math.max(0, start), end);
        if (!slice.length) break;
        weeks.push(bucketOf(w === 0 ? "This week" : `${w} week${w > 1 ? "s" : ""} ago`, slice));
      }
    }
  }

  const overall = rows.length ? bucketOf("Overall", rows) : null;

  const body = {
    generated_at_unix: Math.floor(Date.now() / 1000),
    identity_address: IDENTITY_ADDRESS,
    basis:
      "Measured per-reward-epoch bond rate (reward_rate_total_mirror = staking + pure). The delegator staking rate (reward_rate_mirror) is NET of the provider's delegation fee; the self-bond pays no such fee, which is part of why the bond rate is higher. Epochs are 3.5 days; 2 per week. Annualized figures restate an observed rate (x365/3.5) and are not forecasts.",
    mode: BOND_OPEN_EPOCH != null ? "since_bond_open" : "trailing",
    bond_open_epoch: BOND_OPEN_EPOCH,
    logged_epochs: history.length,
    // History rows plus the live epoch — what the page can actually show.
    total_epochs: rows.length,
    current: current
      ? {
          reward_epoch: current.reward_epoch,
          bond_rate_epoch: current.bond_rate_epoch,
          bond_rate_annualized_pct:
            current.bond_rate_epoch != null
              ? current.bond_rate_epoch * EPOCHS_PER_YEAR * 100
              : null,
          // What a P-chain DELEGATOR receives — net of our 20% fee.
          // Verified: fee = 0.25 x (wnat + mirror), i.e. these reward figures
          // are already net (net = 80% of gross => fee = 25% of net).
          delegator_staking_pct:
            current.staking_rate_epoch != null
              ? current.staking_rate_epoch * EPOCHS_PER_YEAR * 100
              : null,
          staking_component_pct:
            current.staking_rate_epoch != null
              ? current.staking_rate_epoch * EPOCHS_PER_YEAR * 100
              : null,
          pure_component_pct:
            current.pure_rate_epoch != null
              ? current.pure_rate_epoch * EPOCHS_PER_YEAR * 100
              : null,
          provider_income_flr: current.provider_income_flr,
          delegation_fee_pct: current.delegation_fee_pct ?? null,
        }
      : null,
    /**
     * The most recent epoch that actually paid out. `current` reports zeros for
     * the whole of an in-flight epoch, so a page asking "what does the bond earn
     * now" must read this instead — otherwise it shows nothing for most of every
     * 3.5-day cycle.
     */
    last_measured: (() => {
      const measured = rows.filter(isMeasured);
      if (!measured.length) return null;
      const r = measured[measured.length - 1];
      return {
        reward_epoch: r.reward_epoch,
        bond_rate_annualized_pct:
          typeof r.bond_rate_epoch === "number" ? r.bond_rate_epoch * EPOCHS_PER_YEAR * 100 : null,
        staking_component_pct:
          typeof r.staking_rate_epoch === "number"
            ? r.staking_rate_epoch * EPOCHS_PER_YEAR * 100
            : null,
        pure_component_pct:
          typeof r.pure_rate_epoch === "number" ? r.pure_rate_epoch * EPOCHS_PER_YEAR * 100 : null,
        provider_income_flr: r.provider_income_flr ?? null,
      };
    })(),
    weeks,
    overall,
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS}`,
    },
  });
}

/**
 * The most recent epoch that actually paid something out.
 *
 * `/api/rewards` derives its headline rates from the Explorer's "latest" record,
 * which reports zeros for the whole of an in-flight epoch — so for most of every
 * 3.5-day cycle the site had no rate to show. This log is the fallback: the last
 * epoch we genuinely measured, so the page shows a real number and says which
 * epoch it came from rather than a zero or a blank.
 */
export async function loadLastMeasuredEpoch(): Promise<EpochRow | null> {
  try {
    const history = await loadHistory();
    const measured = history.filter(isMeasured);
    if (!measured.length) return null;
    return measured.reduce((a, b) => (b.reward_epoch > a.reward_epoch ? b : a));
  } catch {
    return null;
  }
}
