import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { useContractAddress } from "../../hooks/useProviders";

/**
 * The reward clock, read from Flare's own contracts.
 *
 * Verified 2026-09-30 before building: delegation (WFLR) and staking (P-chain) rewards
 * are NOT on two clocks. Both are earned per reward epoch (302,400 s, 3.5 days) and the
 * RewardManager pays both in one claim. The legacy ValidatorRewardManager only holds a
 * pre-FSP tail and has no schedule. So there is one countdown, labelled for both.
 *
 * The end of an epoch is exact (FlareSystemsManager.currentRewardEpochExpectedEndTs).
 * When its rewards become claimable is NOT fixed: epoch 435 took 18 h after it ended,
 * epoch 436 took 6 h. So the clock never predicts that moment; it reads the last
 * claimable epoch from the RewardManager and says so.
 */
const fsmAbi = [
  {
    type: "function",
    name: "getCurrentRewardEpochId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint24" }],
  },
  {
    type: "function",
    name: "currentRewardEpochExpectedEndTs",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint64" }],
  },
] as const;

const rewardManagerAbi = [
  {
    type: "function",
    name: "getRewardEpochIdsWithClaimableRewards",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "_startEpochId", type: "uint24" },
      { name: "_endEpochId", type: "uint24" },
    ],
  },
] as const;

export function useRewardEpochState() {
  const publicClient = usePublicClient();
  const fsm = useContractAddress("FlareSystemsManager");
  const rm = useContractAddress("RewardManager");
  return useQuery({
    queryKey: ["rewardEpochClock", fsm.data, rm.data],
    enabled: !!publicClient && !!fsm.data && !!rm.data,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [epoch, endTs, claimable] = await Promise.all([
        publicClient!.readContract({ address: fsm.data!, abi: fsmAbi, functionName: "getCurrentRewardEpochId" }),
        publicClient!.readContract({ address: fsm.data!, abi: fsmAbi, functionName: "currentRewardEpochExpectedEndTs" }),
        publicClient!.readContract({
          address: rm.data!,
          abi: rewardManagerAbi,
          functionName: "getRewardEpochIdsWithClaimableRewards",
        }),
      ]);
      return { epoch: Number(epoch), endTs: Number(endTs), latestClaimable: Number(claimable[1]) };
    },
  });
}

/** Seconds until `target`, ticking once a second. */
export function useCountdown(target: number | null | undefined): number | null {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return target == null ? null : Math.max(0, target - now);
}

export function fmtCountdown(secs: number): string {
  const d = Math.floor(secs / 86_400);
  const h = Math.floor((secs % 86_400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function fmtWhen(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** The current reward epoch, its end, and how far through it we are. Ticks every second. */
export function useRewardEpoch() {
  const { data } = useRewardEpochState();
  const left = useCountdown(data?.endTs);
  if (!data || left == null) return null;
  return {
    epoch: data.epoch,
    endTs: data.endTs,
    left,
    pct: ((EPOCH_SECONDS - left) / EPOCH_SECONDS) * 100,
  };
}

export { fmtWhen };

/** A reward epoch on Flare is 302,400 s (FlareSystemsManager.rewardEpochDurationSeconds, read 2026-09-30). */
const EPOCH_SECONDS = 302_400;

/** A thin countdown bar. It fills as the time runs down. */
export function ProgressBar({ pct, tone, label }: { pct: number; tone: "pink" | "green"; label: string }) {
  const width = Math.max(0, Math.min(100, pct));
  return (
    <div
      className="mt-1.5 h-1 rounded-full bg-white/5 overflow-hidden"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
          tone === "pink" ? "bg-gradient-to-r from-[#EE1A58] to-[#E85A95]" : "bg-gradient-to-r from-emerald-500 to-emerald-300"
        }`}
        style={{ width: `${Math.max(width, 0.5)}%` }}
      />
    </div>
  );
}
