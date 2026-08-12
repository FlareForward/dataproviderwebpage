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
}

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
  label: "Lot 1",
  tiers: [
    {
      key: "tier-a",
      name: "10,000 FLR",
      address: "0x697e2ece036253afb08ee35cb1bcb83fec361736",
      blurb: "The larger position — 250 available.",
    },
    {
      key: "tier-b",
      name: "2,500 FLR",
      address: "0xbfa14e5949eae2180af20bb30511d9023c67daf9",
      blurb: "The accessible entry — 1,000 available.",
    },
  ],
};

/**
 * Preview override: `?lot=0x...` renders the storefront against any deployed
 * BondSeriesLot (used to verify against the mainnet dust lot before launch).
 * Read-only public chain data, and the UI labels it clearly.
 */
export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
