/**
 * `/api/earned` — what one wallet has actually been PAID, forward from launch.
 *
 * The claimable figures elsewhere on My Rewards answer "what can I take right
 * now". They cannot answer "what has this wallet earned", because the moment a
 * claim lands the contract forgets it: `getStateOfRewards` only tracks epochs
 * still claimable, and no reward contract keeps a per-owner lifetime total.
 * Paid history exists only as `RewardClaimed` event logs.
 *
 * FORWARD ONLY, by operator call (2026-08-16). We do not backfill. Tracking
 * starts at TRACKING_START_BLOCK — the block this shipped — and the window the
 * page offers is carved out of that range, never before it. This is also what
 * keeps the endpoint fast: the scan range starts at zero and grows ~15M blocks
 * a year, so the chunk budget below is years of runway rather than a cap we are
 * already pressing against.
 *
 * Source is Flare's Blockscout `getLogs`, which is the only public index that
 * will serve a filtered full-range log query: the Flare Systems Explorer
 * indexes providers, not wallets, and the public RPC caps `eth_getLogs` at 30
 * blocks. Measured on this range: a 500k-block filtered query returns in ~3s,
 * 5M in ~24s, and anything wider 504s — hence CHUNK_BLOCKS well under that,
 * fanned out in parallel.
 *
 * On any upstream failure this endpoint returns 502 rather than a partial sum.
 * A silently-low "total earned" on a member page is worse than no number.
 */

/** Flare RPC, for the current head only. */
const FLARE_RPC = "https://flare-api.flare.network/ext/C/rpc";

const BLOCKSCOUT = "https://flare-explorer.flare.network/api";

/**
 * FlareForward's rewards tracking epoch. Pinned to the block at ship time
 * (2026-08-16T20:51:50Z). Everything this endpoint reports is at or after it.
 * Moving this forward discards history the page has already shown; moving it
 * back means claiming coverage that was never scanned. Treat it as immutable.
 */
const TRACKING_START_BLOCK = 67561043;
const TRACKING_START_UNIX = 1786913510;

/**
 * RewardManager (Flare Systems Protocol V2) pays both delegation and staking
 * claims; ValidatorRewardManager still pays legacy validator rewards. Both were
 * confirmed live-emitting on 2026-08-16. FtsoRewardManagerProxy was checked and
 * emits nothing in the V2 era, so including it would only risk double-counting.
 */
const REWARD_MANAGER = "0xC8f55c5aA2C752eE285Bd872855C749f4ee6239B";
const VALIDATOR_REWARD_MANAGER = "0xc0CF3Aaf93bd978C5BC662564Aa73E331f2eC0B5";

/**
 * RewardClaimed(address voter, address whoClaimed, address sentTo,
 *               uint24 rewardEpochId, uint8 claimType, uint120 amount)
 * `whoClaimed` (topic2) is the reward OWNER — the wallet that earned it — which
 * is what we filter on. `sentTo` can differ when an executor claims on the
 * owner's behalf, and filtering there would miss rewards this wallet earned.
 */
const V2_CLAIM_TOPIC =
  "0x06f77960d1401cc7d724b5c2b5ad672b9dbf08d8b11516a38c21697c23fbb0d2";

/** RewardClaimed(address beneficiary, address sentTo, uint256 amount) */
const VRM_CLAIM_TOPIC =
  "0x0aa4d283470c904c551d18bb894d37e17674920f3261a7f854be501e25f421b7";

/** Comfortably inside Blockscout's 30s gateway timeout at this filter width. */
const CHUNK_BLOCKS = 2_000_000;
/** ~40M blocks ≈ 2.5 years of runway before `partial` can ever be true. */
const MAX_CHUNKS = 20;

/** Flare V2 ClaimType. WNAT/DIRECT/FEE are delegation; MIRROR/CCHAIN staking. */
const STAKING_CLAIM_TYPES = new Set([3, 4]);

export type EarnedKind = "delegation" | "staking";

export interface EarnedClaim {
  block: number;
  unix: number;
  /** Reward epoch the payment was for; null for legacy validator claims. */
  epoch: number | null;
  kind: EarnedKind;
  amount_wei: string;
}

interface RawLog {
  data?: string;
  topics?: string[];
  blockNumber?: string;
  timeStamp?: string;
}

function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

/** Left-pad an address into the 32-byte form Blockscout matches topics on. */
function topicFor(address: string): string {
  return `0x${"0".repeat(24)}${address.replace(/^0x/, "").toLowerCase()}`;
}

/** Read one 32-byte word out of an ABI-encoded `data` blob. */
function word(data: string, index: number): bigint {
  const body = data.replace(/^0x/, "");
  const slice = body.slice(index * 64, (index + 1) * 64);
  if (slice.length < 64) return 0n;
  return BigInt(`0x${slice}`);
}

async function currentBlock(): Promise<number> {
  const res = await fetch(FLARE_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_blockNumber",
      params: [],
    }),
  });
  if (!res.ok) throw new Error(`RPC eth_blockNumber -> ${res.status}`);
  const json = (await res.json()) as { result?: string };
  const head = Number.parseInt(json.result ?? "", 16);
  if (!Number.isFinite(head)) throw new Error("RPC returned no block height");
  return head;
}

