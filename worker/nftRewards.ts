/**
 * `/api/nft-rewards` — public rewards board for FlareForward NFT bond-series
 * lots, read from VeriGuard (BluebirdX) RoyaltyDistributor contracts on Flare.
 *
 * Zero-dependency chain access: hand-encoded eth_call over JSON-RPC batches.
 * Selectors were derived from the deployed distributor bytecode and validated
 * against the live mainnet deployments on 2026-08-11 — the cumulative
 * accounting closes against the contracts' actual WFLR balances.
 *
 * Claimable math (validated):
 *   claimable(id, token) = (cumulativeRewardPerToken(token)
 *                           - lastClaimedCumulativeReward(id, token)) / PRECISION
 *
 * The whole board is cached in the Workers Cache API for an hour — every
 * visitor shares one hourly chain read (a lot is supply × paymentTokens
 * lastClaimed reads, batched ~200 calls per RPC request).
 */

const RPC = "https://flare-api.flare.network/ext/C/rpc";
const BLOCKSCOUT = "https://flare-explorer.flare.network/api";

const SEL = {
  totalTokenSupply: "0x1ca8b6cb", // totalTokenSupply()
  erc721Token: "0x5f2d6bcd", // erc721Token()
  supportedPaymentTokens: "0x0c76a4f3", // getSupportedPaymentTokens()
  cumulativeRewardPerToken: "0x9862ddb6", // cumulativeRewardPerToken(address)
  lastClaimedCumulativeReward: "0x943ed41d", // lastClaimedCumulativeReward(uint256,address)
  precision: "0xaaf5eb68", // PRECISION()
  erc721BalanceOf: "0x70a08231", // balanceOf(address)
  erc721TokenOfOwnerByIndex: "0x2f745c59", // tokenOfOwnerByIndex(address,uint256)
} as const;

const NATIVE = "0x0000000000000000000000000000000000000000";
const WFLR = "0x1d80c49bbbcd1c0911346656b529df9e5c2f783d";
const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TOKEN_LABELS: Record<string, string> = {
  [NATIVE]: "FLR",
  [WFLR]: "WFLR",
};

/**
 * Lot registry. A lot appears on the public board by being added here with
 * live: true. The distributor is deployed AFTER a lot's mint closes, with
 * totalTokenSupply = actual minted count (see ~/codex-coord/nft-raise/SPEC.md).
 */
interface Lot {
  slug: string;
  name: string;
  distributor: string;
  live: boolean;
}

export const LOTS: Lot[] = [
  {
    // Lot 1 Tier A. Closed 2026-09-07 at 250/250. Distributor deployed from the
    // Bond Treasury Safe on 2026-09-24 (Safe nonce 8) with totalTokenSupply 250,
    // registered with the VeriGuard registry, royalty receiver set to it.
    slug: "lot1-tier-a",
    name: "Lot 1 Tier A (10,000 FLR)",
    distributor: "0x283CB0179c827d87f15927540098e5815697d21a",
    live: true,
  },
  {
    // Lot 1 Tier B. Closed at 21/21. Distributor deployed from the Bond Treasury
    // Safe on 2026-10-02 (Safe nonce 14, factory nonce 13) with totalTokenSupply 21,
    // registered with the VeriGuard registry, royalty receiver set to it.
    slug: "lot1-tier-b",
    name: "Lot 1 Tier B (2,500 FLR)",
    distributor: "0x43EFE3eC5084762f8ba0DDC6478a8C6b27810811",
    live: true,
  },
  {
    // Lot 2. Closed at 28/28. Same Safe batch (nonce 14, factory nonce 14), supply 28.
    slug: "lot2",
    name: "Lot 2 (10,000 FLR)",
    distributor: "0xA7a2E4563bd19C3b987236D401174B3D87834712",
    live: true,
  },
  {
    // Lot 3. Closed at 2/2. Same Safe batch (nonce 14, factory nonce 15), supply 2.
    slug: "lot3",
    name: "Lot 3 (1,000,000 FLR)",
    distributor: "0x86F3fE537B30257Bd9ad4f4D30300DF66DFdE22B",
    live: true,
  },
];

/**
 * Preview mode: `?preview=0x<distributor>` renders any distributor (e.g. the
 * VeriGuard Power On deployments) without listing it publicly. Read-only public
 * chain data, so exposing it is harmless — the UI labels it as a preview.
 */
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

const BOARD_CACHE_SECONDS = 3600;

type RpcCall = { to: string; data: string };

