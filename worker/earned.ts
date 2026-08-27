import { loadBondRewardClaims } from "./nftRewards.js";

/**
 * `/api/earned` — what one wallet has been PAID through FlareForward, plus
 * bond distributor claimables when those distributor contracts exist.
 *
 * Delegation and staking claimable balances are composed client-side from the
 * existing reward hooks. Paid history exists only as `RewardClaimed` event
 * logs, and it must be attributed by provider: topic1 is the voter/provider
 * that earned the reward; topic2 is the reward owner.
 *
 * On any upstream failure or scan truncation this endpoint returns 502 rather
 * than a partial sum. A silently-low "total earned" on a member page is worse
 * than no number.
 */

/** Flare RPC, for the current head only. */
const FLARE_RPC = "https://flare-api.flare.network/ext/C/rpc";

const BLOCKSCOUT = "https://flare-explorer.flare.network/api";

/** RewardManager creation block: the true floor for attributed V2 rewards. */
const TRACKING_START_BLOCK = 29549020;
/** FlareForward's first attributable claim date, 2026-07-13 UTC. */
const TRACKING_START_UNIX = 1783900800;

/** RewardManager (Flare Systems Protocol V2) pays delegation and staking claims. */
const REWARD_MANAGER = "0xC8f55c5aA2C752eE285Bd872855C749f4ee6239B";
const FLAREFORWARD_VOTER = "0x1FBB55a1877817A0f90cAE60c1ab22FC94f97110";

/**
 * RewardClaimed(address voter, address whoClaimed, address sentTo,
 *               uint24 rewardEpochId, uint8 claimType, uint120 amount)
 * `voter` (topic1) is the provider that earned the reward. `whoClaimed`
 * (topic2) is the reward owner. Both are required for "what we earned you".
 * `sentTo` can differ when an executor claims on the owner's behalf.
 */
const V2_CLAIM_TOPIC =
  "0x06f77960d1401cc7d724b5c2b5ad672b9dbf08d8b11516a38c21697c23fbb0d2";

/**
 * ValidatorRewardManager is deliberately excluded: its
 * `RewardClaimed(beneficiary,sentTo,amount)` event has no voter/provider field,
 * so it is structurally unattributable to FlareForward.
 */

/** Voter-filtered backfills are small enough to span current full history. */
const CHUNK_BLOCKS = 50_000_000;
/** Hard stop if chain growth ever outpaces the window budget. */
const MAX_CHUNKS = 4;

/** Flare V2 ClaimType. WNAT/DIRECT/FEE are delegation; MIRROR/CCHAIN staking. */
const STAKING_CLAIM_TYPES = new Set([3, 4]);

export type EarnedKind = "delegation" | "staking" | "bonds";

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

interface LogBatch {
  logs: RawLog[];
  partial: boolean;
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
  topics: Partial<Record<1 | 2, string>>,
  fromBlock: number,
  toBlock: number,
): Promise<LogBatch> {
  const params = new URLSearchParams({
    module: "logs",
    action: "getLogs",
    fromBlock: String(fromBlock),
    toBlock: String(toBlock),
    address,
    topic0,
  });
  const indexes = Object.keys(topics).map((i) => Number(i) as 1 | 2);
  for (const index of indexes) {
    params.set(`topic${index}`, topics[index] ?? "");
    params.set(`topic0_${index}_opr`, "and");
  }
  if (topics[1] && topics[2]) params.set("topic1_2_opr", "and");

  const res = await fetch(`${BLOCKSCOUT}?${params}`, {
    headers: { Accept: "application/json" },
    cf: { cacheTtl: 60, cacheEverything: true },
  } as RequestInit);
  if (!res.ok) throw new Error(`Blockscout getLogs -> ${res.status}`);

  const json = (await res.json()) as { message?: string; result?: unknown };
  if (Array.isArray(json.result)) {
    const logs = json.result as RawLog[];
    return { logs, partial: logs.length >= 1000 };
  }
  if (typeof json.message === "string" && /no logs found/i.test(json.message)) {
    return { logs: [], partial: false };
  }
  throw new Error(
    `Blockscout getLogs: ${json.message ?? "unexpected payload"}`,
  );
}

