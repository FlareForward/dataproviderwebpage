import { useQuery } from "@tanstack/react-query";

/**
 * Flare Forward's validator staking metrics, sourced from the Flare Systems
 * Explorer's canonical indexer via the same-origin Cloudflare Worker proxy
 * (worker/index.ts, `/api/validator`). The worker resolves the entity's node id
 * + latest-epoch mirror rewards and finds the matching validator row in the
 * Explorer's P-chain validators list, normalizing raw stake amounts to whole
 * FLR and the fee to a percentage. Override with VITE_VALIDATOR_URL for local
 * dev (point at a `wrangler dev` origin or a deployed worker).
 *
 * A `null` metric means "no data"; `has_validator: false` means the entity has
 * no matching registered validator this epoch.
 */
const VALIDATOR_URL = import.meta.env.VITE_VALIDATOR_URL ?? "/api/validator";

export interface ValidatorRewards {
  reward_epoch: number | null;
  self_bond_earnings_flr: number | null;
  total_flr: number | null;
  reward_rate_epoch_pct: number | null;
  reward_rate_annual_pct: number | null;
}

export interface ValidatorStaking {
  generated_at_unix: number;
  identity_address: string;
  node_id: string | null;
  has_validator: boolean;
  self_bond_flr: number | null;
  delegated_flr: number | null;
  total_stake_flr: number | null;
  capacity_flr: number | null;
  capacity_used_pct: number | null;
  delegators_count: number | null;
  fee_pct: number | null;
  active_end_unix: number | null;
  rewards: ValidatorRewards;
}

export function useValidatorStaking() {
  const query = useQuery({
    queryKey: ["validator-staking"],
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ValidatorStaking> => {
      const res = await fetch(VALIDATOR_URL, { cache: "no-cache" });
      if (!res.ok)
        throw new Error(`Failed to load validator staking (${res.status})`);
      return (await res.json()) as ValidatorStaking;
    },
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
