import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import {
  CURRENT_LOT,
  distributorAbi,
  isShareTier,
  WFLR_ADDRESS,
  type BondTier,
} from "../lib/bondLot";
import {
  bondCapitalWei,
  realizedBondApyPct,
} from "../lib/bondApy";
import { chain } from "../lib/flare";

type PaidTier = BondTier & {
  address: `0x${string}`;
  distributor: `0x${string}`;
};

const PAID_TIERS = CURRENT_LOT.tiers.filter(
  (tier): tier is PaidTier =>
    isShareTier(tier) && !!tier.address && !!tier.distributor,
);

const READS_PER_TIER = 3;

export interface BondApyTier {
  tier: PaidTier;
  supply: bigint;
  payoutPerBondWei: bigint;
  lifetimePayoutWei: bigint;
  capitalWei: bigint;
  apyPct: number | null;
}

/** One live, on-chain realized APY source for every bond surface. */
export function useBondApy() {
  const query = useReadContracts({
    contracts: PAID_TIERS.flatMap((tier) => [
      {
        address: tier.distributor,
        abi: distributorAbi,
        functionName: "cumulativeRewardPerToken" as const,
        args: [WFLR_ADDRESS] as const,
        chainId: chain.id,
      },
      {
        address: tier.distributor,
        abi: distributorAbi,
        functionName: "PRECISION" as const,
        chainId: chain.id,
      },
      {
        address: tier.distributor,
        abi: distributorAbi,
        functionName: "totalTokenSupply" as const,
        chainId: chain.id,
      },
    ]),
    query: {
      enabled: PAID_TIERS.length > 0,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    },
  });

  const tiers = useMemo<BondApyTier[]>(() => {
    if (!query.data) return [];
    return PAID_TIERS.flatMap((tier, index) => {
      const offset = index * READS_PER_TIER;
      const cumulative = query.data[offset]?.result as bigint | undefined;
      const precision = query.data[offset + 1]?.result as bigint | undefined;
      const supply = query.data[offset + 2]?.result as bigint | undefined;
      const perBondCapital = bondCapitalWei(tier.key);
      if (
        cumulative == null ||
        precision == null ||
        precision <= 0n ||
        supply == null ||
        perBondCapital == null
      ) {
        return [];
      }
      const payoutPerBondWei = cumulative / precision;
      const lifetimePayoutWei = payoutPerBondWei * supply;
      const capitalWei = perBondCapital * supply;
      return [
        {
          tier,
          supply,
          payoutPerBondWei,
          lifetimePayoutWei,
          capitalWei,
          apyPct: realizedBondApyPct(payoutPerBondWei, perBondCapital),
        },
      ];
    });
  }, [query.data]);

  const lifetimePayoutWei = tiers.reduce(
    (total, tier) => total + tier.lifetimePayoutWei,
    0n,
  );
  const capitalWei = tiers.reduce(
    (total, tier) => total + tier.capitalWei,
    0n,
  );

  return {
    ...query,
    tiers,
    lifetimePayoutWei,
    capitalWei,
    apyPct:
      tiers.length === PAID_TIERS.length
        ? realizedBondApyPct(lifetimePayoutWei, capitalWei)
        : null,
  };
}
