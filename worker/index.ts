/**
 * Cloudflare Worker for the FlareForward FTSO data-provider portal.
 *
 * Serves the SPA's static assets (via the ASSETS binding) and adds a small
 * same-origin JSON proxy at `/api/ftso` that fronts the Flare Systems Explorer
 * backend. The Explorer's indexer is the canonical grader of FTSO reward-band
 * accuracy + availability (the same figures shown on
 * flare-systems-explorer.flare.network); it emits no CORS headers, so a browser
 * can't call it directly — this proxy fetches it server-side and re-serves it
 * same-origin, normalized to percentages, with short edge caching.
 *
 * Routing note: `wrangler.jsonc` sets `run_worker_first: ["/api/*"]` so this
 * Worker intercepts `/api/*` before the SPA `not_found_handling` fallback would
 * otherwise rewrite them to index.html.
 */

/** Flare Forward identity (pinned) — mirrors PINNED_PROVIDER_ADDRESS in the app. */
const IDENTITY_ADDRESS = "0x1FBB55a1877817A0f90cAE60c1ab22FC94f97110";

const EXPLORER_BASE =
  "https://flare-systems-explorer-backend.flare.network/api/v0";

/** Serve for 5 min; allow a stale copy for 10 min more while revalidating. */
const CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=600";

interface Env {
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
}

/** Explorer values are fractions in 0..1; the UI wants percentages. null-safe. */
function pct(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return value * 100;
}

interface ExplorerWindow {
  availability?: number;
  primary?: number;
  secondary?: number;
}

function normalizeWindow(w: ExplorerWindow | undefined | null) {
  return {
    availability: pct(w?.availability),
    primary: pct(w?.primary),
    secondary: pct(w?.secondary),
  };
}

interface ExplorerFeedRow {
  availability?: number;
  primary?: number;
  secondary?: number;
  feed?: {
    representation?: string;
    feed_name?: string;
    is_rewarded?: boolean;
  };
}

function normalizeFeeds(rows: ExplorerFeedRow[] | undefined) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    feed: r.feed?.representation ?? "",
    feed_id: r.feed?.feed_name ?? "",
    is_rewarded: r.feed?.is_rewarded ?? false,
    availability: pct(r.availability),
    primary: pct(r.primary),
    secondary: pct(r.secondary),
  }));
}

async function fetchExplorerJson(path: string): Promise<unknown> {
  const res = await fetch(`${EXPLORER_BASE}${path}`, {
    headers: { Accept: "application/json" },
    // Let Cloudflare cache the upstream fetch briefly to spread out load.
    cf: { cacheTtl: 120, cacheEverything: true },
  } as RequestInit);
  if (!res.ok) {
    throw new Error(`Explorer ${path} -> ${res.status}`);
  }
  return res.json();
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Same-origin in prod; `*` keeps the VITE_ACCURACY_URL override usable
      // from a local dev server pointing at a deployed worker.
      "access-control-allow-origin": "*",
      "cache-control": status === 200 ? CACHE_CONTROL : "public, max-age=30",
    },
  });
}

async function handleFtso(feedsOnly: boolean): Promise<Response> {
  try {
    const [ftso, feeds] = await Promise.all([
      fetchExplorerJson(`/entity/${IDENTITY_ADDRESS}/ftso`) as Promise<{
        last_6h?: ExplorerWindow;
        last_24h?: ExplorerWindow;
        per_reward_epoch?: Array<ExplorerWindow & { reward_epoch_id?: number }>;
      }>,
      fetchExplorerJson(
        `/entity/${IDENTITY_ADDRESS}/feeds?limit=100`
      ) as Promise<{ results?: ExplorerFeedRow[] }>,
    ]);

    const normalizedFeeds = normalizeFeeds(feeds?.results);
    const generated_at_unix = Math.floor(Date.now() / 1000);

    if (feedsOnly) {
      return jsonResponse({
        generated_at_unix,
        identity_address: IDENTITY_ADDRESS,
        feeds_count: normalizedFeeds.length,
        feeds: normalizedFeeds,
      });
    }

    const perEpoch = (ftso?.per_reward_epoch ?? [])
      .map((e) => ({
        reward_epoch: typeof e.reward_epoch_id === "number" ? e.reward_epoch_id : null,
        availability: pct(e.availability),
        primary: pct(e.primary),
        secondary: pct(e.secondary),
      }))
      .filter((e) => e.reward_epoch !== null)
      .sort((a, b) => (a.reward_epoch as number) - (b.reward_epoch as number));

    return jsonResponse({
      generated_at_unix,
      identity_address: IDENTITY_ADDRESS,
      feeds_count: normalizedFeeds.length,
      last_6h: normalizeWindow(ftso?.last_6h),
      last_24h: normalizeWindow(ftso?.last_24h),
      per_reward_epoch: perEpoch,
      feeds: normalizedFeeds,
    });
  } catch (err) {
    return jsonResponse(
      { error: "Failed to load Flare Systems Explorer data", detail: String(err) },
      502
    );
  }
}

