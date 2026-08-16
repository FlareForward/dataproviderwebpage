import { useMemo, useState } from "react";
import { ChevronDown, History, Loader2 } from "lucide-react";
import { useEarned, sumClaims, type EarnedClaim } from "../../hooks/useEarned";
import { fmtDate, fmtFlrWei } from "../../lib/rewards";

/**
 * Everything this wallet has been PAID, behind one button.
 *
 * My Rewards is a glance page and the operator's standing note on it is "keep
 * that screen very clean" — so accumulated earnings do NOT get a stat tile
 * competing with Claimable now. They get a single line and a History button;
 * the range picker and the per-payment list only exist once someone opens it.
 *
 * Tracking runs forward from the block this shipped. The header says so in
 * plain words rather than implying a lifetime figure we never scanned for.
 */

interface RangeOption {
  label: string;
  days: number | null;
}

/** Windows are days back from now; `null` means everything we have tracked. */
const RANGES: RangeOption[] = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
  { label: "All", days: null },
];

export function RewardHistory({ address }: { address: string | undefined }) {
  const { data, isLoading, error } = useEarned(address);
  const [open, setOpen] = useState(false);
  const [rangeDays, setRangeDays] = useState<number | null>(null);

  const claims = data?.claims ?? [];

  const sinceUnix = useMemo(() => {
    if (rangeDays == null) return 0;
    return Math.floor(Date.now() / 1000) - rangeDays * 86_400;
  }, [rangeDays]);

  const rangeTotal = useMemo(() => sumClaims(claims, sinceUnix), [claims, sinceUnix]);
  const rangeClaims = useMemo(
    () => claims.filter((c) => c.unix >= sinceUnix),
    [claims, sinceUnix]
  );
  const allTimeTotal = useMemo(() => sumClaims(claims), [claims]);

  // A partial scan can only understate the total, and a member page reporting
  // less money than was paid is a trust bug — say nothing rather than guess.
  const trustworthy = !!data && !data.partial;

  return (
    <div className="border-t border-white/8 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm text-[#8FA0B8]">
          {isLoading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Reading your payment history…
            </span>
          ) : error || !trustworthy ? (
            "Payment history is unavailable right now — claimable figures above are unaffected."
          ) : claims.length === 0 ? (
            <>Nothing paid out yet. Tracking since {fmtDate(data.trackingStartUnix)}.</>
          ) : (
            <>
              <span className="font-semibold text-[#FAFAFA] tabular-nums">
                {fmtFlrWei(allTimeTotal)} FLR
              </span>{" "}
              paid out since {fmtDate(data.trackingStartUnix)}
            </>
          )}
        </p>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={!trustworthy || claims.length === 0}
          aria-expanded={open}
          className="inline-flex items-center gap-2 text-sm font-medium text-[#E85A95] hover:underline disabled:text-[#8FA0B8] disabled:no-underline disabled:cursor-default"
        >
          <History size={15} /> History
          <ChevronDown
            size={14}
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open && trustworthy && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="History range">
              {RANGES.map((r) => {
                const active = r.days === rangeDays;
                return (
                  <button
                    key={r.label}
                    type="button"
                    onClick={() => setRangeDays(r.days)}
                    aria-pressed={active}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      active
                        ? "bg-[#EE1A58] text-white"
                        : "glass-panel text-[#8FA0B8] hover:text-[#FAFAFA]"
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
            <div className="text-sm text-[#8FA0B8]">
              <span className="font-semibold tabular-nums text-emerald-400">
                {fmtFlrWei(rangeTotal, 2)} FLR
              </span>{" "}
              over {rangeClaims.length}{" "}
              {rangeClaims.length === 1 ? "payment" : "payments"}
            </div>
          </div>

          {rangeClaims.length === 0 ? (
            <p className="glass-panel px-4 py-3 text-sm text-[#8FA0B8]">
              No payments in this window.
            </p>
          ) : (
            <ul className="glass-panel divide-y divide-white/8">
              {rangeClaims.map((claim) => (
                <ClaimRow key={`${claim.block}-${claim.epoch}-${claim.kind}`} claim={claim} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ClaimRow({ claim }: { claim: EarnedClaim }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium text-[#FAFAFA]">
          {claim.kind === "staking" ? "Staking" : "Delegation"}
        </div>
        <div className="text-[11px] text-[#8FA0B8]">
          {fmtDate(claim.unix)}
          {claim.epoch != null && ` · epoch ${claim.epoch}`}
        </div>
      </div>
      <div className="shrink-0 text-sm font-semibold tabular-nums text-[#FAFAFA]">
        {fmtFlrWei(claim.amountWei, 2)}{" "}
        <span className="text-xs font-normal text-[#8FA0B8]">FLR</span>
      </div>
    </li>
  );
}
