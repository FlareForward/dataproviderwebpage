const ENTITY_URL =
  "https://flare-systems-explorer-backend.flare.network/api/v0/entity?limit=200";
const IDENTITY_ADDRESS = "0x1FBB55a1877817A0f90cAE60c1ab22FC94f97110";
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Flare reward epochs are 3.5 days. */
const EPOCHS_PER_YEAR = 365 / 3.5;
const CACHE_SECONDS = 900;

interface EntityRewardsLatest {
  reward_epoch?: number | string | null;
  reward_rate_wnat?: number | string | null;
  reward_rate_mirror?: number | string | null;
}

interface SigningPolicy {
  w_nat_weight?: number | string | null;
  staking_weight?: number | string | null;
}

interface EntityRow extends Record<string, unknown> {
  entityrewardslatest?: EntityRewardsLatest | null;
  denormalizedsigningpolicy?: SigningPolicy | null;
}

interface EntityPage {
  next?: string | null;
  results?: EntityRow[];
}

interface WeightedPoint {
  value: number;
  weight: number;
}

type RateKey = "reward_rate_wnat" | "reward_rate_mirror";
type WeightKey = "w_nat_weight" | "staking_weight";

export interface NetworkRatesResponseBody {
  generated_at_unix: number;
  reward_epoch: number;
  epochs_per_year: number;
  delegation: StreamSummary;
  staking: StreamSummary;
}

interface StreamSummary {
  network_weighted_median_pct: number;
  network_median_pct: number;
  n: number;
  flareforward_pct: number | null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control":
        status === 200
          ? `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS}`
          : "no-store",
    },
  });
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function annualizePct(epochFraction: number): number {
  return epochFraction * EPOCHS_PER_YEAR * 100;
}

function median(values: number[]): number {
  if (!values.length) throw new Error("median requires at least one value");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function weightedMedian(points: WeightedPoint[]): number {
  if (!points.length) {
    throw new Error("weighted median requires at least one value");
  }
  const sorted = [...points].sort((a, b) => a.value - b.value);
  const totalWeight = sorted.reduce((sum, p) => sum + p.weight, 0);
  if (!(totalWeight > 0)) {
    throw new Error("weighted median requires positive total weight");
  }

  let cumulative = 0;
  for (const point of sorted) {
    cumulative += point.weight;
    if (cumulative >= totalWeight / 2) return point.value;
  }
  return sorted[sorted.length - 1].value;
}

function containsIdentityAddress(row: EntityRow): boolean {
  return JSON.stringify(row)
    .toLowerCase()
    .includes(IDENTITY_ADDRESS.toLowerCase());
}

async function fetchEntityPage(url: string): Promise<EntityPage> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": BROWSER_USER_AGENT,
    },
    cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
  } as RequestInit);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return (await res.json()) as EntityPage;
}

async function loadEntityRows(): Promise<EntityRow[]> {
  const rows: EntityRow[] = [];
  const seen = new Set<string>();
  let next: string | null = ENTITY_URL;

  while (next) {
    if (seen.has(next)) throw new Error("entity pagination loop");
    seen.add(next);

    const page = await fetchEntityPage(next);
    if (!Array.isArray(page.results)) {
      throw new Error("entity page missing results");
    }
    rows.push(...page.results);
    next =
      typeof page.next === "string" && page.next
        ? new URL(page.next, next).toString()
        : null;
  }

  return rows;
}

function streamSummary(
  rows: EntityRow[],
  rateKey: RateKey,
  weightKey: WeightKey,
  flareForwardRow: EntityRow | undefined,
): StreamSummary {
  const points: WeightedPoint[] = [];
  for (const row of rows) {
    const rate = numberValue(row.entityrewardslatest?.[rateKey]);
    const weight = numberValue(row.denormalizedsigningpolicy?.[weightKey]);
    if (rate == null || weight == null || weight <= 0) continue;
    points.push({ value: rate, weight });
  }
  if (!points.length) {
    throw new Error(`no rows for ${rateKey}`);
  }

  const flareForwardRate =
    flareForwardRow != null
      ? numberValue(flareForwardRow.entityrewardslatest?.[rateKey])
      : null;

  return {
    network_weighted_median_pct: annualizePct(weightedMedian(points)),
    network_median_pct: annualizePct(median(points.map((p) => p.value))),
    n: points.length,
    flareforward_pct:
      flareForwardRate != null ? annualizePct(flareForwardRate) : null,
  };
}

export function buildNetworkRatesResponse(
  rows: EntityRow[],
): NetworkRatesResponseBody {
  const epochs = rows
    .map((row) => numberValue(row.entityrewardslatest?.reward_epoch))
    .filter((epoch): epoch is number => epoch != null);
  if (!epochs.length) throw new Error("no reward epochs in entity data");

  const rewardEpoch = Math.max(...epochs);
  const latestRows = rows.filter(
    (row) => numberValue(row.entityrewardslatest?.reward_epoch) === rewardEpoch,
  );
  const flareForwardRow = latestRows.find(containsIdentityAddress);

  return {
    generated_at_unix: Math.floor(Date.now() / 1000),
    reward_epoch: rewardEpoch,
    epochs_per_year: EPOCHS_PER_YEAR,
    delegation: streamSummary(
      latestRows,
      "reward_rate_wnat",
      "w_nat_weight",
      flareForwardRow,
    ),
    staking: streamSummary(
      latestRows,
      "reward_rate_mirror",
      "staking_weight",
      flareForwardRow,
    ),
  };
}

export async function handleNetworkRates(): Promise<Response> {
  try {
    return jsonResponse(buildNetworkRatesResponse(await loadEntityRows()));
  } catch (err) {
    return jsonResponse(
      { error: "Failed to load network rates", detail: String(err) },
      502,
    );
  }
}
