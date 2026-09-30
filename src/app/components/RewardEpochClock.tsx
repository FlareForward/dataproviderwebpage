import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { Timer } from "lucide-react";
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

function useRewardEpochState() {
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

export function RewardEpochClock({ className = "" }: { className?: string }) {
  const { data } = useRewardEpochState();
  const left = useCountdown(data?.endTs);
  if (!data || left == null) return null;
  const endedAwaiting = data.latestClaimable < data.epoch - 1;

  return (
    <div className={`glass-panel p-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Timer size={16} className="text-[#E85A95]" aria-hidden="true" />
          <span className="text-[11px] uppercase tracking-wider text-[#8FA0B8]">
            Reward epoch {data.epoch} ends in
          </span>
          <span className="text-lg font-bold tabular-nums text-[#FAFAFA]">
            {left > 0 ? fmtCountdown(left) : "ending now"}
          </span>
        </div>
        <span className="text-xs text-[#8FA0B8]">{fmtWhen(data.endTs)}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[#8FA0B8]">
        One clock for both delegation (WFLR) and staking (P-chain) rewards: both are paid per
        reward epoch, every 3.5 days, in the same claim. An epoch's rewards become claimable
        once Flare finalizes them, usually within a day of it ending.{" "}
        <span className="text-[#FAFAFA]">
          {endedAwaiting
            ? `Epoch ${data.epoch - 1} has ended and is being finalized. Epoch ${data.latestClaimable} is the latest you can claim.`
            : `Claimable now: rewards through epoch ${data.latestClaimable}.`}
        </span>
      </p>
    </div>
  );
}
