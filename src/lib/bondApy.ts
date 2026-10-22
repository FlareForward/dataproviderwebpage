import { parseUnits } from "viem";

/**
 * The NFT capital began earning when the replacement validator stake started.
 * Distribution-cycle chain verification records this P-chain validator start
 * four minutes after the Bond Safe withdrew the WFLR.
 */
export const BOND_STAKE_START = "2026-09-26T17:56:51Z";

export const BOND_CAPITAL_FLR = {
  "tier-a": 10_000,
  "tier-b": 2_500,
  "lot2-10k": 10_000,
  "lot3-1m": 1_000_000,
} as const;

export type PaidBondTierKey = keyof typeof BOND_CAPITAL_FLR;

export function bondCapitalWei(tierKey: string): bigint | null {
  const capital = BOND_CAPITAL_FLR[tierKey as PaidBondTierKey];
  return capital == null ? null : parseUnits(String(capital), 18);
}

/**
 * Realized bond APY = (lifetime payout / bond capital) x 365 / earning days.
 *
 * Both money arguments use the same denomination and decimals. Returning null
 * keeps missing or not-yet-earned inputs from being presented as a measured 0%.
 */
export function realizedBondApyPct(
  lifetimePayout: bigint,
  bondCapital: bigint,
  asOf: Date = new Date(),
): number | null {
  if (lifetimePayout <= 0n || bondCapital <= 0n) return null;

  const elapsedMs = asOf.getTime() - Date.parse(BOND_STAKE_START);
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return null;

  const elapsedDays = elapsedMs / 86_400_000;
  const ratioScaled = Number((lifetimePayout * 1_000_000_000n) / bondCapital) / 1_000_000_000;
  return ratioScaled * (365 / elapsedDays) * 100;
}
