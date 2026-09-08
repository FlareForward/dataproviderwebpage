import { useQuery } from "@tanstack/react-query";
import { Network } from "@flarenetwork/flare-tx-sdk";
import { splitClaimableRewards, type ClaimableSplit } from "../lib/fspRewards";

const network = Network.FLARE;

/**
 * Claimable FSP rewards for an address, split into delegation and staking.
 *
 * One query, shared by useDelegation and useStaking, because the RewardManager
 * pays both kinds from one contract and one claim: either page's claim empties
 * both figures, and both refresh from the same fetch. The query key is the one
 * the delegation hook always used, so existing invalidations keep working.
 */
export function useFspClaimable(address: `0x${string}` | undefined) {
  return useQuery({
    queryKey: ["claimableFtsoReward", address],
    enabled: !!address,
    refetchInterval: 30_000,
    queryFn: async (): Promise<ClaimableSplit> =>
      splitClaimableRewards(await network.getStateOfFtsoRewards(address!)),
  });
}
