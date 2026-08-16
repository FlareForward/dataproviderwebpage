/**
 * Types + formatting helpers for the /rewards page. The shapes mirror the
 * Cloudflare Worker's `/api/rewards` payload (worker/index.ts, handleRewards) —
 * every figure originates from the Flare Systems Explorer indexer; the only
 * math applied server-side is decimal normalization and annualization.
 */

export interface RewardsRates {
  /** Human-readable statement of how the annual rates were derived. */
  basis: string;
  delegation_epoch_pct: number | null;
  delegation_annual_pct: number | null;
  staking_epoch_pct: number | null;
  staking_annual_pct: number | null;
  /**
   * What the validator self-bond earns (reward_rate_total_mirror). Runs higher
   * than `staking_annual_pct`, which is a delegator's rate net of our
   * delegation fee — the self-bond pays no such fee and earns an extra
   * component. See worker/bondYield.ts for the verified identities.
   */
  bond_epoch_pct?: number | null;
  bond_annual_pct?: number | null;
}

export interface RewardsBreakdownData {
  reward_epoch: number | null;
  delegation_flr: number | null;
  staking_flr: number | null;
  direct_flr: number | null;
  fees_flr: number | null;
  self_bond_flr: number | null;
}

export interface RewardsStaking {
  has_validator: boolean;
  self_bond_flr: number | null;
  delegated_flr: number | null;
  total_stake_flr: number | null;
  capacity_flr: number | null;
  space_left_flr: number | null;
  delegators_count: number | null;
  active_end_unix: number | null;
}

export interface PChainDelegator {
  p_address: string | null;
  stake_flr: number | null;
  start_unix: number | null;
  end_unix: number | null;
}

export interface RewardsData {
  generated_at_unix: number;
  identity_address: string;
  delegation_address: string | null;
  node_id: string | null;
  latest_reward_epoch: number | null;
  eligible_for_reward: boolean | null;
  conditions: {
    ftso_scaling: boolean | null;
    ftso_fast_updates: boolean | null;
    staking: boolean | null;
    fdc: boolean | null;
  };
  uptime_availability_pct: number | null;
  fee_pct: number | null;
  vote_power: {
    delegation_flr: number | null;
    staking_flr: number | null;
  };
  rates: RewardsRates;
  breakdown: RewardsBreakdownData;
  staking: RewardsStaking;
  delegators: PChainDelegator[];
}

/**
 * The one way this site turns wei into an FLR label. TRUNCATING, not rounding.
 *
 * My Rewards previously had two formatters: this rule inside EarningsStrip and
 * a plain `toLocaleString` round in Rewards.tsx. The same 224.6 FLR of staking
 * reward therefore rendered as "225" in the claim panel and "224" in the tile
 * directly beneath it — one balance, two numbers, on one screen. Every FLR
 * figure on a member page goes through here so that cannot happen again, and it
 * truncates because rounding up shows more money than the wallet actually has.
 */
export function fmtFlrWei(wei: bigint, digits = 0): string {
  const negative = wei < 0n;
  const abs = negative ? -wei : wei;
  const int = abs / 10n ** 18n;
  const frac = (abs % 10n ** 18n).toString().padStart(18, "0").slice(0, digits);
  const value = Number(frac ? `${int}.${frac}` : int.toString());
  return `${negative ? "-" : ""}${value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
  })}`;
}

export function fmtFlr(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

/**
 * A rate we can honestly show, or null.
 *
 * The live reward epoch reports 0 until it settles — a real number, so it slips
 * past a null check and renders as "0% APY" on pages whose whole job is to say
 * what this earns. Nothing has been measured at that point, so treat it as
 * absent and let the existing not-yet-known handling take over.
 */
export function settledRate(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function fmtPct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })}%`;
}

/** "54.3K FLR"-style compact label for large reward amounts. */
export function fmtFlrCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000_000)
    return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function fmtDate(unix: number | null | undefined): string {
  if (unix == null || !Number.isFinite(unix)) return "—";
  return new Date(unix * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function daysLeft(unix: number | null | undefined): number | null {
  if (unix == null || !Number.isFinite(unix)) return null;
  return Math.max(0, Math.ceil((unix * 1000 - Date.now()) / 86_400_000));
}

/** Classifies pasted address input: C-chain 0x, P-chain bech32, or neither. */
export function classifyAddress(
  input: string
): "cchain" | "pchain" | "invalid" {
  const s = input.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(s)) return "cchain";
  if (/^(P-)?flare1[02-9ac-hj-np-z]{6,}$/i.test(s)) return "pchain";
  return "invalid";
}

/** Normalizes a P-chain address for comparison (strip P- prefix, lowercase). */
export function normalizePChain(input: string): string {
  return input.trim().replace(/^P-/i, "").toLowerCase();
}

export function shortPAddress(address: string, chars = 6): string {
  const s = address.trim();
  if (s.length <= chars * 2 + 3) return s;
  return `${s.slice(0, chars + 2)}…${s.slice(-chars)}`;
}
