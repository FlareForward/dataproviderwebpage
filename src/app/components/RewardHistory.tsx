import { useMemo, useState } from "react";
import { ChevronDown, History, Loader2 } from "lucide-react";
import {
  useEarned,
  sumClaims,
  weightedRate,
  type ClaimableEarnedInput,
  type EarnedClaim,
  type EarnedKind,
  type EarnedBondLot,
} from "../../hooks/useEarned";
import { bondPayoutHistoryRows } from "../../lib/bondHistory";
import { fmtDate, fmtFlrWei, fmtUtcDate } from "../../lib/rewards";

interface RangeOption {
  label: string;
  days: number | null;
}

type RangeSelection =
  { kind: "preset"; days: number | null } | { kind: "custom" };

/** Windows are days back from now; `null` means everything we have tracked. */
const RANGES: RangeOption[] = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
  { label: "All", days: null },
];

const DAY_SECONDS = 86_400;

export function SourceRewardHistory({
  kind,
  totalWei,
  claims,
  loading = false,
  unavailable = false,
}: {
  kind: Exclude<EarnedKind, "bonds">;
  totalWei: bigint | undefined;
  claims: EarnedClaim[];
  loading?: boolean;
  unavailable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const sourceClaims = useMemo(
    () => claims.filter((claim) => claim.kind === kind),
    [claims, kind],
  );

  return (
    <div className="glass-panel px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-[#8FA0B8]">Earned</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[#FAFAFA]">
            {loading || unavailable || totalWei == null ? "-" : fmtFlrWei(totalWei, 2)}{" "}
            {!loading && !unavailable && totalWei != null && (
              <span className="text-sm font-semibold text-[#8FA0B8]">FLR</span>
            )}
          </p>
          <p className="mt-1 text-xs text-[#8FA0B8]">Claimed plus currently claimable</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          disabled={loading || unavailable || sourceClaims.length === 0}
          aria-expanded={open}
          className="inline-flex items-center gap-2 text-sm font-medium text-[#E85A95] hover:underline disabled:cursor-default disabled:text-[#8FA0B8] disabled:no-underline"
        >
          <History size={15} /> History
          <ChevronDown
            size={14}
            className={`transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open && (
        <ul className="mt-3 divide-y divide-white/8 border-t border-white/8">
          {sourceClaims.map((claim) => (
            <ClaimRow
              key={`${claim.block}-${claim.epoch}-${claim.kind}`}
              claim={claim}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export function BondRewardHistory({
  totalWei,
  lots,
  loading = false,
  unavailable = false,
  showTotal = true,
}: {
  totalWei?: bigint | null;
  lots: EarnedBondLot[];
  loading?: boolean;
  unavailable?: boolean;
  showTotal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => bondPayoutHistoryRows(lots), [lots]);
  const payoutsUnavailable = lots.some((lot) => !lot.payoutsAvailable);
  const disabled = loading || unavailable || rows.length === 0;

  return (
    <div className={showTotal ? "glass-panel px-4 py-3" : "border-t border-white/8 pt-3"}>
      <div
        className={`flex flex-wrap items-center gap-3 ${
          showTotal ? "justify-between" : "justify-end"
        }`}
      >
        {showTotal && (
          <div>
            <p className="text-[11px] uppercase tracking-wider text-[#8FA0B8]">Earned</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-[#FAFAFA]">
              {loading || unavailable || totalWei == null ? "-" : fmtFlrWei(totalWei, 2)}{" "}
              {!loading && !unavailable && totalWei != null && (
                <span className="text-sm font-semibold text-[#8FA0B8]">FLR</span>
              )}
            </p>
            <p className="mt-1 text-xs text-[#8FA0B8]">
              Claimed plus currently claimable
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          disabled={disabled}
          aria-expanded={open}
          className="inline-flex items-center gap-2 text-sm font-medium text-[#E85A95] hover:underline disabled:cursor-default disabled:text-[#8FA0B8] disabled:no-underline"
        >
          <History size={15} /> History
          <ChevronDown
            size={14}
            className={`transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open && (
        <div className="mt-3 border-t border-white/8">
          {payoutsUnavailable && (
            <p className="py-2 text-xs text-[#8FA0B8]">
              Some payout releases are unavailable right now.
            </p>
          )}
          <ul className="divide-y divide-white/8">
            {rows.map((row) => (
              <li
                key={row.date}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-3"
              >
                <div>
                  <p className="text-sm font-medium text-[#FAFAFA]">Bond payout</p>
                  <p className="text-[11px] text-[#8FA0B8]">{fmtDate(row.unix)}</p>
                </div>
                <p className="text-sm font-semibold tabular-nums text-[#FAFAFA]">
                  {fmtFlrWei(row.amountWei, 2)}{" "}
                  <span className="text-xs font-normal text-[#8FA0B8]">FLR</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function RewardHistory({
  address,
  claimable,
  claimableLoading,
  claimableError,
}: {
  address: string | undefined;
  claimable?: ClaimableEarnedInput;
  claimableLoading?: boolean;
  claimableError?: boolean;
}) {
  const { data, isLoading, error } = useEarned(address, claimable);
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<RangeSelection>({
    kind: "preset",
    days: null,
  });
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const claims = data?.claims ?? [];
  const nowUnix = Math.floor(Date.now() / 1000);
  const trackingStartUnix = data?.trackingStartUnix ?? 0;
  const trackingStartDate = trackingStartUnix
    ? dateInputValue(trackingStartUnix)
    : undefined;
  const todayDate = dateInputValue(nowUnix);

  const { sinceUnix, untilUnix } = useMemo(() => {
    if (!data) return { sinceUnix: 0, untilUnix: nowUnix };
    if (range.kind === "custom") {
      const from = parseDateInput(customFrom, false) ?? data.trackingStartUnix;
      const to = parseDateInput(customTo, true) ?? nowUnix;
      return {
        sinceUnix: Math.max(data.trackingStartUnix, from),
        untilUnix: Math.min(nowUnix, to),
      };
    }
    if (range.days == null) {
      return { sinceUnix: data.trackingStartUnix, untilUnix: nowUnix };
    }
    return {
      sinceUnix: Math.max(
        data.trackingStartUnix,
        nowUnix - range.days * DAY_SECONDS,
      ),
      untilUnix: nowUnix,
    };
  }, [customFrom, customTo, data, nowUnix, range]);

  const rangeTotal = useMemo(
    () => sumClaims(claims, sinceUnix, undefined, untilUnix),
    [claims, sinceUnix, untilUnix],
  );
  const rangeClaims = useMemo(
    () => claims.filter((c) => c.unix >= sinceUnix && c.unix <= untilUnix),
    [claims, sinceUnix, untilUnix],
  );
  const rangeRate = useMemo(() => weightedRate(rangeClaims), [rangeClaims]);

  // A partial scan can only understate the total, and a member page reporting
  // less money than was paid is a trust bug — say nothing rather than guess.
  const trustworthy =
    !!data && !data.partial && data.claimableReady && !claimableError;

  return (
    <div className="border-t border-white/8 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-x-5 gap-y-3">
        {isLoading || claimableLoading ? (
          <p className="inline-flex items-center gap-2 text-sm text-[#8FA0B8]">
            <Loader2 size={14} className="animate-spin" /> Reading your earned
            total…
          </p>
        ) : error || !trustworthy ? (
          <p className="text-sm text-[#8FA0B8]">
            Earned history is unavailable right now. Claimable figures above
            are unaffected.
          </p>
        ) : (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#8FA0B8]">
              What we&apos;ve earned you
            </div>
            <div className="mt-1 text-3xl font-bold tabular-nums text-[#FAFAFA]">
              {fmtFlrWei(data.earned.totalWei, 2)}{" "}
              <span className="text-base font-semibold text-[#8FA0B8]">
                FLR
              </span>
            </div>
            <div className="mt-1 text-xs text-[#8FA0B8]">
              Since {fmtUtcDate(data.trackingStartUnix)} · claimed plus currently
              claimable
            </div>
          </div>
        )}

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
            className={`transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open && trustworthy && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-2">
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label="History range"
              >
                {RANGES.map((r) => {
                  const active =
                    range.kind === "preset" && r.days === range.days;
                  return (
                    <button
                      key={r.label}
                      type="button"
                      onClick={() => setRange({ kind: "preset", days: r.days })}
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
              <div className="flex flex-wrap items-center gap-2">
                <DateField
                  label="From"
                  value={customFrom}
                  min={trackingStartDate}
                  max={customTo || todayDate}
                  onChange={(value) => {
                    setRange({ kind: "custom" });
                    setCustomFrom(value);
                  }}
                />
                <DateField
                  label="To"
                  value={customTo}
                  min={customFrom || trackingStartDate}
                  max={todayDate}
                  onChange={(value) => {
                    setRange({ kind: "custom" });
                    setCustomTo(value);
                  }}
                />
              </div>
            </div>
            <div className="text-sm text-[#8FA0B8]">
              <div>
                <span className="font-semibold tabular-nums text-emerald-400">
                  {fmtFlrWei(rangeTotal, 2)} FLR
                </span>{" "}
                claimed from {fmtDate(sinceUnix)} to {fmtDate(untilUnix)} over{" "}
                {rangeClaims.length}{" "}
                {rangeClaims.length === 1 ? "payment" : "payments"}
                {rangeRate != null && (
                  <span> · {rangeRate.toFixed(2)}% annualized</span>
                )}
              </div>
              <div className="mt-1 text-xs text-[#8FA0B8]">
                What you actually earned on what you had in each epoch,
                as a yearly rate. Past payments, not a promise.
              </div>
            </div>
          </div>

          {rangeClaims.length === 0 ? (
            <p className="glass-panel px-4 py-3 text-sm text-[#8FA0B8]">
              No payments in this window.
            </p>
          ) : (
            <ul className="glass-panel divide-y divide-white/8">
              {rangeClaims.map((claim) => (
                <ClaimRow
                  key={`${claim.block}-${claim.epoch}-${claim.kind}`}
                  claim={claim}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-[#8FA0B8]">
      <span>{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="glass-panel px-2 py-1 text-xs text-[#FAFAFA] outline-none focus:border-[#EE1A58]/60"
      />
    </label>
  );
}

function ClaimRow({ claim }: { claim: EarnedClaim }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium text-[#FAFAFA]">
          {claim.kind === "staking"
            ? "Staking"
            : claim.kind === "bonds"
              ? "Bonds"
              : "Delegation"}
        </div>
        <div className="text-[11px] text-[#8FA0B8]">
          {fmtDate(claim.unix)}
          {claim.epoch != null && ` · epoch ${claim.epoch}`}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-semibold tabular-nums text-[#FAFAFA]">
          {fmtFlrWei(claim.amountWei, 2)}{" "}
          <span className="text-xs font-normal text-[#8FA0B8]">FLR</span>
        </div>
        {claim.rateAnnualizedPct != null && (
          <div className="mt-0.5 text-[11px] text-[#8FA0B8]">
            {claim.rateAnnualizedPct.toFixed(2)}% annualized
          </div>
        )}
      </div>
    </li>
  );
}

function dateInputValue(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

function parseDateInput(value: string, endOfDay: boolean): number | null {
  if (!value) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}Z`);
  const unix = Math.floor(date.getTime() / 1000);
  return Number.isFinite(unix) ? unix : null;
}
