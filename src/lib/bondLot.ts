/**
 * FlareForward Bonds: lot contract config + ABI.
 *
 * The lot contract is `BondSeriesLot` (repo: ~/nft-bond-series). Terms are
 * immutable: `maxSupply` and `mintPrice` are constructor immutables and
 * `closeMint()` is one-way, so what the page reads is what a buyer gets. The
 * page derives everything from chain reads, never from hardcoded numbers,
 * so it cannot drift from the contract.
 */
import { ADDRESS_RE, TERM_PREVIEW } from "./termPreview";

/** Minimal ABI: only what the storefront reads and calls. */
export const bondLotAbi = [
  {
    type: "function",
    name: "maxSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "mintPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "mintOpen",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "finalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "payable",
    inputs: [{ name: "quantity", type: "uint256" }],
    outputs: [],
  },
  // ERC721Enumerable — lets the site list a wallet's tokens straight from the
  // contract, with no dependence on a third-party NFT indexer.
  {
    type: "function",
    name: "tokenOfOwnerByIndex",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** Minimal ABI for the 12 month Starship 2 term bond NFT. */
export const termBondAbi = [
  {
    type: "function",
    name: "isMintOpen",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "mintDeadline",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint64" }],
  },
  {
    type: "function",
    name: "bondExpiry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint64" }],
  },
  {
    type: "function",
    name: "bondVault",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "saleClosed",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "mintPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "maxSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenOfOwnerByIndex",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "payable",
    inputs: [{ name: "quantity", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "burn",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** Minimal ABI for a Starship 2 bond vault. */
export const bondVaultAbi = [
  {
    type: "function",
    name: "distributionFinalized",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "payoutPerToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "claimableForToken",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "expiry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint64" }],
  },
  {
    type: "function",
    name: "emergencyReleased",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
] as const;

/** Contract-enforced cap on a single mint call. */
export const MAX_BATCH_MINT = 25;

/** Holder payouts from a distributor are always in WFLR. */
export const WFLR_ADDRESS = "0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d" as const;

/**
 * The slice of Jon's RoyaltyDistributor ABI a holder needs. Selectors were
 * validated against the deployed bytecode (see worker/nftRewards.ts) and the
 * claim path was run end to end on mainnet dust lots on 2026-08-12 and 09-15.
 *
 *   claimable(id, token) = (cumulativeRewardPerToken(token)
 *                           - lastClaimedCumulativeReward(id, token)) / PRECISION
 *
 * Accounting is lazy: funds that arrive at the distributor are not reflected in
 * cumulativeRewardPerToken until someone calls processAccumulatedERC20Payments.
 * claimRewards reverts (0xbaf3f0f7) when nothing is owed, so never send it
 * with a computed claimable of zero.
 */
export const distributorAbi = [
  {
    type: "function",
    name: "PRECISION",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "cumulativeRewardPerToken",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "lastClaimedCumulativeReward",
    stateMutability: "view",
    inputs: [{ type: "uint256" }, { type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    // Balance the distributor has already credited to holders. Anything above
    // it is a release that arrived and has not been processed yet (verified on
    // a mainnet fork 2026-09-24: 0 after poke, 0 after claim, +release after a
    // new send).
    type: "function",
    name: "lastKnownBalance",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "processAccumulatedERC20Payments",
    stateMutability: "nonpayable",
    inputs: [{ type: "address[]", name: "erc20Tokens" }],
    outputs: [],
  },
  {
    type: "function",
    name: "claimRewards",
    stateMutability: "nonpayable",
    inputs: [
      { type: "uint256[]", name: "tokenIds" },
      { type: "address[]", name: "paymentTokens" },
    ],
    outputs: [],
  },
] as const;

export interface BondTier {
  key: string;
  /** Starship family this tier belongs to. */
  series: "Starship 1" | "Starship 2";
  /** Share tiers are perpetual; term tiers redeem at maturity. */
  kind?: "share" | "term";
  /** Display name for the tier. */
  name: string;
  /** Deployed NFT address, or null until the tier is deployed. */
  address: `0x${string}` | null;
  /** Term vault address, or null until the tier is deployed. */
  vault?: `0x${string}` | null;
  /**
   * The lot's RoyaltyDistributor (VeriGuard rails), deployed only AFTER the lot
   * closes with totalTokenSupply = the final minted count. Null while the lot
   * is open: an open lot has no payout contract and its Claim stays shut.
   */
  distributor?: `0x${string}` | null;
  /** One line on who this tier is for. */
  blurb: string;
  /**
   * IPFS CID of the tier's artwork — the same image referenced by the token
   * metadata this lot was deployed with, so the card shows exactly what a
   * buyer receives. Sourced from config rather than the contract because
   * `tokenURI()` reverts for a token that doesn't exist yet, and a lot with
   * nothing minted has no token to read.
   */
  imageCid: string;
  /** Static launch terms for a term tier before its contracts are deployed. */
  terms?: { priceFlr: number; supply: number; termMonths: 12 };
}

/** Public IPFS gateway used for artwork. */
export const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs";

export interface BondLotConfig {
  /** e.g. "Lot 1" */
  label: string;
  tiers: BondTier[];
}

export function tierKind(tier: BondTier): "share" | "term" {
  return tier.kind ?? "share";
}

export function isShareTier(tier: BondTier): tier is BondTier & { kind?: "share" } {
  return tierKind(tier) === "share";
}

export function isTermTier(tier: BondTier): tier is BondTier & { kind: "term" } {
  return tierKind(tier) === "term";
}

const STARSHIP2_IMAGE_CID = "bafkreidevzhlpgczv3xt7nksocfigjckrshffwdtwmoejkyrxadkqezxie";

function withTermPreview(tier: BondTier): BondTier {
  if (tier.kind !== "term") return tier;
  const preview = TERM_PREVIEW?.tiers[tier.key];
  return preview ? { ...tier, address: preview.address, vault: preview.vault } : tier;
}

const STARSHIP2_TERM_TIERS: BondTier[] = [
  {
    key: "s2-10k",
    series: "Starship 2",
    kind: "term",
    name: "Starship 2 · 10,000 FLR",
    address: null,
    vault: null,
    blurb: "A 12 month term bond for the first Starship 2 tier.",
    imageCid: STARSHIP2_IMAGE_CID,
    terms: { priceFlr: 10_000, supply: 250, termMonths: 12 },
  },
  {
    key: "s2-50k",
    series: "Starship 2",
    kind: "term",
    name: "Starship 2 · 50,000 FLR",
    address: null,
    vault: null,
    blurb: "A 12 month term bond for the middle Starship 2 tier.",
    imageCid: STARSHIP2_IMAGE_CID,
    terms: { priceFlr: 50_000, supply: 50, termMonths: 12 },
  },
  {
    key: "s2-100k",
    series: "Starship 2",
    kind: "term",
    name: "Starship 2 · 100,000 FLR",
    address: null,
    vault: null,
    blurb: "A 12 month term bond for the largest Starship 2 tier.",
    imageCid: STARSHIP2_IMAGE_CID,
    terms: { priceFlr: 100_000, supply: 50, termMonths: 12 },
  },
];

/**
 * Current lot. Tier addresses stay null until deploy — the page renders the
 * "opening soon" state on null and the live storefront once an address lands.
 *
 * NOTE: deploying a lot OPENS its mint immediately (mintOpen is true from the
 * constructor and cannot be re-opened once closed), so addresses go in here at
 * launch time, not before.
 */
export const CURRENT_LOT: BondLotConfig = {
  label: "Starship 1 and 2",
  tiers: [
    {
      key: "tier-a",
      series: "Starship 1",
      kind: "share",
      name: "Lot 1 · 10,000 FLR",
      address: "0x697e2ece036253afb08ee35cb1bcb83fec361736",
      // Wired 2026-09-24 from the Bond Treasury Safe (Safe nonce 8): supply 250,
      // registered with the VeriGuard registry, royalty receiver set to it.
      distributor: "0x283CB0179c827d87f15927540098e5815697d21a",
      blurb: "The larger position. Sold out.",
      imageCid: "bafkreigm7v2lvlfy7dt44sfgt6b4lygrm3dqo4oc2varpb6uadnjvi6vfm",
    },
    {
      key: "tier-b",
      series: "Starship 1",
      kind: "share",
      name: "Lot 1 · 2,500 FLR",
      address: "0xbfa14e5949eae2180af20bb30511d9023c67daf9",
      blurb: "The accessible entry.",
      imageCid: "bafkreidvawf44wunnoabyz3kr2q4llv34ayekmz4vj3o3ygjihlstni37a",
    },
    {
      // Lot 2: a second run of the 10,000 FLR position after Lot 1's sold out.
      // Same contract code and terms shape; its own collection and, after close,
      // its own distributor. Address lands here the moment it is deployed.
      key: "lot2-10k",
      series: "Starship 1",
      kind: "share",
      name: "Lot 2 · 10,000 FLR",
      address: "0xd7b8d7f436b4b30b94a12457615f872dc4d5895a",
      blurb: "Second run of the larger position, 250 available.",
      imageCid: "bafkreidevzhlpgczv3xt7nksocfigjckrshffwdtwmoejkyrxadkqezxie",
    },
    {
      // Lot 3: a third denomination, not a re-run. Ten positions at 1,000,000
      // FLR. Its own collection and, after close, its own distributor, so its
      // payouts never mix with the 10,000 and 2,500 tiers. Deployed OWNED BY
      // THE BOND TREASURY SAFE FROM ITS FIRST BLOCK — unlike Lots 1 and 2,
      // there was never a window in which a single key controlled it.
      key: "lot3-1m",
      series: "Starship 1",
      kind: "share",
      name: "Lot 3 · 1,000,000 FLR",
      address: "0xf963b3d02d5b17f87a2caac6f6a388841cd58da6",
      blurb: "The largest position, 10 available.",
      imageCid: STARSHIP2_IMAGE_CID,
    },
    ...STARSHIP2_TERM_TIERS.map(withTermPreview),
  ],
};

/**
 * Preview override: `?lot=0x...` renders the storefront against any deployed
 * BondSeriesLot (used to verify against the mainnet dust lot before launch).
 * Read-only public chain data, and the UI labels it clearly.
 */
export { ADDRESS_RE };

/**
 * Custody facts /nft/disclosures publishes, verbatim from chain. These are
 * the addresses that control buyer capital; the page publishes the Safe
 * address plus the transaction that moved control. Keep this checkable —
 * the whole point of the section is that a reader can verify every line.
 */
export const CUSTODY = {
  /** Trezor EOA that ran Lots 1 and 2 until 2026-09-17. Owns no lot today; gas and script signer only. */
  treasuryKey: "0xc166B192F8e1F16cE4998De6d6893b3970781B1b" as `0x${string}`,
  /** 2-of-3 Safe, FTSO fee revenue only. Never holds bond capital. */
  operatingSafe: "0x619E7ed806838B36053Deb7089B7ECd4016C06dc" as `0x${string}`,
  /**
   * 2-of-3 Safe for buyer capital. `null` until deployed; then the address and
   * the tx hash of the first transfer of lot ownership into it go here.
   */
  bondTreasurySafe: "0x5Be87714FFc21F26945AA60e9ab6B7A3B023B70c" as `0x${string}` | null,
  /**
   * Tier A's `transferOwnership` — the first real lot handed to the Safe, on
   * 2026-09-17. Tier B (0xac1a1536…) and Lot 2 (0xb815332c…) followed in the
   * same sitting, so "every lot is owned by that Safe" is true as written.
   * Verified after: `owner()` reads the Safe on all three, and `closeMint()`
   * and `withdraw()` both revert `OwnableUnauthorizedAccount` for the old key.
   */
  bondTreasurySafeControlTx:
    "0x668f92bb43838a036cc8d151af4d54d5319677376bc02337d9ec86e05ba389a8" as
      | `0x${string}`
      | null,
  /** The first lot to close, and the date it closed — the "nothing paid yet" anchor. */
  firstClosedLot: { name: "Lot 1 · 10,000 FLR", closedOn: "2026-09-07" },
} as const;