function pad(hex: string): string {
  return hex.replace(/^0x/, "").toLowerCase().padStart(64, "0");
}

function padUint(n: number | bigint): string {
  return BigInt(n).toString(16).padStart(64, "0");
}

async function ethCallBatch(
  calls: RpcCall[],
  chunkSize = 200,
): Promise<string[]> {
  const results: string[] = new Array(calls.length);
  for (let start = 0; start < calls.length; start += chunkSize) {
    const chunk = calls.slice(start, start + chunkSize);
    const body = chunk.map((c, i) => ({
      jsonrpc: "2.0",
      id: start + i,
      method: "eth_call",
      params: [{ to: c.to, data: c.data }, "latest"],
    }));
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`RPC ${res.status}`);
    const json = (await res.json()) as {
      id: number;
      result?: string;
      error?: unknown;
    }[];
    for (const entry of json) {
      if (entry.result === undefined) {
        throw new Error(`eth_call failed: ${JSON.stringify(entry.error)}`);
      }
      results[entry.id] = entry.result;
    }
  }
  return results;
}

function decodeAddressArray(raw: string): string[] {
  const hex = raw.replace(/^0x/, "");
  const words: string[] = [];
  for (let i = 0; i < hex.length; i += 64) words.push(hex.slice(i, i + 64));
  if (words.length < 2) return [];
  const len = Number(BigInt("0x" + words[1]));
  return words.slice(2, 2 + len).map((w) => "0x" + w.slice(24));
}

/** bigint wei -> decimal string ("3559.0789"), JSON-safe (no float precision loss). */
function weiToDecimal(wei: bigint, decimals = 4): string {
  const neg = wei < 0n;
  const abs = neg ? -wei : wei;
  const whole = abs / 10n ** 18n;
  const frac = (abs % 10n ** 18n)
    .toString()
    .padStart(18, "0")
    .slice(0, decimals);
  return `${neg ? "-" : ""}${whole}${decimals > 0 ? "." + frac : ""}`;
}

interface BoardRowJson {
  id: number;
  claimable: Record<string, string>; // label -> decimal amount
  total: string;
  has_claimed: boolean;
}

export interface BondRewardClaim {
  lot_slug: string;
  lot_name: string;
  distributor: string;
  collection: string;
  token_id: number;
  lifetime_amount_wei: string;
  claimable_amount_wei: string;
}

export interface BondPayoutRelease {
  block: number;
  unix: number;
  amount_wei: string;
  per_bond_amount_wei: string;
}

export interface BondRewardLot {
  lot_slug: string;
  lot_name: string;
  distributor: string;
  collection: string;
  held: number;
  lifetime_per_bond_wei: string;
  lifetime_amount_wei: string;
  claimable_amount_wei: string;
  payouts_available: boolean;
  payouts: BondPayoutRelease[];
}

export function hasLiveBondRewardDistributors(): boolean {
  return LOTS.some((l) => l.live);
}

function blockscoutNumber(value: string | undefined): number {
  if (!value) return 0;
  return Number.parseInt(value, value.startsWith("0x") ? 16 : 10);
}

async function fetchBondPayoutHistory(
  distributor: string,
  supply: bigint,
): Promise<BondPayoutRelease[]> {
  if (supply <= 0n) return [];
  const params = new URLSearchParams({
    module: "logs",
    action: "getLogs",
    fromBlock: "0",
    toBlock: "latest",
    address: WFLR,
    topic0: ERC20_TRANSFER_TOPIC,
    topic2: `0x${pad(distributor)}`,
    topic0_2_opr: "and",
  });
  const res = await fetch(`${BLOCKSCOUT}?${params}`, {
    headers: { Accept: "application/json" },
    cf: { cacheTtl: 60, cacheEverything: true },
  } as RequestInit);
  if (!res.ok) throw new Error(`Blockscout bond payouts -> ${res.status}`);
  const body = (await res.json()) as {
    message?: string;
    result?: Array<{ blockNumber?: string; timeStamp?: string; data?: string }>;
  };
  if (!Array.isArray(body.result)) {
    if (typeof body.message === "string" && /no logs found/i.test(body.message)) {
      return [];
    }
    throw new Error(`Blockscout bond payouts: ${body.message ?? "unexpected payload"}`);
  }
  return body.result
    .map((log) => {
      const amount = BigInt(log.data ?? "0x0");
      return {
        block: blockscoutNumber(log.blockNumber),
        unix: blockscoutNumber(log.timeStamp),
        amount_wei: amount.toString(),
        per_bond_amount_wei: (amount / supply).toString(),
      };
    })
    .filter((release) => BigInt(release.amount_wei) > 0n)
    .sort((a, b) => b.unix - a.unix || b.block - a.block);
}

