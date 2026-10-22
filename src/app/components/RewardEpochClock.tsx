import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { useContractAddress } from "../../hooks/useProviders";

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

/** The current reward epoch and its expected end, read from FlareSystemsManager. */
export function useRewardEpochState() {
  const publicClient = usePublicClient();
  const fsm = useContractAddress("FlareSystemsManager");

  return useQuery({
    queryKey: ["rewardEpochClock", fsm.data],
    enabled: !!publicClient && !!fsm.data,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [epoch, endTs] = await Promise.all([
        publicClient!.readContract({
          address: fsm.data!,
          abi: fsmAbi,
          functionName: "getCurrentRewardEpochId",
        }),
        publicClient!.readContract({
          address: fsm.data!,
          abi: fsmAbi,
          functionName: "currentRewardEpochExpectedEndTs",
        }),
      ]);

      return { epoch: Number(epoch), endTs: Number(endTs) };
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

export function fmtWhen(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** Staking rewards are paid per batch of four reward epochs (14 days). */
export const STAKING_BATCH_EPOCHS = 4;

/** A reward epoch on Flare lasts 302,400 seconds (3.5 days). */
const EPOCH_SECONDS = 302_400;

/** The four-epoch staking batch containing the current reward epoch. */
export function stakingBatch(epoch: number, currentEndTs: number) {
  const endEpoch =
    epoch +
    ((1 - (epoch % STAKING_BATCH_EPOCHS) + STAKING_BATCH_EPOCHS) %
      STAKING_BATCH_EPOCHS);
  const endTs = currentEndTs + (endEpoch - epoch) * EPOCH_SECONDS;

  return {
    startEpoch: endEpoch - STAKING_BATCH_EPOCHS + 1,
    endEpoch,
    startTs: endTs - STAKING_BATCH_EPOCHS * EPOCH_SECONDS,
    endTs,
  };
}

/** A thin pink countdown bar that fills as the batch window elapses. */
export function ProgressBar({ pct, label }: { pct: number; label: string }) {
  const width = Math.max(0, Math.min(100, pct));

  return (
    <span
      className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/5"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
    >
      <span
        className="block h-full rounded-full bg-gradient-to-r from-[#EE1A58] to-[#E85A95] transition-[width] duration-1000 ease-linear"
        style={{ width: `${Math.max(width, 0.5)}%` }}
      />
    </span>
  );
}
