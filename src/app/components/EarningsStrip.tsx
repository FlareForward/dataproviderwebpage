import { formatUnits } from "viem";
import { Card, CardContent } from "./Card";
import { fmtPct } from "../../lib/rewards";

const DASH = "—";

interface EarningsStripProps {
  rateLabel: "Delegation APY" | "Staking APY";
  ratePct: number | null | undefined;
  positionLabel: string;
  positionAmount: bigint;
  positionUnit: "WFLR" | "FLR";
  claimableReward: bigint;
  basis: string | null | undefined;
  emptyMessage: string;
}

function formatAmount(wei: bigint, digits = 2): string {
  return Number(formatUnits(wei, 18)).toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
}

function formatAnnualAtRate(amountWei: bigint, ratePct: number | null | undefined): string {
  if (ratePct == null || !Number.isFinite(ratePct)) return DASH;
  const amount = Number(formatUnits(amountWei, 18));
  return `${((amount * ratePct) / 100).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })} FLR per year`;
}

function EarningsStat({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="glass-panel px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-[#8FA0B8]">{label}</div>
      <div
        className={`mt-1 text-xl font-bold tabular-nums ${
          accent ? "text-emerald-400" : "text-[#FAFAFA]"
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-[#8FA0B8]">{sub}</div>}
    </div>
  );
}

export function EarningsStrip({
  rateLabel,
  ratePct,
  positionLabel,
  positionAmount,
  positionUnit,
  claimableReward,
  basis,
  emptyMessage,
}: EarningsStripProps) {
  const hasPosition = positionAmount > 0n;
  const hasRate = ratePct != null && Number.isFinite(ratePct);

  return (
    <Card>
      <CardContent className="p-4 sm:p-5 space-y-3">
        {hasPosition ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <EarningsStat
              label={rateLabel}
              value={fmtPct(ratePct)}
              sub="current rate"
              accent={hasRate}
            />
            <EarningsStat
              label={positionLabel}
              value={`${formatAmount(positionAmount)} ${positionUnit}`}
            />
            <EarningsStat
              label="Claimable now"
              value={`${formatAmount(claimableReward)} FLR`}
              accent={claimableReward > 0n}
            />
            <EarningsStat
              label="At the current rate"
              value={formatAnnualAtRate(positionAmount, ratePct)}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,220px)_1fr] gap-3">
            <EarningsStat
              label={rateLabel}
              value={fmtPct(ratePct)}
              sub="current rate"
              accent={hasRate}
            />
            <div className="glass-panel px-4 py-3 flex items-center">
              <p className="text-sm text-[#FAFAFA]">{emptyMessage}</p>
            </div>
          </div>
        )}
        {basis && <p className="text-[11px] leading-relaxed text-[#8FA0B8]">Rate basis: {basis}</p>}
      </CardContent>
    </Card>
  );
}