async function fetchBondRewardClaimsForLot(
  owner: string,
  lot: { slug: string; name: string; distributor: string },
): Promise<{ claims: BondRewardClaim[]; lot: BondRewardLot | null }> {
  const d = lot.distributor;
  const [collectionRaw, tokensRaw, precisionRaw] = await ethCallBatch([
    { to: d, data: SEL.erc721Token },
    { to: d, data: SEL.supportedPaymentTokens },
    { to: d, data: SEL.precision },
  ]);

  const collection = "0x" + collectionRaw.slice(-40);
  const paymentTokens = decodeAddressArray(tokensRaw);
  const precision = BigInt(precisionRaw);

  const [balanceRaw] = await ethCallBatch([
    { to: collection, data: SEL.erc721BalanceOf + pad(owner) },
  ]);
  const balance = Number(BigInt(balanceRaw));
  if (balance <= 0 || paymentTokens.length === 0) {
    return { claims: [], lot: null };
  }

  const [tokenIdRaw, supplyRaw] = await Promise.all([
    ethCallBatch(Array.from({ length: balance }, (_, index) => ({
      to: collection,
      data: SEL.erc721TokenOfOwnerByIndex + pad(owner) + padUint(index),
    }))),
    ethCallBatch([{ to: d, data: SEL.totalTokenSupply }]),
  ]);
  const tokenIds = tokenIdRaw.map((raw) => Number(BigInt(raw)));
  const supply = BigInt(supplyRaw[0]);

  const cumRaw = await ethCallBatch(
    paymentTokens.map((t) => ({
      to: d,
      data: SEL.cumulativeRewardPerToken + pad(t),
    })),
  );
  const cum = paymentTokens.map((_, i) => BigInt(cumRaw[i]));

  const lastRaw = await ethCallBatch(
    tokenIds.flatMap((tokenId) =>
      paymentTokens.map((t) => ({
        to: d,
        data: SEL.lastClaimedCumulativeReward + padUint(tokenId) + pad(t),
      })),
    ),
  );

  const claims = tokenIds
    .map((tokenId, tokenIndex) => {
      let lifetime = 0n;
      let claimable = 0n;
      paymentTokens.forEach((_, tokenPaymentIndex) => {
        const last = BigInt(
          lastRaw[tokenIndex * paymentTokens.length + tokenPaymentIndex],
        );
        if (precision > 0n) {
          lifetime += cum[tokenPaymentIndex] / precision;
          claimable += (cum[tokenPaymentIndex] - last) / precision;
        }
      });
      return {
        lot_slug: lot.slug,
        lot_name: lot.name,
        distributor: d,
        collection,
        token_id: tokenId,
        lifetime_amount_wei: lifetime.toString(),
        claimable_amount_wei: claimable.toString(),
      };
    })
    .filter(
      (claim) =>
        claim.lifetime_amount_wei !== "0" || claim.claimable_amount_wei !== "0",
    );
  const lifetimePerBond = paymentTokens.reduce(
    (total, _, index) => total + (precision > 0n ? cum[index] / precision : 0n),
    0n,
  );
  const lifetimeAmount = lifetimePerBond * BigInt(balance);
  const claimableAmount = claims.reduce(
    (total, claim) => total + BigInt(claim.claimable_amount_wei),
    0n,
  );
  let payouts: BondPayoutRelease[] = [];
  let payoutsAvailable = true;
  try {
    payouts = await fetchBondPayoutHistory(d, supply);
  } catch {
    payoutsAvailable = false;
  }

  return {
    claims,
    lot: {
      lot_slug: lot.slug,
      lot_name: lot.name,
      distributor: d,
      collection,
      held: balance,
      lifetime_per_bond_wei: lifetimePerBond.toString(),
      lifetime_amount_wei: lifetimeAmount.toString(),
      claimable_amount_wei: claimableAmount.toString(),
      payouts_available: payoutsAvailable,
      payouts,
    },
  };
}

