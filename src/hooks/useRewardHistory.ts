import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { formatUnits, isAddress } from "viem";
import { useContractAddress } from "./useProviders";

/**
 * Per-epoch FTSO reward amounts for one wallet, read straight from the
 * RewardManager's `getStateOfRewards` view (registry-resolved, never
 * hardcoded). On-chain truth with one caveat the UI must disclose: the
 * contract only tracks epochs still claimable — already-claimed or expired
 * epochs no longer appear.
 */
const rewardManagerAbi = [
  {
    type: "function",
    name: "getStateOfRewards",
    stateMutability: "view",
    inputs: [{ name: "_rewardOwner", type: "address" }],
    outputs: [
      {
        name: "_rewardStates",
        type: "tuple[][]",
        components: [
          { name: "rewardEpochId", type: "uint24" },
          { name: "beneficiary", type: "bytes20" },
          { name: "amount", type: "uint120" },
          { name: "claimType", type: "uint8" },
          { name: "initialised", type: "bool" },
        ],
      },
    ],
  },
] as const;

export interface EpochReward {
  epoch: number;
  amountFlr: number;
}

export function useRewardHistory(address: string) {
  const publicClient = usePublicClient();
  const rewardManager = useContractAddress("RewardManager");
  const valid = isAddress(address);

  const query = useQuery({
    queryKey: ["rewardHistory", address, rewardManager.data],
    enabled: valid && !!publicClient && !!rewardManager.data,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<EpochReward[]> => {
      const states = (await publicClient!.readContract({
        address: rewardManager.data!,
        abi: rewardManagerAbi,
        functionName: "getStateOfRewards",
        args: [address as `0x${string}`],
      })) as ReadonlyArray<
        ReadonlyArray<{ rewardEpochId: number; amount: bigint; initialised: boolean }>
      >;

      if (import.meta.env.DEV) {
        console.debug("[rewardHistory] getStateOfRewards ok:", address, states.length, "epoch groups");
      }
      const byEpoch = new Map<number, bigint>();
      for (const epochStates of states) {
        for (const s of epochStates) {
          const epoch = Number(s.rewardEpochId);
          byEpoch.set(epoch, (byEpoch.get(epoch) ?? 0n) + s.amount);
        }
      }
      return [...byEpoch.entries()]
        .map(([epoch, amount]) => ({
          epoch,
          amountFlr: Number(formatUnits(amount, 18)),
        }))
        .sort((a, b) => a.epoch - b.epoch);
    },
  });

  return {
    epochs: query.data ?? [],
    isLoading: valid && query.isLoading,
    error: query.error as Error | null,
  };
}
