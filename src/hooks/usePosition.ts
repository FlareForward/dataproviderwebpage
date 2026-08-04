import { usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { Network } from "@flarenetwork/flare-tx-sdk";
import { wNatAbi } from "../lib/flare";
import { useWNatAddress } from "./useProviders";
import {
  classifyAddress,
  normalizePChain,
  type RewardsData,
  type PChainDelegator,
} from "../lib/rewards";

const network = Network.FLARE;

/**
 * A delegator's standing with FlareForward, for ANY address — pasted or
 * connected. Read-only: everything here is public chain/indexer state, so no
 * wallet connection is required.
 *
 * - C-chain `0x...` addresses: WFLR balance, share delegated to FlareForward's
 *   delegation address (WNat `delegatesOf`), and claimable FTSO rewards.
 * - P-chain `flare1...` / `P-flare1...` addresses: the matching stake row on
 *   FlareForward's validator (from the Explorer's validators list via
 *   /api/rewards).
 */
export interface CChainPosition {
  kind: "cchain";
  address: string;
  wflr: number;
  /** Percent of vote power delegated to FlareForward (0-100). */
  ffSharePct: number;
  /** WFLR amount that share represents. */
  ffDelegatedWflr: number;
  /** Claimable FTSO delegation rewards, in FLR. */
  claimableFlr: number;
  /** True if the address delegates to anyone at all. */
  hasAnyDelegation: boolean;
}

export interface PChainPosition {
  kind: "pchain";
  address: string;
  found: boolean;
  stake: PChainDelegator | null;
}

export type Position = CChainPosition | PChainPosition;

export function usePosition(
  rawInput: string,
  rewards: RewardsData | null
) {
  const publicClient = usePublicClient();
  const { data: wNatAddress } = useWNatAddress();

  const input = rawInput.trim();
  const kind = input ? classifyAddress(input) : "invalid";
  const ffDelegationAddress = rewards?.delegation_address?.toLowerCase() ?? null;

  const query = useQuery({
    queryKey: ["position", input, ffDelegationAddress, wNatAddress],
    enabled:
      kind === "pchain"
        ? !!rewards
        : kind === "cchain" && !!publicClient && !!wNatAddress && !!ffDelegationAddress,
    staleTime: 30_000,
    queryFn: async (): Promise<Position> => {
      if (kind === "pchain") {
        const target = normalizePChain(input);
        const stake =
          rewards?.delegators.find(
            (d) => d.p_address && normalizePChain(d.p_address) === target
          ) ?? null;
        return { kind: "pchain", address: input, found: !!stake, stake };
      }

      const address = input as `0x${string}`;
      const [balance, delegates, claimable] = await Promise.all([
        publicClient!.readContract({
          address: wNatAddress!,
          abi: wNatAbi,
          functionName: "balanceOf",
          args: [address],
        }) as Promise<bigint>,
        publicClient!.readContract({
          address: wNatAddress!,
          abi: wNatAbi,
          functionName: "delegatesOf",
          args: [address],
        }) as Promise<
          readonly [readonly `0x${string}`[], readonly bigint[], bigint, bigint]
        >,
        network.getClaimableFtsoReward(address).catch(() => 0n),
      ]);

      const [delegateAddrs, bips] = delegates;
      let ffBips = 0;
      delegateAddrs.forEach((d, i) => {
        if (d.toLowerCase() === ffDelegationAddress) ffBips = Number(bips[i]);
      });
      const wflr = Number(formatUnits(balance, 18));
      return {
        kind: "cchain",
        address: input,
        wflr,
        ffSharePct: ffBips / 100,
        ffDelegatedWflr: (wflr * ffBips) / 10_000,
        claimableFlr: Number(formatUnits(claimable, 18)),
        hasAnyDelegation: delegateAddrs.length > 0,
      };
    },
  });

  return {
    kind,
    position: query.data ?? null,
    isLoading: query.isLoading && query.fetchStatus !== "idle",
    error: query.error as Error | null,
  };
}