export async function loadBondRewardClaims(
  owner: string,
): Promise<{ tracked: boolean; claims: BondRewardClaim[]; lots: BondRewardLot[] }> {
  const targets = LOTS.filter((l) => l.live);
  if (targets.length === 0) return { tracked: false, claims: [], lots: [] };

  const claims: BondRewardClaim[] = [];
  const lots: BondRewardLot[] = [];
  for (const lot of targets) {
    const reward = await fetchBondRewardClaimsForLot(owner, lot);
    claims.push(...reward.claims);
    if (reward.lot) lots.push(reward.lot);
  }
  return { tracked: true, claims, lots };
}

async function fetchBoard(lot: {
  slug: string;
  name: string;
  distributor: string;
  preview: boolean;
}) {
  const d = lot.distributor;
  const [supplyRaw, collectionRaw, tokensRaw, precisionRaw] =
    await ethCallBatch([
      { to: d, data: SEL.totalTokenSupply },
      { to: d, data: SEL.erc721Token },
      { to: d, data: SEL.supportedPaymentTokens },
      { to: d, data: SEL.precision },
    ]);

  const supply = Number(BigInt(supplyRaw));
  const collection = "0x" + collectionRaw.slice(-40);
  const precision = BigInt(precisionRaw);
  const paymentTokens = decodeAddressArray(tokensRaw);

  const cumRaw = await ethCallBatch(
    paymentTokens.map((t) => ({
      to: d,
      data: SEL.cumulativeRewardPerToken + pad(t),
    })),
  );
  const cum = paymentTokens.map((_, i) => BigInt(cumRaw[i]));

  const lastCalls: RpcCall[] = [];
  for (let id = 1; id <= supply; id++) {
    for (const t of paymentTokens) {
      lastCalls.push({
        to: d,
        data: SEL.lastClaimedCumulativeReward + padUint(id) + pad(t),
      });
    }
  }
  const lastRaw = await ethCallBatch(lastCalls);

  const rows: BoardRowJson[] = [];
  let unclaimedTotal = 0n;
  for (let id = 1; id <= supply; id++) {
    const claimable: Record<string, string> = {};
    let total = 0n;
    let hasClaimed = false;
    paymentTokens.forEach((t, ti) => {
      const last = BigInt(lastRaw[(id - 1) * paymentTokens.length + ti]);
      const wei = precision > 0n ? (cum[ti] - last) / precision : 0n;
      if (last > 0n) hasClaimed = true;
      claimable[TOKEN_LABELS[t] ?? t] = weiToDecimal(wei);
      total += wei;
    });
    unclaimedTotal += total;
    rows.push({
      id,
      claimable,
      total: weiToDecimal(total),
      has_claimed: hasClaimed,
    });
  }
  // Biggest unclaimed balances first; stable by id.
  rows.sort((a, b) => Number(b.total) - Number(a.total) || a.id - b.id);

  const lifetimePerNft = paymentTokens.reduce(
    (acc, _, ti) => acc + (precision > 0n ? cum[ti] / precision : 0n),
    0n,
  );

  return {
    slug: lot.slug,
    name: lot.name,
    preview: lot.preview,
    distributor: d,
    collection,
    supply,
    payment_tokens: paymentTokens.map((t) => TOKEN_LABELS[t] ?? t),
    unclaimed_total: weiToDecimal(unclaimedTotal, 2),
    lifetime_per_nft: weiToDecimal(lifetimePerNft, 4),
    rows,
  };
}

export async function handleNftRewards(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const preview = url.searchParams.get("preview");

  // Shared hourly cache (per full URL, so previews cache independently).
  const cacheKey = new Request(url.toString(), { method: "GET" });
  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const targets: {
    slug: string;
    name: string;
    distributor: string;
    preview: boolean;
  }[] = LOTS.filter((l) => l.live).map((l) => ({ ...l, preview: false }));
  if (preview && ADDRESS_RE.test(preview)) {
    targets.push({
      slug: "preview",
      name: "Preview",
      distributor: preview,
      preview: true,
    });
  }

  let body: unknown;
  let status = 200;
  try {
    const boards = [];
    for (const t of targets) boards.push(await fetchBoard(t));
    body = { generated_at_unix: Math.floor(Date.now() / 1000), boards };
  } catch (err) {
    body = { error: "Failed to read distributor state", detail: String(err) };
    status = 502;
  }

  const res = new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control":
        status === 200
          ? `public, max-age=${BOARD_CACHE_SECONDS}, stale-while-revalidate=${BOARD_CACHE_SECONDS}`
          : "public, max-age=60",
    },
  });
  if (status === 200) await cache.put(cacheKey, res.clone());
  return res;
}
