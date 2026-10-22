import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { useReadContracts } from "wagmi";
import { formatEther } from "viem";
import { CURRENT_LOT, isTermTier, termBondAbi } from "../../lib/bondLot";
import { TERM_CHAIN } from "../../lib/flare";
import {
  ProgressBar,
  fmtCountdown,
  fmtWhen,
  stakingBatch,
  useCountdown,
  useRewardEpochState,
} from "./RewardEpochClock";

/** One compact layout for every Starship: status, progress, facts, and link. */
export function StarshipStrip({
  name,
  label,
  badge,
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

/** Flare pays each completed staking batch about a week after it ends. */
const STAKING_PAYOUT_LAG_SECONDS = 7 * 24 * 3600;

const fmtDay = (ts: number) =>
  new Date(ts * 1000).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

/** The 14-day staking payout batch shown beside the FTSO V1 heading. */
export function StakingBatchTimer() {
  const { data } = useRewardEpochState();
  const batch = data ? stakingBatch(data.epoch, data.endTs) : null;
  const batchLeft = useCountdown(batch?.endTs);

  if (!batch || batchLeft == null) return null;

  const batchSecs = batch.endTs - batch.startTs;
  const heading = "Staking payout batch ends in";

  return (
    <span className="block">
      <span className="flex items-baseline justify-between gap-3 text-[11px] text-[#8FA0B8]">
        <span className="uppercase tracking-wider">{heading}</span>
        <span className="text-sm font-semibold tabular-nums text-[#FAFAFA]">
          {batchLeft > 0 ? fmtCountdown(batchLeft) : "now"}
        </span>
      </span>
      <ProgressBar
        pct={((batchSecs - batchLeft) / batchSecs) * 100}
        label={`${heading} progress`}
      />
      <span className="mt-1 block text-[10px] leading-snug text-[#8FA0B8]">
        Epochs {batch.startEpoch} to {batch.endEpoch}, end {fmtWhen(batch.endTs)}. Flare pays
        each batch about a week after it ends, so expect these rewards around{" "}
        {fmtDay(batch.endTs + STAKING_PAYOUT_LAG_SECONDS)}.
      </span>
    </span>
  );
}

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
  if (STARSHIP2_TIERS.length === 0 || !data) return null;
  return {
    anyOpen,
    raised: Number(formatEther(raisedWei)),
    cap: Number(formatEther(capWei)),
    maturity,
  };
}
