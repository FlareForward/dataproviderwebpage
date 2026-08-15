import { formatUnits } from "viem";
import { Gift, Loader2 } from "lucide-react";
import { Card, CardContent } from "./Card";
import { Button } from "./Button";
import { fmtPct } from "../../lib/rewards";

const DASH = "—";

interface EarningsStripProps {
  rateLabel: "Delegation APY" | "Staking APY";
  ratePct: number | null | undefined;
  positionLabel: string;
  positionAmount: bigint;
  positionUnit: "WFLR" | "FLR";
  claimableReward: bigint;
  /* Optional: the member pages omit it deliberately. Which reward epoch a rate
     came from is our bookkeeping, not something someone needs on the page where
     they act -- that detail belongs on analytics. */
  basis?: string | null;
  emptyMessage: string;
  /**
   * Supply these and "Claimable now" is promoted out of the tile row into a
   * hero with its own claim button. Money already earned is the one number on
   * a member page worth making large, and putting the action on it lets the
   * panels below drop their own claim block instead of repeating the figure.
   */
  onClaim?: () => void;
  claimBusy?: boolean;
  claimLabel?: string;
}

/**
 * Truncating, not rounding — the same rule the member panels use. Rounding
 * here made the tile read 4,944.69 WFLR while the panel below it read
 * 4,944.68: one balance, two numbers, on one page.
 */
function formatAmount(wei: bigint, digits = 2): string {
  const [int, frac = ""] = formatUnits(wei, 18).split(".");
  const trimmed = frac.slice(0, digits).replace(/0+$/, "");
  return Number(trimmed ? `${int}.${trimmed}` : int).toLocaleString(undefined, {
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
  onClaim,
  claimBusy,
  claimLabel = "Claim rewards",
}: EarningsStripProps) {
  const hasPosition = positionAmount > 0n;
  const hasRate = ratePct != null && Number.isFinite(ratePct);
  const hero = onClaim != null;

  return (
    <Card>
      <CardContent className="p-4 sm:p-5 space-y-3">
        {hasPosition ? (
          <>
            {hero && (
              <div className="glass-panel p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-[#8FA0B8]">
                    Claimable now
                  </div>
                  <div
                    className={`mt-1 text-3xl sm:text-4xl font-semibold ${
                      claimableReward > 0n ? "text-emerald-400" : "text-[#FAFAFA]"
                    }`}
                  >
                    {formatAmount(claimableReward)}{" "}
                    <span className="text-lg text-[#8FA0B8]">FLR</span>
                  </div>
                </div>
                <Button
                  variant="action"
                  className="gap-2 w-full sm:w-auto sm:px-8"
                  disabled={claimBusy || claimableReward <= 0n}
                  onClick={onClaim}
                >
                  {claimBusy ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <>
                      <Gift size={16} /> {claimLabel}
                    </>
                  )}
                </Button>
              </div>
            )}
            <div
              className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${
                hero ? "xl:grid-cols-3" : "xl:grid-cols-4"
              }`}
            >
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
              {/* Absent when the hero carries it -- one figure, one place. */}
              {!hero && (
                <EarningsStat
                  label="Claimable now"
                  value={`${formatAmount(claimableReward)} FLR`}
                  accent={claimableReward > 0n}
                />
              )}
              <EarningsStat
                label="At the current rate"
                value={formatAnnualAtRate(positionAmount, ratePct)}
              />
            </div>
          </>
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
