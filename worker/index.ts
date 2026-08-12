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

import { handleNftRewards } from "./nftRewards";
import { handleBondYield } from "./bondYield";

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

function normalizeFeeds(
  rows: ExplorerFeedRow[] | undefined,
  ownerMap: Record<string, string> = {}
) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const feed = r.feed?.representation ?? "";
    return {
      feed,
      feed_id: r.feed?.feed_name ?? "",
      is_rewarded: r.feed?.is_rewarded ?? false,
      availability: pct(r.availability),
      primary: pct(r.primary),
      secondary: pct(r.secondary),
      // Who authored the algorithm live on this feed (ff/whale/ace -> handle).
      owner: ownerMap[feed] ?? null,
    };
  });
}

/**
 * Per-feed authorship (`owner`) is maintained in FlareForward's own accuracy
 * feed, not the Explorer. Fetch it and map feed -> owner handle so the board can
 * show who authored the algorithm live on each feed. Never throws: on any
 * failure the map is empty and feeds carry owner:null (the UI falls back to the
 * default author), so the board never breaks on this optional overlay.
 */
const OWNERSHIP_URL =
  "https://raw.githubusercontent.com/FlareForward/ftso-accuracy-data/main/ftso-accuracy.json";

async function fetchOwnerMap(): Promise<Record<string, string>> {
  try {
    const res = await fetch(OWNERSHIP_URL, {
      headers: { Accept: "application/json" },
      cf: { cacheTtl: 300, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) return {};
    const data = (await res.json()) as {
      feeds?: Array<{ feed?: string; owner?: string }>;
    };
    const map: Record<string, string> = {};
    for (const f of data.feeds ?? []) {
      if (f.feed && typeof f.owner === "string" && f.owner) map[f.feed] = f.owner;
    }
    return map;
  } catch {
    return {};
  }
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

/**
 * Security headers on every response. This is a non-custodial wallet dapp:
 * the headers that matter most are the framing blocks (`frame-ancestors` /
 * X-Frame-Options), which stop the site being embedded inside a lookalike
 * page to clickjack wallet confirmations. A full CSP is deliberately NOT set
 * here — wagmi/WalletConnect need a broad connect-src allowlist and a wrong
 * one silently breaks wallet connections; tighten separately with testing.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-frame-options": "DENY",
  "content-security-policy": "frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

function withSecurityHeaders(res: Response): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  return out;
}

function jsonResponse(body: unknown, status = 200): Response {
  return withSecurityHeaders(
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        // Same-origin in prod; `*` keeps the VITE_ACCURACY_URL override usable
        // from a local dev server pointing at a deployed worker.
        "access-control-allow-origin": "*",
        "cache-control": status === 200 ? CACHE_CONTROL : "public, max-age=30",
      },
    })
  );
}

async function handleFtso(feedsOnly: boolean): Promise<Response> {
  try {
    const [ftso, feeds, ownerMap] = await Promise.all([
      fetchExplorerJson(`/entity/${IDENTITY_ADDRESS}/ftso`) as Promise<{
        last_6h?: ExplorerWindow;
        last_24h?: ExplorerWindow;
        per_reward_epoch?: Array<ExplorerWindow & { reward_epoch_id?: number }>;
      }>,
      fetchExplorerJson(
        `/entity/${IDENTITY_ADDRESS}/feeds?limit=100`
      ) as Promise<{ results?: ExplorerFeedRow[] }>,
      fetchOwnerMap(),
    ]);

    const normalizedFeeds = normalizeFeeds(feeds?.results, ownerMap);
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

/** Find this entity's validator row in the (paginated) validators list. */
async function findValidatorRow(
  nodeIds: Set<string>
): Promise<ValidatorRow | undefined> {
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
  return row;
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

    const row = await findValidatorRow(nodeIds);

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

/**
 * `/api/rewards` — everything the /rewards sales page shows, in one payload.
 *
 * Composes the Explorer's entity record (latest-epoch reward buckets + official
 * per-epoch reward rates + signing-policy vote power + minimal-conditions
 * eligibility) with the validator row (stake, capacity, P-chain delegators).
 * All rates come from the Explorer's own `reward_rate_*` fields — nothing is
 * hand-authored; annualization is the only math applied (epoch rate x epochs
 * per year), and the payload labels the basis so the UI can disclose it.
 */
interface EntityQueryResult {
  providersuccessrate?: {
    primary?: number;
    secondary?: number;
    availability?: number;
    active?: boolean;
  } | null;
  entityrewardslatest?: (EntityRewards & {
    direct?: number | string;
    wnat?: number | string;
    total_fee?: number | string;
    reward_rate_wnat?: number;
    reward_rate_mirror?: number;
  }) | null;
  denormalizedentity?: {
    node_ids?: string[];
    delegation_address?: string;
  } | null;
  denormalizedsigningpolicy?: {
    reward_epoch?: number;
    staking_weight?: number | string;
    w_nat_weight?: number | string;
    delegation_fee_bips?: number;
  } | null;
  entityminimalconditionslatest?: {
    ftso_scaling?: boolean;
    ftso_fast_updates?: boolean;
    staking?: boolean;
    fdc?: boolean;
    eligible_for_reward?: boolean;
  } | null;
}

/** Explorer success-rate values are basis-point-style: 10000 -> 100%. */
function ratePct(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return value / 100;
}

async function handleRewards(): Promise<Response> {
  try {
    const entity = (await fetchExplorerJson(
      `/entity?query=${IDENTITY_ADDRESS}`
    )) as { results?: EntityQueryResult[] };
    const e = entity.results?.[0];
    if (!e) throw new Error("entity not found");

    const nodeIds = new Set(e.denormalizedentity?.node_ids ?? []);
    const row = await findValidatorRow(nodeIds);

    const rewards = e.entityrewardslatest ?? null;
    const policy = e.denormalizedsigningpolicy ?? null;
    const success = e.providersuccessrate ?? null;
    const conditions = e.entityminimalconditionslatest ?? null;

    // Official Explorer per-epoch reward rates (fractions), annualized simply.
    const delegationEpoch =
      typeof rewards?.reward_rate_wnat === "number"
        ? rewards.reward_rate_wnat * 100
        : null;
    const stakingEpoch =
      typeof rewards?.reward_rate_mirror === "number"
        ? rewards.reward_rate_mirror * 100
        : null;

    const selfBond = flr(row?.self_bond, STAKE_DECIMALS);
    const delegated = flr(row?.delegated, STAKE_DECIMALS);
    const capacity = flr(row?.total_available_stake, STAKE_DECIMALS);
    const totalStake =
      selfBond != null && delegated != null ? selfBond + delegated : null;
    const spaceLeft =
      capacity != null && totalStake != null ? capacity - totalStake : null;

    const delegators = Array.isArray(row?.delegators)
      ? (row!.delegators as Array<Record<string, unknown>>).map((d) => ({
          p_address: typeof d.address === "string" ? d.address : null,
          stake_flr: flr(d.delegated, STAKE_DECIMALS),
          start_unix:
            typeof d.start_time === "number" ? Math.floor(d.start_time) : null,
          end_unix:
            typeof d.end_time === "number" ? Math.floor(d.end_time) : null,
        }))
      : [];

    return jsonResponse({
      generated_at_unix: Math.floor(Date.now() / 1000),
      identity_address: IDENTITY_ADDRESS,
      delegation_address: e.denormalizedentity?.delegation_address ?? null,
      node_id: [...nodeIds][0] ?? null,
      latest_reward_epoch: rewards?.reward_epoch ?? null,
      eligible_for_reward: conditions?.eligible_for_reward ?? null,
      conditions: {
        ftso_scaling: conditions?.ftso_scaling ?? null,
        ftso_fast_updates: conditions?.ftso_fast_updates ?? null,
        staking: conditions?.staking ?? null,
        fdc: conditions?.fdc ?? null,
      },
      uptime_availability_pct: ratePct(success?.availability),
      fee_pct:
        typeof policy?.delegation_fee_bips === "number"
          ? policy.delegation_fee_bips / 100
          : null,
      vote_power: {
        delegation_flr: flr(policy?.w_nat_weight, REWARD_DECIMALS),
        staking_flr: flr(policy?.staking_weight, REWARD_DECIMALS),
      },
      rates: {
        basis: "latest reward epoch, annualized (365 / 3.5-day epochs)",
        delegation_epoch_pct: delegationEpoch,
        delegation_annual_pct:
          delegationEpoch != null ? delegationEpoch * EPOCHS_PER_YEAR : null,
        staking_epoch_pct: stakingEpoch,
        staking_annual_pct:
          stakingEpoch != null ? stakingEpoch * EPOCHS_PER_YEAR : null,
      },
      breakdown: {
        reward_epoch: rewards?.reward_epoch ?? null,
        delegation_flr: flr(rewards?.wnat, REWARD_DECIMALS),
        staking_flr: flr(rewards?.mirror, REWARD_DECIMALS),
        direct_flr: flr(rewards?.direct, REWARD_DECIMALS),
        fees_flr: flr(rewards?.total_fee, REWARD_DECIMALS),
        self_bond_flr: flr(rewards?.self_bond_earnings, REWARD_DECIMALS),
      },
      staking: {
        has_validator: !!row,
        self_bond_flr: selfBond,
        delegated_flr: delegated,
        total_stake_flr: totalStake,
        capacity_flr: capacity,
        space_left_flr: spaceLeft,
        delegators_count: delegators.length,
        active_end_unix:
          typeof row?.end_time === "number" ? Math.floor(row.end_time) : null,
      },
      delegators,
    });
  } catch (err) {
    return jsonResponse(
      { error: "Failed to load rewards data", detail: String(err) },
      502
    );
  }
}

/**
 * `/api/youtube` — latest videos from the FlareForward channel for the
 * homepage content hub. YouTube's public Atom feed needs no API key but sends
 * no CORS headers, so it's proxied same-origin like the Explorer endpoints.
 * Workers have no XML parser, so entries are extracted with anchored regexes
 * over the (machine-generated, stable-shape) feed. Failures return an empty
 * list rather than an error — the UI falls back to a plain channel link.
 */
const YOUTUBE_CHANNEL_ID = "UC8isC_Zx3-O8M7VC1G1T9Ag";
const YOUTUBE_FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;
const YOUTUBE_MAX_VIDEOS = 6;

/** Minimal entity decode for feed titles (the only free-text field we ship). */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function handleYouTube(): Promise<Response> {
  try {
    const res = await fetch(YOUTUBE_FEED_URL, {
      headers: { Accept: "application/atom+xml" },
      cf: { cacheTtl: 1800, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) throw new Error(`YouTube feed -> ${res.status}`);
    const xml = await res.text();

    const videos: Array<{
      id: string;
      title: string;
      url: string;
      thumbnail: string;
      published_unix: number | null;
    }> = [];
    const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(xml)) && videos.length < YOUTUBE_MAX_VIDEOS) {
      const entry = m[1];
      const id = /<yt:videoId>([\w-]+)<\/yt:videoId>/.exec(entry)?.[1];
      const title = /<title>([\s\S]*?)<\/title>/.exec(entry)?.[1];
      const published = /<published>([^<]+)<\/published>/.exec(entry)?.[1];
      if (!id || !title) continue;
      const publishedMs = published ? Date.parse(published) : NaN;
      videos.push({
        id,
        title: decodeEntities(title.trim()),
        url: `https://www.youtube.com/watch?v=${id}`,
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        published_unix: Number.isFinite(publishedMs)
          ? Math.floor(publishedMs / 1000)
          : null,
      });
    }

    return jsonResponse({
      generated_at_unix: Math.floor(Date.now() / 1000),
      channel_id: YOUTUBE_CHANNEL_ID,
      videos,
    });
  } catch {
    // Soft-fail: the content hub renders its channel-link fallback on empty.
    return jsonResponse({
      generated_at_unix: Math.floor(Date.now() / 1000),
      channel_id: YOUTUBE_CHANNEL_ID,
      videos: [],
    });
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
    if (pathname === "/api/rewards" || pathname === "/api/rewards/") {
      return handleRewards();
    }
    if (pathname === "/api/youtube" || pathname === "/api/youtube/") {
      return handleYouTube();
    }
    if (pathname === "/api/nft-rewards" || pathname === "/api/nft-rewards/") {
      return handleNftRewards(request);
    }
    if (pathname === "/api/bond-yield" || pathname === "/api/bond-yield/") {
      return handleBondYield();
    }
    if (pathname.startsWith("/api/")) {
      return jsonResponse({ error: "Not found" }, 404);
    }

    // Anything non-API falls through to the static SPA assets.
    if (env.ASSETS) return withSecurityHeaders(await env.ASSETS.fetch(request));
    return new Response("Not found", { status: 404 });
  },
};
