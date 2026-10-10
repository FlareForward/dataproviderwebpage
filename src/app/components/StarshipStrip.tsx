import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { useReadContracts } from "wagmi";
import { formatEther } from "viem";
import { CURRENT_LOT, isTermTier, termBondAbi } from "../../lib/bondLot";
import { TERM_CHAIN } from "../../lib/flare";
import { ProgressBar, fmtCountdown, fmtWhen, stakingBatch, useCountdown, useRewardEpoch, useRewardEpochState } from "./RewardEpochClock";

/**
 * One layout for every Starship, so a visitor reads each one the same way:
 * name and status top left, the timer top right, the big bar and its numbers
 * below, and a link button to that Starship's NFTs. Operator, 2026-10-01: the
 * timer is the thing that moves, so it sits at the top, compact, about a
 * quarter of the width.
 */
export function StarshipStrip({
  name,
  label,
  badge,
  timer,
  barPct,
  barTone,
  left,
  right,
  link,
  className = "",
}: {
  name: string;
  label: string;
  badge?: { text: string; tone: "neutral" | "green" };
  timer: ReactNode;
  barPct: number;
  barTone: "pink" | "green";
  left: ReactNode;
  right?: ReactNode;
  link: { to: string; text: string };
  className?: string;
}) {
  return (
    <div className={`glass-panel p-4 space-y-3 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <span className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] uppercase tracking-wider text-[#8FA0B8]">
          <span className="font-semibold text-[#FAFAFA]">{name}</span>
          <span aria-hidden="true">·</span>
          {label}
          {badge && (
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                badge.tone === "green"
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                  : "border-white/15 bg-white/5 text-[#FAFAFA]"
              }`}
            >
              {badge.text}
            </span>
          )}
        </span>
        <div className="w-full sm:w-[min(320px,28%)] sm:min-w-[240px]">{timer}</div>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden" aria-hidden="true">
        <div
          className={`h-full rounded-full ${
            barTone === "pink"
              ? "bg-gradient-to-r from-[#EE1A58] to-[#E85A95]"
              : "bg-gradient-to-r from-emerald-500 to-emerald-300"
          }`}
          style={{ width: `${barPct > 0 ? Math.max(1, Math.min(100, barPct)) : 0}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
        <span className="text-[#FAFAFA] font-medium tabular-nums">{left}</span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {right && <span className="text-[#8FA0B8] tabular-nums">{right}</span>}
          <Link
            to={link.to}
            className="inline-flex items-center gap-1 rounded-lg border border-white/12 bg-white/5 px-2.5 py-1 text-xs font-medium text-[#FAFAFA] transition hover:bg-white/10"
          >
            {link.text} <ArrowRight size={13} />
          </Link>
        </span>
      </div>
    </div>
  );
}

/** The compact timer that sits top right. Same shape for every Starship. */
export function StarshipTimer({
  heading,
  secs,
  pct,
  tone,
  note,
}: {
  heading: string;
  secs: number;
  pct: number;
  tone: "pink" | "green";
  note: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[11px] text-[#8FA0B8]">
        <span className="uppercase tracking-wider">{heading}</span>
        <span className="text-sm font-semibold tabular-nums text-[#FAFAFA]">
          {secs > 0 ? fmtCountdown(secs) : "now"}
        </span>
      </div>
      <ProgressBar pct={pct} tone={tone} label={`${heading} progress`} />
      <p className="mt-1 text-[10px] leading-snug text-[#8FA0B8]">{note}</p>
    </div>
  );
}

/** FTSO V1: the 14-day staking batch on top, the current reward epoch under it. */
export function Starship1Timer() {
  const e = useRewardEpoch();
  const { data } = useRewardEpochState();
  const batch = data ? stakingBatch(data.epoch, data.endTs) : null;
  const batchLeft = useCountdown(batch?.endTs);
  if (!e) return null;
  const batchSecs = batch ? batch.endTs - batch.startTs : 0;
  return (
    <div className="space-y-3">
      {batch && batchLeft != null && (
        <StarshipTimer
          heading="Staking payout batch ends in"
          secs={batchLeft}
          pct={((batchSecs - batchLeft) / batchSecs) * 100}
          tone="green"
          note={`Epochs ${batch.startEpoch} to ${batch.endEpoch}, ends ${fmtWhen(batch.endTs)}. Staking rewards are paid every 14 days, after Flare finalizes the batch.`}
        />
      )}
      <StarshipTimer
        heading={`Epoch ${e.epoch} ends in`}
        secs={e.left}
        pct={e.pct}
        tone="pink"
        note={`${fmtWhen(e.endTs)}. Claimable once Flare finalizes it.`}
      />
    </div>
  );
}

/**
 * When the FTSO V2 sales opened: Bond Treasury Safe nonce 13, tx 0x41f64b13…,
 * block 70998062, 2026-09-30 16:41:56Z. The term bar runs from here to maturity.
 */
const STARSHIP2_OPENED_AT = 1790786516;

const STARSHIP2_TIERS = CURRENT_LOT.tiers.filter(
  (t): t is typeof t & { kind: "term"; address: `0x${string}` } => isTermTier(t) && !!t.address,
);

/** Live FTSO V2 numbers, read from the three bond contracts. */
export function useStarship2() {
  const { data } = useReadContracts({
    contracts: STARSHIP2_TIERS.flatMap((t) => [
      { address: t.address, abi: termBondAbi, functionName: "isMintOpen" as const, chainId: TERM_CHAIN.id },
      { address: t.address, abi: termBondAbi, functionName: "totalSupply" as const, chainId: TERM_CHAIN.id },
      { address: t.address, abi: termBondAbi, functionName: "maxSupply" as const, chainId: TERM_CHAIN.id },
      { address: t.address, abi: termBondAbi, functionName: "mintPrice" as const, chainId: TERM_CHAIN.id },
      { address: t.address, abi: termBondAbi, functionName: "bondExpiry" as const, chainId: TERM_CHAIN.id },
    ]),
    query: { enabled: STARSHIP2_TIERS.length > 0, refetchInterval: 60_000 },
  });
  let maturity: number | null = null;
  let anyOpen = false;
  let raisedWei = 0n;
  let capWei = 0n;
  for (let i = 0; data && i < STARSHIP2_TIERS.length; i++) {
    const open = data[i * 5]?.result as boolean | undefined;
    const sold = data[i * 5 + 1]?.result as bigint | undefined;
    const max = data[i * 5 + 2]?.result as bigint | undefined;
    const price = data[i * 5 + 3]?.result as bigint | undefined;
    const exp = data[i * 5 + 4]?.result as bigint | undefined;
    if (open) anyOpen = true;
    if (sold != null && price != null) raisedWei += sold * price;
    if (max != null && price != null) capWei += max * price;
    if (exp && exp > 0n) maturity = Number(exp);
  }
  const toMaturity = useCountdown(maturity);
  if (STARSHIP2_TIERS.length === 0 || !data) return null;
  return {
    anyOpen,
    raised: Number(formatEther(raisedWei)),
    cap: Number(formatEther(capWei)),
    maturity,
    toMaturity,
  };
}

/** FTSO V2: counts down to maturity, when the bonds redeem. */
export function Starship2Timer({ maturity, toMaturity }: { maturity: number | null; toMaturity: number | null }) {
  if (maturity == null || toMaturity == null) return null;
  const pct = ((maturity - toMaturity - STARSHIP2_OPENED_AT) / (maturity - STARSHIP2_OPENED_AT)) * 100;
  const date = new Date(maturity * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return (
    <StarshipTimer
      heading="Redeemable in"
      secs={toMaturity}
      pct={pct}
      tone="green"
      note={`${date}. Redeem once the vault is finalized.`}
    />
  );
}