/**
 * One filtered log window. Blockscout answers an empty range with
 * `message: "No logs found"` and no `result` array — that is a success, not a
 * failure, and must not be conflated with a timeout (which is what would
 * silently understate the total).
 */
async function fetchLogWindow(
  address: string,
  topic0: string,
  ownerTopicIndex: 1 | 2,
  owner: string,
  fromBlock: number,
  toBlock: number
): Promise<RawLog[]> {
  const params = new URLSearchParams({
    module: "logs",
    action: "getLogs",
    fromBlock: String(fromBlock),
    toBlock: String(toBlock),
    address,
    topic0,
    [`topic${ownerTopicIndex}`]: topicFor(owner),
    [`topic0_${ownerTopicIndex}_opr`]: "and",
  });

  const res = await fetch(`${BLOCKSCOUT}?${params}`, {
    headers: { Accept: "application/json" },
    cf: { cacheTtl: 60, cacheEverything: true },
  } as RequestInit);
  if (!res.ok) throw new Error(`Blockscout getLogs -> ${res.status}`);

  const json = (await res.json()) as { message?: string; result?: unknown };
  if (Array.isArray(json.result)) return json.result as RawLog[];
  if (typeof json.message === "string" && /no logs found/i.test(json.message)) {
    return [];
  }
  throw new Error(`Blockscout getLogs: ${json.message ?? "unexpected payload"}`);
}

function chunkRanges(from: number, to: number): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (let start = from; start <= to && ranges.length < MAX_CHUNKS; start += CHUNK_BLOCKS) {
    ranges.push([start, Math.min(start + CHUNK_BLOCKS - 1, to)]);
  }
  return ranges;
}

function decodeV2(log: RawLog): EarnedClaim | null {
  const data = log.data ?? "";
  if (data.replace(/^0x/, "").length < 192) return null;
  const claimType = Number(word(data, 1));
  return {
    block: Number.parseInt(log.blockNumber ?? "0", 16),
    unix: Number.parseInt(log.timeStamp ?? "0", 16),
    epoch: Number(word(data, 0)),
    kind: STAKING_CLAIM_TYPES.has(claimType) ? "staking" : "delegation",
    amount_wei: word(data, 2).toString(),
  };
}

function decodeVrm(log: RawLog): EarnedClaim | null {
  const data = log.data ?? "";
  if (data.replace(/^0x/, "").length < 64) return null;
  return {
    block: Number.parseInt(log.blockNumber ?? "0", 16),
    unix: Number.parseInt(log.timeStamp ?? "0", 16),
    epoch: null,
    kind: "staking",
    amount_wei: word(data, 0).toString(),
  };
}

export async function loadEarnedClaims(
  owner: string,
  head: number
): Promise<{ claims: EarnedClaim[]; partial: boolean }> {
  const ranges = chunkRanges(TRACKING_START_BLOCK, head);
  const wouldNeed = Math.ceil((head - TRACKING_START_BLOCK + 1) / CHUNK_BLOCKS);

  const batches = await Promise.all(
    ranges.flatMap(([from, to]) => [
      fetchLogWindow(REWARD_MANAGER, V2_CLAIM_TOPIC, 2, owner, from, to).then((logs) =>
        logs.map(decodeV2)
      ),
      fetchLogWindow(VALIDATOR_REWARD_MANAGER, VRM_CLAIM_TOPIC, 1, owner, from, to).then(
        (logs) => logs.map(decodeVrm)
      ),
    ])
  );

  // Newest first. Claiming several epochs at once emits one event per epoch in
  // a single transaction, so those share a timestamp exactly — break the tie on
  // epoch, or a batch renders in arbitrary order inside the history list.
  const claims = batches
    .flat()
    .filter((c): c is EarnedClaim => c !== null && c.amount_wei !== "0")
    .sort((a, b) => b.unix - a.unix || (b.epoch ?? 0) - (a.epoch ?? 0));

  return { claims, partial: wouldNeed > MAX_CHUNKS };
}

export async function handleEarned(request: Request): Promise<Response> {
  const address = new URL(request.url).searchParams.get("address") ?? "";
  if (!isAddress(address)) {
    return jsonResponse({ error: "A 0x wallet address is required" }, 400);
  }

  try {
    const head = await currentBlock();
    const { claims, partial } = await loadEarnedClaims(address, head);

    let delegation = 0n;
    let staking = 0n;
    for (const claim of claims) {
      const amount = BigInt(claim.amount_wei);
      if (claim.kind === "staking") staking += amount;
      else delegation += amount;
    }

    return jsonResponse({
      generated_at_unix: Math.floor(Date.now() / 1000),
      address,
      tracking_start_block: TRACKING_START_BLOCK,
      tracking_start_unix: TRACKING_START_UNIX,
      to_block: head,
      partial,
      claimed: {
        total_wei: (delegation + staking).toString(),
        delegation_wei: delegation.toString(),
        staking_wei: staking.toString(),
      },
      claims,
    });
  } catch (err) {
    // Deliberately an error, not a zero: a member page that quietly reports
    // "0 FLR earned" because an indexer timed out is a trust bug.
    return jsonResponse(
      { error: "Failed to read claim history", detail: String(err) },
      502
    );
  }
}

/** Local copy of the worker's JSON helper (kept out of index.ts's export list). */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control":
        status === 200
          ? "public, max-age=60, stale-while-revalidate=300"
          : "public, max-age=15",
    },
  });
}
