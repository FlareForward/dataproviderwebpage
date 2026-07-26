/**
 * Snapshot / accumulate FlareForward performance history.
 *
 * The provider box publishes a live, scrubbed `ftso-accuracy.json` every ~10
 * min but only keeps a short window of history. This job periodically snapshots
 * that public artifact into an append-only `ftso-performance-history.json` so
 * the analytics page can chart week/month/year-over-year trends that accumulate
 * from the earliest available data forward.
 *
 * It derives three metrics per reward epoch:
 *   - band accuracy  -> the canonical Flare Systems Explorer per-reward-epoch
 *                       grading (same source as the FTSO Success Rate board and
 *                       the analytics cards). Falls back to the box's verified
 *                       `epochs[]` only for epochs the Explorer doesn't cover
 *                       (it exposes just the most recent few reward epochs).
 *   - submissions    -> on-chain graded samples (`epochs[].n`) vs. the expected
 *                       feeds x rounds for the portion of the epoch that has
 *                       actually ELAPSED as of this snapshot, not the full
 *                       3.5-day epoch (participation rate). A fresh epoch has
 *                       almost no expected rounds yet, so this avoids reading
 *                       artificially near-zero while an otherwise-healthy
 *                       epoch is still young; the denominator is also floored
 *                       at the observed count so a provider ahead of the
 *                       (approximate) elapsed estimate reads as a clean 100%,
 *                       never >100%. A completed epoch is unaffected -- its
 *                       elapsed time equals the full epoch either way.
 *   - uptime         -> the canonical Explorer per-reward-epoch `availability`
 *                       where it covers an epoch; otherwise built forward from
 *                       the `status.submitting` observations we record on every
 *                       run (null for epochs before this job started, per the
 *                       "null = no data, never 0%" convention)
 *
 * Storage is a single JSON file (the "light DB"): append-only, keyed by
 * reward_epoch, with an internal `uptime_observations[]` the frontend ignores.
 *
 * Env:
 *   ACCURACY_URL      source accuracy feed (default: public FlareForward repo)
 *   EXPLORER_FTSO_URL canonical per-reward-epoch grading from the Flare Systems
 *                     Explorer (default: the backend's entity/{id}/ftso endpoint)
 *   HISTORY_URL       existing history to extend (default: the public accuracy
 *                     repo's `performance` branch)
 *   OUT_PATH          where to write the updated history (default: ./ftso-performance-history.json)
 */

import { writeFile, readFile } from "node:fs/promises";

const ACCURACY_URL =
  process.env.ACCURACY_URL ??
  "https://raw.githubusercontent.com/FlareForward/ftso-accuracy-data/main/ftso-accuracy.json";
/**
 * Canonical per-reward-epoch band accuracy (primary/secondary) from the Flare
 * Systems Explorer — the same indexer the app's board/cards read. Values are
 * fractions in 0..1 and get scaled to percentages here.
 */
const EXPLORER_FTSO_URL =
  process.env.EXPLORER_FTSO_URL ??
  `https://flare-systems-explorer-backend.flare.network/api/v0/entity/0x1FBB55a1877817A0f90cAE60c1ab22FC94f97110/ftso`;
const HISTORY_URL =
  process.env.HISTORY_URL ??
  "https://raw.githubusercontent.com/FlareForward/ftso-accuracy-data/performance/ftso-performance-history.json";
const OUT_PATH = process.env.OUT_PATH ?? "ftso-performance-history.json";
/**
 * When set, read the existing history from this local file instead of
 * HISTORY_URL. CI points this at the checked-out data branch so each run
 * extends the exact committed state (no raw-CDN cache lag / lost observations).
 */
const HISTORY_PATH = process.env.HISTORY_PATH ?? null;

const SCHEMA_VERSION = 1;
/** Flare mainnet reward epoch = 3.5 days; voting round = 90s. */
const REWARD_EPOCH_SECONDS = 302400;
const VOTING_ROUND_SECONDS = 90;
const ROUNDS_PER_EPOCH = REWARD_EPOCH_SECONDS / VOTING_ROUND_SECONDS; // 3360
/** Flare Forward identity (pinned) — mirrors PINNED_PROVIDER_ADDRESS in the app. */
const IDENTITY_ADDRESS = "0x1FBB55a1877817A0f90cAE60c1ab22FC94f97110";
/** Keep ~2 years of 10-min observations at most; plenty for uptime buckets. */
const MAX_OBSERVATIONS = 110_000;

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

