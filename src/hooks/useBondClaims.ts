import { useCallback, useMemo, useState } from "react";
import { useAccount, usePublicClient, useReadContracts, useWriteContract } from "wagmi";
import { erc20Abi } from "viem";
import { toast } from "sonner";
import { chain } from "../lib/flare";
import {
  bondLotAbi,
  CURRENT_LOT,
  distributorAbi,
  isShareTier,
  WFLR_ADDRESS,
  type BondTier,
} from "../lib/bondLot";

/** balanceOf, cumulative, PRECISION, distributor WFLR, lastKnownBalance. */
const READS_PER_TIER = 5;

type PaidTier = BondTier & { address: `0x${string}`; distributor: `0x${string}` };

/** Tiers that have a payout contract. An open lot has none and stays out. */
export const PAID_TIERS: PaidTier[] = CURRENT_LOT.tiers.filter(
  (t): t is PaidTier => isShareTier(t) && !!t.address && !!t.distributor,
);

export type ClaimPhase = "idle" | "processing" | "claiming" | "claimed" | "failed";

export interface BondClaimTier {
  tier: PaidTier;
  held: number;
  tokenIds: bigint[];
  bonds: Array<{
    tokenId: bigint;
    earnedWei: bigint;
    claimableWei: bigint;
  }>;
  payoutPerBondWei: bigint;
  lifetimeWei: bigint;
  claimableWei: bigint;
  unprocessedWei: bigint;
}

/**
 * What the connected wallet can claim from each lot's distributor, and the
 * two-step claim itself.
 *
 * The distributor's accounting is lazy: FLR sent to it does not show as owed
 * until `processAccumulatedERC20Payments` runs. So a claim is always POKE then
 * CLAIM, in that order, as two wallet confirmations. The poke is safe to send
 * with nothing to process (it simply does nothing); the claim reverts when
 * nothing is owed, so it is only sent once the re-read shows a balance.
 */
