import { useCallback, useState } from "react";
import { useAccount, useConfig, usePublicClient } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { toast } from "sonner";
import { Network, Amount } from "@flarenetwork/flare-tx-sdk";
import { EIP1193WalletController } from "@flarenetwork/flare-tx-sdk";
import { resolveLiveConnector, wNatAbi, wrapWalletProvider } from "../lib/flare";
import { formatFlr } from "../lib/staking";
import { useWNatAddress } from "./useProviders";

const network = Network.FLARE;

export interface DelegationTarget {
  address: `0x${string}`;
  /** Whole-percentage share of vote power (0-100). */
  sharePct: number;
}

export function useDelegation() {
  const { address, connector, status } = useAccount();
  // wagmi reports `isConnected` while it is still reconnecting a persisted
  // session, at which point the connector cannot sign anything yet.
  const isConnected = status === "connected";
  const config = useConfig();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const { data: wNatAddress } = useWNatAddress();
  const [busy, setBusy] = useState<
    null | "wrap" | "unwrap" | "delegate" | "undelegate" | "claim"
  >(null);

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
    const live = resolveLiveConnector(config, connector);
    if (!live) {
      throw new Error("Wallet is still reconnecting — try again in a moment.");
    }
    console.info("[claim] getWallet: requesting provider from connector", live.id);
    const provider = wrapWalletProvider((await live.getProvider()) as any);
    console.info("[claim] getWallet: got provider, resolving active wallet");
    const controller = new EIP1193WalletController(provider);
    const wallet = await controller.getActiveWallet();
    if (!wallet) throw new Error("Could not resolve an active wallet account");
    console.info("[claim] getWallet: active wallet resolved");
    return wallet;
  }, [connector, config]);

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

  /**
   * WFLR back to FLR. Delegation is a percentage, so unwrapping part of the
   * balance needs no re-delegation — the instruction rides on whatever WFLR
   * remains. The SDK's unwrapToNative mirrors wrapNative exactly.
   */
  const unwrap = useCallback(
    async (amountFlr: string) => {
      const amount = Number(amountFlr);
      if (!amount || amount <= 0) return;
      setBusy("unwrap");
      const t = toast.loading(`Unwrapping ${amountFlr} WFLR to FLR...`);
      try {
        const wallet = await getWallet();
        await network.unwrapToNative(wallet, Amount.nats(amountFlr));
        toast.success(`Unwrapped ${amountFlr} WFLR`, { id: t });
        refresh();
      } catch (e: any) {
        toast.error(e?.shortMessage ?? e?.message ?? "Unwrap failed", { id: t });
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
      console.info("[claim] invoking network.claimFtsoReward");
      await network.claimFtsoReward(wallet);
      console.info("[claim] network.claimFtsoReward resolved");
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
    // Two places, truncated -- same as the staking page. Four decimals of FLR
    // is noise nobody reads, and rounding up shows more than is held.
    flrLabel: formatFlr(flr),
    wflrLabel: formatFlr(wflr),
    currentDelegations: delegation.data ?? [],
    claimableReward: reward,
    claimableRewardReady: claimableReward.isSuccess,
    claimableRewardLoading: claimableReward.isLoading,
    claimableRewardError: claimableReward.isError,
    claimableRewardLabel: formatFlr(reward),
    busy,
    wrap,
    unwrap,
    delegate,
    undelegate,
    claimRewards,
    refresh,
  };
}
