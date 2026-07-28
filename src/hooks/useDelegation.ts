import { useCallback, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { toast } from "sonner";
import { Network, Amount } from "@flarenetwork/flare-tx-sdk";
import { EIP1193WalletController } from "@flarenetwork/flare-tx-sdk";
import { wNatAbi, wrapWalletProvider } from "../lib/flare";
import { useWNatAddress } from "./useProviders";

const network = Network.FLARE;

export interface DelegationTarget {
  address: `0x${string}`;
  /** Whole-percentage share of vote power (0-100). */
  sharePct: number;
}

export function useDelegation() {
  const { address, connector, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const { data: wNatAddress } = useWNatAddress();
  const [busy, setBusy] = useState<null | "wrap" | "delegate" | "undelegate" | "claim">(null);

  const balances = useQuery({
    queryKey: ["balances", address],
    enabled: !!address,
    refetchInterval: 15_000,
    queryFn: async () => {
      const [flr, wflr] = await Promise.all([
        network.getBalanceOnC(address!),
        network.getBalanceWrappedOnC(address!),
      ]);
      return { flr, wflr };
    },
  });

  const delegation = useQuery({
    queryKey: ["delegatesOf", address, wNatAddress],
    enabled: !!address && !!wNatAddress && !!publicClient,
    refetchInterval: 30_000,
    queryFn: async () => {
      const result = (await publicClient!.readContract({
        address: wNatAddress!,
        abi: wNatAbi,
        functionName: "delegatesOf",
        args: [address!],
      })) as readonly [readonly `0x${string}`[], readonly bigint[], bigint, bigint];
      const [delegates, bips] = result;
      return delegates.map((d, i) => ({ address: d, bips: Number(bips[i]) }));
    },
  });

  const claimableReward = useQuery({
    queryKey: ["claimableFtsoReward", address],
    enabled: !!address,
    refetchInterval: 30_000,
    queryFn: async (): Promise<bigint> => network.getClaimableFtsoReward(address!),
  });

  const getWallet = useCallback(async () => {
    if (!connector) throw new Error("No wallet connector available");
    const provider = wrapWalletProvider((await connector.getProvider()) as any);
    const controller = new EIP1193WalletController(provider);
    const wallet = await controller.getActiveWallet();
    if (!wallet) throw new Error("Could not resolve an active wallet account");
    return wallet;
  }, [connector]);

  const refresh = useCallback(() => {
    balances.refetch();
    delegation.refetch();
    claimableReward.refetch();
    // Vote power / delegation percentages in the provider list shift after a
    // delegate/undelegate, so refresh the live roster too.
    queryClient.invalidateQueries({ queryKey: ["providers"] });
  }, [balances, delegation, claimableReward, queryClient]);

  const wrap = useCallback(
    async (amountFlr: string) => {
      const amount = Number(amountFlr);
      if (!amount || amount <= 0) return;
      setBusy("wrap");
      const t = toast.loading(`Wrapping ${amountFlr} FLR to WFLR...`);
      try {
        const wallet = await getWallet();
        await network.wrapNative(wallet, Amount.nats(amountFlr));
        toast.success(`Wrapped ${amountFlr} FLR`, { id: t });
        refresh();
      } catch (e: any) {
        toast.error(e?.shortMessage ?? e?.message ?? "Wrap failed", { id: t });
        throw e;
      } finally {
        setBusy(null);
      }
    },
    [getWallet, refresh]
  );

  const delegate = useCallback(
    async (targets: DelegationTarget[]) => {
      if (targets.length === 0) return;
      setBusy("delegate");
      const t = toast.loading("Confirm the delegation in your wallet...");
      try {
        const wallet = await getWallet();
        const [d1, d2] = targets;
        await network.delegateToFtso(
          wallet,
          d1.address,
          Amount.percentages(d1.sharePct),
          d2?.address,
          d2 ? Amount.percentages(d2.sharePct) : undefined
        );
        toast.success("Delegation submitted", { id: t });
        refresh();
      } catch (e: any) {
        toast.error(e?.shortMessage ?? e?.message ?? "Delegation failed", { id: t });
        throw e;
      } finally {
        setBusy(null);
      }
    },
    [getWallet, refresh]
  );

  const undelegate = useCallback(async () => {
    setBusy("undelegate");
    const t = toast.loading("Removing delegation...");
    try {
      const wallet = await getWallet();
      await network.undelegateFromFtso(wallet);
      toast.success("Delegation removed", { id: t });
      refresh();
    } catch (e: any) {
      toast.error(e?.shortMessage ?? e?.message ?? "Undelegate failed", { id: t });
      throw e;
    } finally {
      setBusy(null);
    }
  }, [getWallet, refresh]);

  const claimRewards = useCallback(async () => {
    setBusy("claim");
    const t = toast.loading("Claiming FTSO delegation rewards...");
    try {
      const wallet = await getWallet();
      await network.claimFtsoReward(wallet);
      toast.success("Delegation rewards claimed", { id: t });
      refresh();
    } catch (e: any) {
      toast.error(e?.shortMessage ?? e?.message ?? "Claim failed", { id: t });
      throw e;
    } finally {
      setBusy(null);
    }
  }, [getWallet, refresh]);

  const flr = balances.data?.flr ?? 0n;
  const wflr = balances.data?.wflr ?? 0n;
  const reward = claimableReward.data ?? 0n;

  return {
    isConnected,
    address,
    flrBalance: flr,
    wflrBalance: wflr,
    flrLabel: Number(formatUnits(flr, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 }),
    wflrLabel: Number(formatUnits(wflr, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 }),
    currentDelegations: delegation.data ?? [],
    claimableReward: reward,
    claimableRewardLabel: Number(formatUnits(reward, 18)).toLocaleString(undefined, {
      maximumFractionDigits: 4,
    }),
    busy,
    wrap,
    delegate,
    undelegate,
    claimRewards,
    refresh,
  };
}