export function useBondClaims(viewedAddress?: `0x${string}`) {
  const { address, status } = useAccount();
  const isConnected = status === "connected";
  const owner = viewedAddress ?? address;
  const isViewingConnectedWallet =
    !!address && !!owner && address.toLowerCase() === owner.toLowerCase();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [phase, setPhase] = useState<ClaimPhase>("idle");
  const [activeTierKey, setActiveTierKey] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<`0x${string}` | null>(null);

  const zero = "0x0000000000000000000000000000000000000000" as const;

  // Pass 1: per paid tier, how many bonds this wallet holds, plus the
  // distributor's cumulative figure, its precision, and its unprocessed WFLR.
  const { data: base, refetch: refetchBase, isLoading: baseLoading } = useReadContracts({
    contracts: PAID_TIERS.flatMap((t) => [
      {
        address: t.address,
        abi: bondLotAbi,
        functionName: "balanceOf" as const,
        args: [owner ?? zero] as const,
        chainId: chain.id,
      },
      {
        address: t.distributor,
        abi: distributorAbi,
        functionName: "cumulativeRewardPerToken" as const,
        args: [WFLR_ADDRESS] as const,
        chainId: chain.id,
      },
      {
        address: t.distributor,
        abi: distributorAbi,
        functionName: "PRECISION" as const,
        chainId: chain.id,
      },
      {
        address: WFLR_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf" as const,
        args: [t.distributor] as const,
        chainId: chain.id,
      },
      {
        address: t.distributor,
        abi: distributorAbi,
        functionName: "lastKnownBalance" as const,
        args: [WFLR_ADDRESS] as const,
        chainId: chain.id,
      },
    ]),
    query: {
      enabled: !!owner && PAID_TIERS.length > 0,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    },
  });

  const tierBase = useMemo(
    () =>
      PAID_TIERS.map((t, i) => {
        const r = (k: number) => base?.[i * READS_PER_TIER + k]?.result as bigint | undefined;
        const balance = r(3) ?? 0n;
        const known = r(4) ?? 0n;
        return {
          tier: t,
          held: Number(r(0) ?? 0n),
          cumulative: r(1) ?? 0n,
          precision: r(2) ?? 0n,
          // Only the part of the balance not yet credited. The rest is already
          // owed to specific bonds (often other people's) and is not "new".
          unprocessedWei: balance > known ? balance - known : 0n,
        };
      }),
    [base],
  );

  // Pass 2: the token ids behind those balances.
  const indexCalls = useMemo(
    () =>
      tierBase.flatMap(({ tier, held }) =>
        Array.from({ length: held }, (_, idx) => ({ tier, idx })),
      ),
    [tierBase],
  );
  const { data: ids, refetch: refetchIds, isLoading: idsLoading } = useReadContracts({
    contracts: indexCalls.map((c) => ({
      address: c.tier.address,
      abi: bondLotAbi,
      functionName: "tokenOfOwnerByIndex" as const,
      args: [owner ?? zero, BigInt(c.idx)] as const,
      chainId: chain.id,
    })),
    query: { enabled: !!owner && indexCalls.length > 0 },
  });

  const owned = useMemo(
    () =>
      indexCalls
        .map((c, i) => {
          const id = ids?.[i]?.result as bigint | undefined;
          return id == null ? null : { tier: c.tier, id };
        })
        .filter((x): x is { tier: PaidTier; id: bigint } => !!x),
    [indexCalls, ids],
  );

  // Pass 3: what each id has already been credited, so claimable = cum - last.
  const { data: lastClaimed, refetch: refetchLast, isLoading: lastLoading } = useReadContracts({
    contracts: owned.map((o) => ({
      address: o.tier.distributor,
      abi: distributorAbi,
      functionName: "lastClaimedCumulativeReward" as const,
      args: [o.id, WFLR_ADDRESS] as const,
      chainId: chain.id,
    })),
    query: {
      enabled: owned.length > 0,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    },
  });

  const perTier = useMemo<BondClaimTier[]>(() => {
    return tierBase.map((tb) => {
      const mine = owned.filter((o) => o.tier.key === tb.tier.key);
      let claimableWei = 0n;
      const tokenIds: bigint[] = [];
      const payoutPerBondWei = tb.precision > 0n ? tb.cumulative / tb.precision : 0n;
      const bonds = mine.map((o) => {
        const idx = owned.indexOf(o);
        const last = (lastClaimed?.[idx]?.result as bigint | undefined) ?? 0n;
        const owed = tb.precision > 0n ? (tb.cumulative - last) / tb.precision : 0n;
        if (owed > 0n) claimableWei += owed;
        tokenIds.push(o.id);
        return {
          tokenId: o.id,
          earnedWei: payoutPerBondWei,
          claimableWei: owed > 0n ? owed : 0n,
        };
      });
      return {
        tier: tb.tier,
        held: tb.held,
        tokenIds,
        bonds,
        payoutPerBondWei,
        lifetimeWei: payoutPerBondWei * BigInt(tb.held),
        claimableWei,
        // Funds sitting in the distributor that nobody has processed yet. The
        // wallet's share of this only becomes claimable after the poke.
        unprocessedWei: tb.unprocessedWei,
      };
    });
  }, [tierBase, owned, lastClaimed]);

  const claimableWei = perTier.reduce((s, t) => s + t.claimableWei, 0n);
  const heldPaid = perTier.reduce((s, t) => s + t.held, 0);
  const unprocessedWei = perTier.reduce((s, t) => s + t.unprocessedWei, 0n);
  // Something may be owed: either already credited, or sitting unprocessed in a
  // distributor this wallet holds bonds in.
  const mayClaim =
    isConnected &&
    isViewingConnectedWallet &&
    heldPaid > 0 &&
    (claimableWei > 0n || perTier.some((t) => t.held > 0 && t.unprocessedWei > 0n));

  const refresh = useCallback(async () => {
    await refetchBase();
    await refetchIds();
    await refetchLast();
  }, [refetchBase, refetchIds, refetchLast]);

  /** Poke and claim one exact tier. No other distributor or token ids enter this path. */
  const claimTierRewards = useCallback(
    async (t: BondClaimTier) => {
      if (!publicClient) return;
      setActiveTierKey(t.tier.key);
      setPhase("processing");
      const pokeHash = await writeContractAsync({
        address: t.tier.distributor,
        abi: distributorAbi,
        functionName: "processAccumulatedERC20Payments",
        args: [[WFLR_ADDRESS]],
        chainId: chain.id,
      });
      await publicClient.waitForTransactionReceipt({ hash: pokeHash });

      // Re-read only this tier after its poke. A zero-value claim reverts, so
      // the token list must come from the post-poke distributor state.
      const distributor = t.tier.distributor;
      const [cumulative, precision, lastClaimedByToken] = await Promise.all([
        publicClient.readContract({
          address: distributor,
          abi: distributorAbi,
          functionName: "cumulativeRewardPerToken",
          args: [WFLR_ADDRESS],
        }),
        publicClient.readContract({
          address: distributor,
          abi: distributorAbi,
          functionName: "PRECISION",
        }),
        Promise.all(
          t.tokenIds.map((tokenId) =>
            publicClient.readContract({
              address: distributor,
              abi: distributorAbi,
              functionName: "lastClaimedCumulativeReward",
              args: [tokenId, WFLR_ADDRESS],
            }),
          ),
        ),
      ]);
      const owedIds = t.tokenIds.filter((_, index) => {
        const lastClaimed = lastClaimedByToken[index];
        return precision > 0n && (cumulative - lastClaimed) / precision > 0n;
      });
      if (owedIds.length === 0) {
        toast.message(`${t.tier.name}: nothing owed to your bonds yet`);
        return;
      }

      setPhase("claiming");
      const claimHash = await writeContractAsync({
        address: distributor,
        abi: distributorAbi,
        functionName: "claimRewards",
        args: [owedIds, [WFLR_ADDRESS]],
        chainId: chain.id,
      });
      await publicClient.waitForTransactionReceipt({ hash: claimHash });
      setLastTx(claimHash);
      toast.success(`${t.tier.name}: rewards claimed as WFLR`);
    },
    [publicClient, writeContractAsync],
  );

  const canStartClaim =
    !!address &&
    isViewingConnectedWallet &&
    !!publicClient &&
    phase !== "processing" &&
    phase !== "claiming";

  const finishClaim = useCallback(
    async (action: () => Promise<void>) => {
      setLastTx(null);
      try {
        await action();
        setPhase("claimed");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/rejected|denied|User rejected/i.test(msg)) {
          setPhase("idle");
          return;
        }
        setPhase("failed");
        toast.error("Claim failed", { description: msg.slice(0, 160) });
      } finally {
        setActiveTierKey(null);
        void refresh();
      }
    },
    [refresh],
  );

  /** Claim one lot only, using only that tier's distributor and owned token ids. */
  const claimTier = useCallback(
    async (tierKey: string) => {
      if (!canStartClaim) return;
      const tier = perTier.find((candidate) => candidate.tier.key === tierKey);
      if (!tier || tier.held === 0) return;
      await finishClaim(() => claimTierRewards(tier));
    },
    [canStartClaim, claimTierRewards, finishClaim, perTier],
  );

  /** Claim everything owed across every paid tier, one isolated tier at a time. */
  const claimAll = useCallback(async () => {
    if (!canStartClaim) return;
    await finishClaim(async () => {
      for (const tier of perTier) {
        if (tier.held > 0) await claimTierRewards(tier);
      }
    });
  }, [canStartClaim, claimTierRewards, finishClaim, perTier]);

  return {
    isConnected,
    isViewingConnectedWallet,
    viewedAddress: owner,
    hasPaidTiers: PAID_TIERS.length > 0,
    isLoading: !!owner && (baseLoading || idsLoading || lastLoading),
    heldPaid,
    perTier,
    claimableWei,
    unprocessedWei,
    mayClaim,
    phase,
    activeTierKey,
    lastTx,
    claimTier,
    claimAll,
    refresh,
  };
}
