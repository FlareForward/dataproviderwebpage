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

const EPOCHS_PER_YEAR = 104.2857;
const RATE_HUNDREDTHS_NUMERATOR = 7_300_000n;
const RATE_HUNDREDTHS_DENOMINATOR = 7n;

/** RewardManager creation block: the true floor for attributed V2 rewards. */
const TRACKING_START_BLOCK = 29549020;
/** FlareForward's first attributable claim date, 2026-07-13 UTC. */
const TRACKING_START_UNIX = 1783900800;

/** RewardManager (Flare Systems Protocol V2) pays delegation and staking claims. */
const REWARD_MANAGER = "0xC8f55c5aA2C752eE285Bd872855C749f4ee6239B";
const FLARE_CONTRACT_REGISTRY =
  "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";

const EXPECTED_CONTRACTS = {
  wNat: "0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d",
  flareSystemsManager: "0x89e50DC0380e597ecE79c8494bAAFD84537AD0D4",
  pChainStakeMirror: "0x7b61F9F27153a4F2F57Dc30bF08A8eb0cCB96C22",
} as const;

const CONTRACT_NAMES = {
  wNat: "WNat",
  flareSystemsManager: "FlareSystemsManager",
  pChainStakeMirror: "PChainStakeMirror",
} as const;

const SEL = {
  getContractAddressByName: "0x82760fca",
  getVotePowerBlock: "0xc2632216",
  wNatVotePowerFromToAt: "0xe64767aa",
  pChainVotePowerFromToAt: "0x1f7ff2c7",
} as const;

/**
 * The addresses that appear as `voter` on a reward FlareForward earned.
 *
 * ⚠️ The identity address is NOT one of them in practice. Each reward stream
 * is credited to the ROLE address EntityManager holds for it, read on chain
 * 2026-08-27 from EntityManager 0x134b3311c6bded895556807a30c7f047d99dfdc2:
 *
 *   getDelegationAddressOf(0x1FBB…) -> 0xce2c92c5…  delegation (WNAT) claims
 *   getNodeIdsOf(0x1FBB…)           -> 0x3243c29a…  staking (MIRROR) claims
 *
 * Filtering on the identity alone matched only our own FEE claims and returned
 * zero for every member — which then read as "no one has ever earned anything
 * through us" rather than as the bug it was. Keep all three.
 */
const FLAREFORWARD_IDENTITY = "0x1FBB55a1877817A0f90cAE60c1ab22FC94f97110";
const FLAREFORWARD_DELEGATION_ADDRESS =
  "0xce2c92c54f7307894725e8ceb16424b7c9c18807";
const FLAREFORWARD_NODE_IDS = ["0x3243c29a0658ce530b9e4fc610d2af2cbfbc5487"];

const FLAREFORWARD_VOTERS = [
  FLAREFORWARD_IDENTITY,
  FLAREFORWARD_DELEGATION_ADDRESS,
  ...FLAREFORWARD_NODE_IDS,
];

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
  principal_wei: string | null;
  rate_annualized_pct: number | null;
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

interface RpcCall {
  to: string;
  data: string;
}

type RpcSettledResult =
  | { ok: true; result: string }
  | { ok: false; error: string };

interface ContractAddresses {
  wNat: string;
  flareSystemsManager: string;
  pChainStakeMirror: string;
}

interface RateDecoratedClaims {
  claims: EarnedClaim[];
  ratesPartial: boolean;
}

let contractAddressCache: ContractAddresses | null = null;
let contractAddressPromise: Promise<ContractAddresses> | null = null;
const votePowerBlockCache = new Map<number, bigint>();
const principalCache = new Map<string, bigint>();

function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function strip0x(value: string): string {
  return value.replace(/^0x/, "");
}

function padUint(value: number | bigint): string {
  return BigInt(value).toString(16).padStart(64, "0");
}

function padAddress(address: string): string {
  return strip0x(address).toLowerCase().padStart(64, "0");
}

function padBytes20(value: string): string {
  return strip0x(value).toLowerCase().padEnd(64, "0");
}