/**
 * Best-effort fetch of the Explorer's canonical per-reward-epoch band accuracy.
 * Returns a Map keyed by reward epoch -> { primary, secondary } as percentages,
 * or an empty Map if the Explorer is unavailable (so the job still runs and
 * falls back to the box's verified epochs[]).
 */
async function fetchExplorerPerEpoch() {
  try {
    const res = await fetch(EXPLORER_FTSO_URL, {
      headers: { Accept: "application/json" },
      cache: "no-cache",
    });
    if (!res.ok) return new Map();
    const data = await res.json();
    const map = new Map();
    for (const e of data.per_reward_epoch ?? []) {
      const re = Number(e.reward_epoch_id);
      if (!Number.isFinite(re)) continue;
      map.set(re, {
        availability:
          typeof e.availability === "number" ? e.availability * 100 : null,
        primary: typeof e.primary === "number" ? e.primary * 100 : null,
        secondary: typeof e.secondary === "number" ? e.secondary * 100 : null,
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

/** Read + parse a local JSON file, returning null if it does not exist. */
async function readJsonFile(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

function emptyHistory() {
  return {
    schema_version: SCHEMA_VERSION,
    source: "derived_from_ftso_accuracy",
    generated_at_unix: 0,
    provider: {
      name: "Flare Forward",
      identity_address: IDENTITY_ADDRESS,
      delegation_address: "",
    },
    status: null,
    series: [],
    uptime_observations: [],
  };
}

/**
 * Approximate the UTC start of a finalized reward epoch, anchored on the
 * current epoch at the time it is first observed. Assigned once and then kept
 * immutable so buckets stay stable across runs.
 */
function approxEpochStart(rewardEpoch, currentEpoch, nowUnix) {
  return nowUnix - (currentEpoch - rewardEpoch) * REWARD_EPOCH_SECONDS;
}

async function main() {
  const accuracy = await fetchJson(ACCURACY_URL);
  if (!accuracy) throw new Error(`Accuracy feed not found at ${ACCURACY_URL}`);

  // Canonical per-reward-epoch band accuracy from the Flare Systems Explorer;
  // overrides the box's self-graded epochs[] where it covers an epoch.
  const canonicalByEpoch = await fetchExplorerPerEpoch();

  const history =
    (HISTORY_PATH
      ? await readJsonFile(HISTORY_PATH)
      : await fetchJson(HISTORY_URL)) ?? emptyHistory();
  // Normalize shape in case an older/partial file is present.
  history.schema_version = SCHEMA_VERSION;
  history.source = "derived_from_ftso_accuracy";
  history.series ??= [];
  history.uptime_observations ??= [];
  history.provider ??= emptyHistory().provider;

  const now = Number(accuracy.generated_at_unix) || Math.floor(Date.now() / 1000);
  const status = accuracy.status ?? {};
  const currentEpoch = Number(status.reward_epoch_current ?? NaN);
  const feedsCount = Number(accuracy.summary?.feeds_count) || 63;

  // 1. Record an uptime observation for this run (deduped by timestamp).
  const seenTs = new Set(history.uptime_observations.map((o) => o.ts));
  if (!seenTs.has(now)) {
    history.uptime_observations.push({
      ts: now,
      submitting: status.submitting === true,
      registered: status.reward_epoch_registered === true,
      reward_epoch: Number.isFinite(currentEpoch) ? currentEpoch : null,
    });
  }
  // Trim oldest observations if we exceed the cap.
  if (history.uptime_observations.length > MAX_OBSERVATIONS) {
    history.uptime_observations = history.uptime_observations.slice(
      history.uptime_observations.length - MAX_OBSERVATIONS
    );
  }

  // 2. Upsert one series row per verified reward epoch from the accuracy feed.
  const byEpoch = new Map(history.series.map((r) => [r.reward_epoch, r]));
  for (const e of accuracy.epochs ?? []) {
    const rewardEpoch = Number(e.reward_epoch);
    if (!Number.isFinite(rewardEpoch)) continue;
    const existing = byEpoch.get(rewardEpoch);
    const bucketStart =
      existing?.bucket_start_unix ??
      (Number.isFinite(currentEpoch)
        ? approxEpochStart(rewardEpoch, currentEpoch, now)
        : now);
    const n = typeof e.n === "number" ? e.n : null;
    // Scale the expected-sample denominator to how much of this epoch has
    // actually ELAPSED as of this snapshot, not the full 3.5-day epoch. An
    // epoch that just started has almost no expected rounds yet; dividing its
    // (correctly small) real count by the full-epoch total makes participation
    // read as artificially near-zero for the entire epoch until it's nearly
    // over, even when submission is fully healthy. A completed epoch
    // (bucketStart + REWARD_EPOCH_SECONDS <= now) clamps to the same full
    // expectedSamples as before -- this only changes the in-progress epoch.
    const elapsedSeconds = Math.max(
      0,
      Math.min(REWARD_EPOCH_SECONDS, now - bucketStart)
    );
    const elapsedRounds = elapsedSeconds / VOTING_ROUND_SECONDS;
    // bucket_start_unix is an approximation (assigned once from the current
    // epoch boundary, not the exact on-chain reward-epoch start), so the
    // elapsed estimate can run a little behind reality. Never let the
    // denominator sit below what we've actually observed -- a provider
    // ahead of the naive estimate reads as a clean 100%, not >100%.
    const expectedSamplesElapsed = Math.max(feedsCount * elapsedRounds, n ?? 0);
    // Prefer the Explorer's canonical grading; fall back to the box's verified
    // epochs[] for epochs the Explorer no longer exposes, then to any existing
    // stored value (keeps older canonical/box values stable once written).
    const canonical = canonicalByEpoch.get(rewardEpoch);
    const bandPrimary =
      canonical?.primary ??
      (typeof e.primary === "number" ? e.primary : null) ??
      existing?.band_primary_pct ??
      null;
    const bandSecondary =
      canonical?.secondary ??
      (typeof e.secondary === "number" ? e.secondary : null) ??
      existing?.band_secondary_pct ??
      null;
    const row = {
      reward_epoch: rewardEpoch,
      bucket_start_unix: bucketStart,
      band_primary_pct: bandPrimary,
      band_secondary_pct: bandSecondary,
      submissions_count: n,
      submissions_total: n !== null ? expectedSamplesElapsed : null,
      // Filled in below from uptime observations.
      uptime_pct: existing?.uptime_pct ?? null,
    };
    byEpoch.set(rewardEpoch, row);
  }

  // 3. Set uptime_pct per epoch: prefer the Explorer's canonical availability,
  //    otherwise recompute from `status.submitting` observations in its window.
  for (const row of byEpoch.values()) {
    const canonicalAvailability = canonicalByEpoch.get(
      row.reward_epoch
    )?.availability;
    if (canonicalAvailability != null) {
      row.uptime_pct = canonicalAvailability;
      continue;
    }
    const start = row.bucket_start_unix;
    const end = start + REWARD_EPOCH_SECONDS;
    let up = 0;
    let total = 0;
    for (const o of history.uptime_observations) {
      if (o.ts >= start && o.ts < end) {
        total += 1;
        if (o.submitting) up += 1;
      }
    }
    row.uptime_pct = total > 0 ? (up / total) * 100 : row.uptime_pct ?? null;
  }

  history.series = [...byEpoch.values()].sort(
    (a, b) => a.reward_epoch - b.reward_epoch
  );
  history.generated_at_unix = now;
  history.status = {
    submitting: status.submitting === true,
    reward_epoch_current: Number.isFinite(currentEpoch) ? currentEpoch : null,
    reward_epoch_registered: status.reward_epoch_registered === true,
    gap_reason: status.gap_reason ?? null,
    expected_resume_utc: status.expected_resume_utc ?? null,
  };

  await writeFile(OUT_PATH, JSON.stringify(history, null, 2) + "\n", "utf8");

  const withUptime = history.series.filter((r) => r.uptime_pct !== null).length;
  console.log(
    `Wrote ${OUT_PATH}: ${history.series.length} epoch rows ` +
      `(${history.series[0]?.reward_epoch ?? "-"}..${history.series.at(-1)?.reward_epoch ?? "-"}), ` +
      `${withUptime} with uptime, ` +
      `${history.uptime_observations.length} uptime observations, ` +
      `submitting=${history.status.submitting}.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