/** P-chain stake amounts are 9-decimal (nAVAX-style); FLR = raw / 1e9. */
const STAKE_DECIMALS = 1e9;
/** Mirror/self-bond reward amounts on the entity endpoint are 18-decimal. */
const REWARD_DECIMALS = 1e18;
/** `fee_percentage` is scaled by 1e4 (e.g. 200000 -> 20.00%). */
const FEE_DIVISOR = 10_000;
/** Flare mainnet reward epoch = 3.5 days -> ~104.3 epochs per year. */
const EPOCHS_PER_YEAR = 365 / 3.5;

function flr(raw: unknown, decimals: number): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return n / decimals;
}

interface ValidatorRow {
  node_id?: string;
  self_bond?: number;
  delegated?: number;
  total_available_stake?: number;
  fee_percentage?: number;
  end_time?: number;
  delegators?: unknown[];
}

interface EntityRewards {
  reward_epoch?: number;
  mirror?: number | string;
  total_mirror?: number | string;
  self_bond_earnings?: number | string;
  reward_rate_total_mirror?: number;
}

async function handleValidator(): Promise<Response> {
  try {
    const entity = (await fetchExplorerJson(
      `/entity?query=${IDENTITY_ADDRESS}`
    )) as {
      results?: Array<{
        entityrewardslatest?: EntityRewards | null;
        denormalizedentity?: { node_ids?: string[] };
      }>;
    };
    const e = entity.results?.[0];
    const nodeIds = new Set(e?.denormalizedentity?.node_ids ?? []);
    const rewards = e?.entityrewardslatest ?? null;

    // Find this entity's validator row in the (paginated) validators list.
    let row: ValidatorRow | undefined;
    const first = (await fetchExplorerJson(
      `/validators?limit=100&offset=0`
    )) as { count?: number; results?: ValidatorRow[] };
    const count = first.count ?? 0;
    row = first.results?.find((r) => r.node_id && nodeIds.has(r.node_id));
    for (let off = 100; !row && off < count && off <= 500; off += 100) {
      const pg = (await fetchExplorerJson(
        `/validators?limit=100&offset=${off}`
      )) as { results?: ValidatorRow[] };
      row = pg.results?.find((r) => r.node_id && nodeIds.has(r.node_id));
    }

    const generated_at_unix = Math.floor(Date.now() / 1000);
    const nodeId = [...nodeIds][0] ?? null;

    if (!row) {
      return jsonResponse({
        generated_at_unix,
        identity_address: IDENTITY_ADDRESS,
        node_id: nodeId,
        has_validator: false,
      });
    }

    const selfBond = flr(row.self_bond, STAKE_DECIMALS);
    const delegated = flr(row.delegated, STAKE_DECIMALS);
    const capacity = flr(row.total_available_stake, STAKE_DECIMALS);
    const total =
      selfBond != null && delegated != null ? selfBond + delegated : null;
    const capacityUsedPct =
      total != null && capacity != null && capacity > 0
        ? (total / capacity) * 100
        : null;
    const feePct =
      typeof row.fee_percentage === "number"
        ? row.fee_percentage / FEE_DIVISOR
        : null;
    const rateEpochPct =
      typeof rewards?.reward_rate_total_mirror === "number"
        ? rewards.reward_rate_total_mirror * 100
        : null;

    return jsonResponse({
      generated_at_unix,
      identity_address: IDENTITY_ADDRESS,
      node_id: row.node_id ?? nodeId,
      has_validator: true,
      self_bond_flr: selfBond,
      delegated_flr: delegated,
      total_stake_flr: total,
      capacity_flr: capacity,
      capacity_used_pct: capacityUsedPct,
      delegators_count: Array.isArray(row.delegators)
        ? row.delegators.length
        : null,
      fee_pct: feePct,
      active_end_unix:
        typeof row.end_time === "number" ? Math.floor(row.end_time) : null,
      rewards: {
        reward_epoch: rewards?.reward_epoch ?? null,
        self_bond_earnings_flr: flr(rewards?.self_bond_earnings, REWARD_DECIMALS),
        total_flr: flr(rewards?.total_mirror, REWARD_DECIMALS),
        reward_rate_epoch_pct: rateEpochPct,
        reward_rate_annual_pct:
          rateEpochPct != null ? rateEpochPct * EPOCHS_PER_YEAR : null,
      },
    });
  } catch (err) {
    return jsonResponse(
      { error: "Failed to load validator staking data", detail: String(err) },
      502
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/api/ftso" || pathname === "/api/ftso/") {
      return handleFtso(false);
    }
    if (pathname === "/api/ftso/feeds") {
      return handleFtso(true);
    }
    if (pathname === "/api/validator" || pathname === "/api/validator/") {
      return handleValidator();
    }
    if (pathname.startsWith("/api/")) {
      return jsonResponse({ error: "Not found" }, 404);
    }

    // Anything non-API falls through to the static SPA assets.
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};
