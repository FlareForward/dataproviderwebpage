import type { ReactNode } from "react";
import { formatUnits } from "viem";
import { Gift, Loader2 } from "lucide-react";
import { Card, CardContent } from "./Card";
import { Button } from "./Button";
import { fmtPct, fmtFlrWei } from "../../lib/rewards";

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
  /**
   * Optional row under the hero's claim line — for state that is one fact and
   * one action, like delegation's "100% to FlareForward · Undelegate". Lets a
   * page fold a whole status card into the hero instead of spending a card on
   * a single line.
   */
  heroExtra?: ReactNode;
}

function formatAnnualAtRate(amountWei: bigint, ratePct: number | null | undefined): string {
  if (ratePct == null || !Number.isFinite(ratePct)) return DASH;
  const amount = Number(formatUnits(amountWei, 18));
  return `${((amount * ratePct) / 100).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })} FLR per year`;
}

/**
 * A tile in the strip. Every tile reserves its sub-line whether or not it has
 * one: previously only the rate tile passed `sub`, so it grew a third row its
 * neighbours lacked and the whole row sat with mismatched heights and baselines
 * — the "uneven" the operator was looking at. `h-full` matches the tiles to the
 * tallest in the row; the placeholder keeps the values on one baseline.
 */
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
    <div className="glass-panel h-full px-4 py-3 flex flex-col">
      {/* Two lines of label are reserved whether or not this one wraps.
          "Staked with FlareForward" wraps where "Staking APY" does not, which
          pushed the Staking row's values a line lower than the Delegation
          row's — the same figures at two different heights down one page. */}
      <div className="min-h-[2.4em] text-[11px] uppercase leading-[1.2] tracking-wider text-[#8FA0B8]">
        {label}
      </div>
      <div
        className={`mt-1 text-xl font-bold tabular-nums ${
          accent ? "text-emerald-400" : "text-[#FAFAFA]"
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-[#8FA0B8]">{sub ?? " "}</div>
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
  heroExtra,
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
              <div className="glass-panel p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-[#8FA0B8]">
                      Claimable now
                    </div>
                    <div
                      className={`mt-1 text-3xl sm:text-4xl font-semibold ${
                        claimableReward > 0n ? "text-emerald-400" : "text-[#FAFAFA]"
                      }`}
                    >
                      {fmtFlrWei(claimableReward)}{" "}
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
                {heroExtra && (
                  <div className="mt-3 border-t border-white/8 pt-3">{heroExtra}</div>
                )}
              </div>
            )}
            <div
              className={`grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch ${
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
                value={`${fmtFlrWei(positionAmount)} ${positionUnit}`}
                sub="your position"
              />
              {/* Absent when the hero carries it -- one figure, one place. */}
              {!hero && (
                <EarningsStat
                  label="Claimable now"
                  value={`${fmtFlrWei(claimableReward)} FLR`}
                  sub={claimableReward > 0n ? "ready to claim" : "nothing waiting"}
                  accent={claimableReward > 0n}
                />
              )}
              <EarningsStat
                label="At the current rate"
                value={formatAnnualAtRate(positionAmount, ratePct)}
                sub="projection, not a guarantee"
              />
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,220px)_1fr] gap-3 items-stretch">
            <EarningsStat
              label={rateLabel}
              value={fmtPct(ratePct)}
              sub="current rate"
              accent={hasRate}
            />
            <div className="glass-panel h-full px-4 py-3 flex items-center">
              <p className="text-sm text-[#FAFAFA]">{emptyMessage}</p>
            </div>
          </div>
        )}
        {basis && <p className="text-[11px] leading-relaxed text-[#8FA0B8]">Rate basis: {basis}</p>}
      </CardContent>
    </Card>
  );
}
