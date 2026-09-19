/**
 * FlareForward Bonds — lot contract config + ABI.
 *
 * The lot contract is `BondSeriesLot` (repo: ~/nft-bond-series). Terms are
 * immutable: `maxSupply` and `mintPrice` are constructor immutables and
 * `closeMint()` is one-way, so what the page reads is what a buyer gets. The
 * page derives everything from chain reads — never from hardcoded numbers —
 * so it cannot drift from the contract.
 */

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

/** Contract-enforced cap on a single mint call. */
export const MAX_BATCH_MINT = 25;

export interface BondTier {
  key: string;
  /** Display name for the tier. */
  name: string;
  /** Deployed BondSeriesLot address, or null until the lot is deployed. */
  address: `0x${string}` | null;
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
}

/** Public IPFS gateway used for artwork. */
export const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs";

export interface BondLotConfig {
  /** e.g. "Lot 1" */
  label: string;
  tiers: BondTier[];
}

/**
 * Current lot. Tier addresses stay null until deploy — the page renders the
 * "opening soon" state on null and the live storefront once an address lands.
 *
 * NOTE: deploying a lot OPENS its mint immediately (mintOpen is true from the
 * constructor and cannot be re-opened once closed), so addresses go in here at
 * launch time, not before.
 */
export const CURRENT_LOT: BondLotConfig = {
  label: "Lots 1–3",
  tiers: [
    {
      key: "tier-a",
      name: "Lot 1 · 10,000 FLR",
      address: "0x697e2ece036253afb08ee35cb1bcb83fec361736",
      blurb: "The larger position. Sold out.",
      imageCid: "bafkreigm7v2lvlfy7dt44sfgt6b4lygrm3dqo4oc2varpb6uadnjvi6vfm",
    },
    {
      key: "tier-b",
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
      name: "Lot 2 · 10,000 FLR",
      address: "0xd7b8d7f436b4b30b94a12457615f872dc4d5895a",
      blurb: "Second run of the larger position — 250 available.",
      imageCid: "bafkreidevzhlpgczv3xt7nksocfigjckrshffwdtwmoejkyrxadkqezxie",
    },
    {
      // Lot 3: a third denomination, not a re-run. Ten positions at 1,000,000
      // FLR. Its own collection and, after close, its own distributor, so its
      // payouts never mix with the 10,000 and 2,500 tiers. Deployed OWNED BY
      // THE BOND TREASURY SAFE FROM ITS FIRST BLOCK — unlike Lots 1 and 2,
      // there was never a window in which a single key controlled it.
      key: "lot3-1m",
      name: "Lot 3 · 1,000,000 FLR",
      address: "0xf963b3d02d5b17f87a2caac6f6a388841cd58da6",
      blurb: "The largest position — 10 available.",
      imageCid: "bafkreidevzhlpgczv3xt7nksocfigjckrshffwdtwmoejkyrxadkqezxie",
    },
  ],
};

/**
 * Preview override: `?lot=0x...` renders the storefront against any deployed
 * BondSeriesLot (used to verify against the mainnet dust lot before launch).
 * Read-only public chain data, and the UI labels it clearly.
 */
export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Custody facts the /nft page discloses, verbatim from chain. These are the
 * addresses that actually control buyer capital today; the page renders the
 * single-key state until `bondTreasurySafe` is filled in, and then publishes
 * the address plus the transaction that moved control. Keep this honest —
 * the whole point of the section is that a reader can check every line.
 */
export const CUSTODY = {
  /** Trezor EOA: owns every lot contract and holds swept proceeds (wrapped, delegated). */
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