function utf8Hex(value: string): string {
  return Array.from(new TextEncoder().encode(value))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function padDynamicBytes(hex: string): string {
  const remainder = hex.length % 64;
  return remainder === 0 ? hex : hex + "0".repeat(64 - remainder);
}

function encodeStringCall(selector: string, value: string): string {
  const bytes = utf8Hex(value);
  return `0x${strip0x(selector)}${padUint(32)}${padUint(
    bytes.length / 2,
  )}${padDynamicBytes(bytes)}`;
}

function encodeGetVotePowerBlock(epoch: number): string {
  return `${SEL.getVotePowerBlock}${padUint(epoch)}`;
}

function encodeDelegationPrincipal(
  owner: string,
  votePowerBlock: bigint,
): string {
  return `${SEL.wNatVotePowerFromToAt}${padAddress(owner)}${padAddress(
    FLAREFORWARD_DELEGATION_ADDRESS,
  )}${padUint(votePowerBlock)}`;
}

function encodeStakingPrincipal(
  owner: string,
  nodeId: string,
  votePowerBlock: bigint,
): string {
  return `${SEL.pChainVotePowerFromToAt}${padAddress(owner)}${padBytes20(
    nodeId,
  )}${padUint(votePowerBlock)}`;
}

function decodeUint(raw: string): bigint {
  const hex = strip0x(raw);
  if (!hex) return 0n;
  return BigInt(`0x${hex}`);
}

function decodeAddress(raw: string): string {
  const address = `0x${strip0x(raw).slice(-40)}`;
  if (!isAddress(address)) throw new Error(`Invalid address result: ${raw}`);
  return address;
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function principalKey(owner: string, epoch: number, kind: EarnedKind): string {
  return `${owner.toLowerCase()}:${epoch}:${kind}`;
}

function rateAnnualizedPct(
  amountWei: bigint,
  principalWei: bigint,
): number | null {
  if (principalWei <= 0n) return null;
  const hundredths =
    (amountWei * RATE_HUNDREDTHS_NUMERATOR) /
    (principalWei * RATE_HUNDREDTHS_DENOMINATOR);
  return Number(hundredths) / 100;
}

async function ethCallBatchSettled(
  calls: RpcCall[],
): Promise<RpcSettledResult[]> {
  if (calls.length === 0) return [];
  const body = calls.map((call, id) => ({
    jsonrpc: "2.0",
    id,
    method: "eth_call",
    params: [{ to: call.to, data: call.data }, "latest"],
  }));
  const res = await fetch(FLARE_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`RPC eth_call batch -> ${res.status}`);

  const json = (await res.json()) as Array<{
    id?: unknown;
    result?: unknown;
    error?: unknown;
  }>;
  if (!Array.isArray(json)) throw new Error("RPC batch returned no array");

  const results: RpcSettledResult[] = calls.map(() => ({
    ok: false,
    error: "missing RPC response",
  }));
  for (const entry of json) {
    if (typeof entry.id !== "number" || entry.id < 0 || entry.id >= calls.length) {
      continue;
    }
    if (typeof entry.result === "string") {
      results[entry.id] = { ok: true, result: entry.result };
    } else {
      results[entry.id] = {
        ok: false,
        error: JSON.stringify(entry.error ?? "missing result"),
      };
    }
  }
  return results;
}

async function resolveContractAddresses(): Promise<ContractAddresses> {
  if (contractAddressCache) return contractAddressCache;
  if (!contractAddressPromise) {
    contractAddressPromise = (async () => {
      const keys = [
        "wNat",
        "flareSystemsManager",
        "pChainStakeMirror",
      ] as const;
      const results = await ethCallBatchSettled(
        keys.map((key) => ({
          to: FLARE_CONTRACT_REGISTRY,
          data: encodeStringCall(
            SEL.getContractAddressByName,
            CONTRACT_NAMES[key],
          ),
        })),
      );
      const resolved = {} as ContractAddresses;
      keys.forEach((key, index) => {
        const result = results[index];
        if (!result.ok) throw new Error(`Registry ${CONTRACT_NAMES[key]} failed`);
        const address = decodeAddress(result.result);
        if (!sameAddress(address, EXPECTED_CONTRACTS[key])) {
          throw new Error(
            `Registry ${CONTRACT_NAMES[key]} -> ${address}, expected ${EXPECTED_CONTRACTS[key]}`,
          );
        }
        resolved[key] = address;
      });
      contractAddressCache = resolved;
      return resolved;
    })().catch((err) => {
      contractAddressPromise = null;
      throw err;
    });
  }
  return contractAddressPromise;
}

async function decorateEarnedClaimRates(
  owner: string,
  claims: EarnedClaim[],
): Promise<RateDecoratedClaims> {
  const decorated = claims.map((claim) => ({
    ...claim,
    principal_wei: claim.principal_wei ?? null,
    rate_annualized_pct: claim.rate_annualized_pct ?? null,
  }));
  const missing = new Map<
    string,
    { owner: string; epoch: number; kind: "delegation" | "staking" }
  >();

  for (const claim of decorated) {
    if (
      claim.epoch == null ||
      (claim.kind !== "delegation" && claim.kind !== "staking")
    ) {
      continue;
    }
    const key = principalKey(owner, claim.epoch, claim.kind);
    const cached = principalCache.get(key);
    if (cached !== undefined) {
      claim.principal_wei = cached.toString();
      claim.rate_annualized_pct = rateAnnualizedPct(
        BigInt(claim.amount_wei),
        cached,
      );
    } else {
      missing.set(key, { owner, epoch: claim.epoch, kind: claim.kind });
    }
  }

  if (missing.size === 0) return { claims: decorated, ratesPartial: false };

  let contracts: ContractAddresses;
  try {
    contracts = await resolveContractAddresses();
  } catch {
    return { claims: decorated, ratesPartial: true };
  }

  let ratesPartial = false;
  const missingEpochs = Array.from(
    new Set(
      Array.from(missing.values())
        .map((entry) => entry.epoch)
        .filter((epoch) => !votePowerBlockCache.has(epoch)),
    ),
  );
  try {
    const votePowerResults = await ethCallBatchSettled(
      missingEpochs.map((epoch) => ({
        to: contracts.flareSystemsManager,
        data: encodeGetVotePowerBlock(epoch),
      })),
    );
    votePowerResults.forEach((result, index) => {
      const epoch = missingEpochs[index];
      if (result.ok) {
        votePowerBlockCache.set(epoch, decodeUint(result.result));
      } else {
        ratesPartial = true;
      }
    });
  } catch {
    return { claims: decorated, ratesPartial: true };
  }

  const principalCalls: RpcCall[] = [];
  const principalCallKeys: string[] = [];
  for (const [key, entry] of missing) {
    const votePowerBlock = votePowerBlockCache.get(entry.epoch);
    if (votePowerBlock === undefined) continue;
    if (entry.kind === "delegation") {
      principalCalls.push({
        to: contracts.wNat,
        data: encodeDelegationPrincipal(entry.owner, votePowerBlock),
      });
      principalCallKeys.push(key);
    } else {
      for (const nodeId of FLAREFORWARD_NODE_IDS) {
        principalCalls.push({
          to: contracts.pChainStakeMirror,
          data: encodeStakingPrincipal(entry.owner, nodeId, votePowerBlock),
        });
        principalCallKeys.push(key);
      }
    }
  }

  const principalSums = new Map<string, bigint>();
  const failedPrincipalKeys = new Set<string>();
  try {
    const principalResults = await ethCallBatchSettled(principalCalls);
    principalResults.forEach((result, index) => {
      const key = principalCallKeys[index];
      if (!result.ok) {
        failedPrincipalKeys.add(key);
        ratesPartial = true;
        return;
      }
      try {
        principalSums.set(
          key,
          (principalSums.get(key) ?? 0n) + decodeUint(result.result),
        );
      } catch {
        failedPrincipalKeys.add(key);
        ratesPartial = true;
      }
    });
  } catch {
    return { claims: decorated, ratesPartial: true };
  }

  for (const key of principalSums.keys()) {
    if (!failedPrincipalKeys.has(key)) {
      principalCache.set(key, principalSums.get(key) ?? 0n);
    }
  }

  for (const claim of decorated) {
    if (
      claim.epoch == null ||
      (claim.kind !== "delegation" && claim.kind !== "staking")
    ) {
      continue;
    }
    const principal = principalCache.get(principalKey(owner, claim.epoch, claim.kind));
    if (principal === undefined) continue;
    claim.principal_wei = principal.toString();
    claim.rate_annualized_pct = rateAnnualizedPct(
      BigInt(claim.amount_wei),
      principal,
    );
  }

  return { claims: decorated, ratesPartial };
}

export function __resetEarnedRateCachesForTest(): void {
  contractAddressCache = null;
  contractAddressPromise = null;
  votePowerBlockCache.clear();
  principalCache.clear();
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
    principal_wei: null,
    rate_annualized_pct: null,
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

  // One window per (range, voter). Blockscout cannot OR a topic, and querying
  // owner-only then filtering locally would risk the 1000-row cap truncating a
  // busy wallet's foreign claims before our own were ever seen.
  const batches = await Promise.all(
    ranges.flatMap(([from, to]) =>
      FLAREFORWARD_VOTERS.map((voter) =>
        fetchLogWindow(
          REWARD_MANAGER,
          V2_CLAIM_TOPIC,
          {
            1: topicFor(voter),
            2: topicFor(owner),
          },
          from,
          to,
        ),
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

export async function loadEarnedResponse(
  address: string,
): Promise<{ body: unknown; status: number }> {
  if (!isAddress(address)) {
    return {
      body: { error: "A 0x wallet address is required" },
      status: 400,
    };
  }

  try {
    const head = await currentBlock();
    const { claims, partial } = await loadEarnedClaims(address, head);
    if (partial) {
      return {
        body: {
          error: "Claim history scan was incomplete",
          address,
          tracking_start_block: TRACKING_START_BLOCK,
          tracking_start_unix: TRACKING_START_UNIX,
          to_block: head,
          partial: true,
        },
        status: 502,
      };
    }
    const rated = await decorateEarnedClaimRates(address, claims);

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

    return {
      body: {
        generated_at_unix: Math.floor(Date.now() / 1000),
        address,
        tracking_start_block: TRACKING_START_BLOCK,
        tracking_start_unix: TRACKING_START_UNIX,
        to_block: head,
        partial,
        epochs_per_year: EPOCHS_PER_YEAR,
        rates_partial: rated.ratesPartial,
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
        claims: rated.claims,
      },
      status: 200,
    };
  } catch (err) {
    // Deliberately an error, not a zero: a member page that quietly reports
    // "0 FLR earned" because an indexer timed out is a trust bug.
    return {
      body: { error: "Failed to read claim history", detail: String(err) },
      status: 502,
    };
  }
}

export async function handleEarned(request: Request): Promise<Response> {
  const address = new URL(request.url).searchParams.get("address") ?? "";
  const { body, status } = await loadEarnedResponse(address);
  return jsonResponse(body, status);
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
