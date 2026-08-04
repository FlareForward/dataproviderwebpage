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

export function fmtFlr(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
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
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
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