function chunkRanges(from: number, to: number): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  if (to < from) return ranges;
  for (
    let start = from;
    start <= to && ranges.length < MAX_CHUNKS;
    start += CHUNK_BLOCKS
  ) {
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

export async function loadEarnedClaims(
  owner: string,
  head: number,
): Promise<{ claims: EarnedClaim[]; partial: boolean }> {
  const ranges = chunkRanges(TRACKING_START_BLOCK, head);
  const wouldNeed =
    head >= TRACKING_START_BLOCK
      ? Math.ceil((head - TRACKING_START_BLOCK + 1) / CHUNK_BLOCKS)
      : 0;

  const batches = await Promise.all(
    ranges.map(([from, to]) =>
      fetchLogWindow(
        REWARD_MANAGER,
        V2_CLAIM_TOPIC,
        {
          1: topicFor(FLAREFORWARD_VOTER),
          2: topicFor(owner),
        },
        from,
        to,
      ),
    ),
  );

  // Newest first. Claiming several epochs at once emits one event per epoch in
  // a single transaction, so those share a timestamp exactly — break the tie on
  // epoch, or a batch renders in arbitrary order inside the history list.
  const claims = batches
    .flatMap((batch) => batch.logs.map(decodeV2))
    .filter((c): c is EarnedClaim => c !== null && c.amount_wei !== "0")
    .sort((a, b) => b.unix - a.unix || (b.epoch ?? 0) - (a.epoch ?? 0));

  return {
    claims,
    partial: wouldNeed > MAX_CHUNKS || batches.some((b) => b.partial),
  };
}

export async function handleEarned(request: Request): Promise<Response> {
  const address = new URL(request.url).searchParams.get("address") ?? "";
  if (!isAddress(address)) {
    return jsonResponse({ error: "A 0x wallet address is required" }, 400);
  }

  try {
    const head = await currentBlock();
    const { claims, partial } = await loadEarnedClaims(address, head);
    if (partial) {
      return jsonResponse(
        {
          error: "Claim history scan was incomplete",
          address,
          tracking_start_block: TRACKING_START_BLOCK,
          tracking_start_unix: TRACKING_START_UNIX,
          to_block: head,
          partial: true,
        },
        502,
      );
    }

    let delegation = 0n;
    let staking = 0n;
    for (const claim of claims) {
      const amount = BigInt(claim.amount_wei);
      if (claim.kind === "staking") staking += amount;
      else if (claim.kind === "delegation") delegation += amount;
    }
    const bondRewards = await loadBondRewardClaims(address);
    const bondClaimable = bondRewards.claims.reduce(
      (total, claim) => total + BigInt(claim.claimable_amount_wei),
      0n,
    );
    const bondClaimed = bondRewards.claims.reduce(
      (total, claim) =>
        total +
        BigInt(claim.lifetime_amount_wei) -
        BigInt(claim.claimable_amount_wei),
      0n,
    );

    return jsonResponse({
      generated_at_unix: Math.floor(Date.now() / 1000),
      address,
      tracking_start_block: TRACKING_START_BLOCK,
      tracking_start_unix: TRACKING_START_UNIX,
      to_block: head,
      partial,
      claimed: {
        total_wei: (delegation + staking + bondClaimed).toString(),
        delegation_wei: delegation.toString(),
        staking_wei: staking.toString(),
        bonds_wei: bondRewards.tracked ? bondClaimed.toString() : null,
      },
      claimable: {
        bonds_tracked: bondRewards.tracked,
        bonds_wei: bondRewards.tracked ? bondClaimable.toString() : null,
      },
      claims,
    });
  } catch (err) {
    // Deliberately an error, not a zero: a member page that quietly reports
    // "0 FLR earned" because an indexer timed out is a trust bug.
    return jsonResponse(
      { error: "Failed to read claim history", detail: String(err) },
      502,
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
