export interface BondPayoutHistoryLot {
  held: number;
  payoutsAvailable: boolean;
  payouts: Array<{
    block: number;
    unix: number;
    perBondAmountWei: bigint;
  }>;
}

export interface BondPayoutHistoryRow {
  date: string;
  unix: number;
  amountWei: bigint;
}

/** Sum each release date across the bond lots held by one wallet. */
export function bondPayoutHistoryRows(
  lots: BondPayoutHistoryLot[],
): BondPayoutHistoryRow[] {
  const byDate = new Map<string, BondPayoutHistoryRow>();

  for (const lot of lots) {
    if (lot.held <= 0) continue;
    for (const payout of lot.payouts) {
      const date = new Date(payout.unix * 1000).toISOString().slice(0, 10);
      const amountWei = payout.perBondAmountWei * BigInt(lot.held);
      const existing = byDate.get(date);
      if (existing) {
        existing.amountWei += amountWei;
        existing.unix = Math.max(existing.unix, payout.unix);
      } else {
        byDate.set(date, { date, unix: payout.unix, amountWei });
      }
    }
  }

  return [...byDate.values()].sort((a, b) => b.unix - a.unix);
}
