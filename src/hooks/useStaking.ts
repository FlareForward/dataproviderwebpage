import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Network,
  Amount,
  EIP1193WalletController,
  type Balance,
  type Stake,
  type StakeLimits,
} from "@flarenetwork/flare-tx-sdk";
import {
  aggregateValidators,
  addTrackedStake,
  deriveApiOrigin,
  fetchUserStakes,
  loadPublicKey,
  loadTrackedStakes,
  mergeStakes,
  savePublicKey,
  STAKE_LATENCY_BUFFER,
  type DisplayStake,
  type ValidatorRow,
} from "../lib/staking";
import { FLARE_RPC_URL } from "../lib/flare";

const network = Network.FLARE;
const API_ORIGIN = deriveApiOrigin(FLARE_RPC_URL);

export type StakingBusy = null | "enableP" | "moveToP" | "stake" | "claim" | "withdraw";

export interface StakeParams {
  /** Amount to stake, in whole FLR (string, as entered by the user). */
  amountFlr: string;
  nodeId: string;
  /** Stake duration in seconds. */
  durationSecs: bigint;
  /** The selected validator's end time (seconds); the stake cannot outlast it. */
  validatorEndTime: bigint;
}

const ZERO_BALANCE: Balance = {
  availableOnC: 0n,
  availableOnP: 0n,
  wrappedOnC: 0n,
  stakedOnP: 0n,
  notImportedToC: 0n,
  notImportedToP: 0n,
};

export function useStaking() {
  const { address, connector, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<StakingBusy>(null);
  // The P-chain public key is only resolved after the user explicitly enables
  // staking, because recovering it triggers a one-time message signature.
  const [publicKey, setPublicKey] = useState<string | null>(null);
  // Bumped whenever we persist a locally-tracked stake, to recompute the merged
  // stake list.
  const [trackedVersion, setTrackedVersion] = useState(0);

  // Rehydrate the cached public key for the connected account so the one-time
  // signature is not required again on page refresh. The cached key is verified
  // to actually derive the connected C-chain address before being trusted, and
  // is cleared when the account changes or disconnects.
  useEffect(() => {
    if (!address) {
      setPublicKey(null);
      return;
    }
    const cached = loadPublicKey(address);
    if (cached) {
      try {
        if (network.getCAddress(cached).toLowerCase() === address.toLowerCase()) {
          setPublicKey(cached);
          return;
        }
      } catch {
        // Fall through and require re-enabling.
      }
    }
    setPublicKey(null);
  }, [address]);

  const getWallet = useCallback(async () => {
    if (!connector) throw new Error("No wallet connector available");
    const provider = (await connector.getProvider()) as any;
    const controller = new EIP1193WalletController(provider);
    const wallet = await controller.getActiveWallet();
    if (!wallet) throw new Error("Could not resolve an active wallet account");
    return wallet;
  }, [connector]);

  // Protocol stake limits and the validator roster are public P-chain reads and
  // do not require the user's public key, so they load as soon as possible.
  const limits = useQuery({
    queryKey: ["stakeLimits"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<StakeLimits> => network.getStakeLimits(),
  });

  const validators = useQuery({
    queryKey: ["validatorsOnP"],
    staleTime: 60_000,
    refetchInterval: 60_000,
    enabled: !!limits.data,
    queryFn: async (): Promise<ValidatorRow[]> => {
      const raw = await network.getValidatorsOnP();
      return aggregateValidators(raw, limits.data!.minStakeDuration);
    },
  });

  const balance = useQuery({
    queryKey: ["pchain-balance", publicKey],
    enabled: !!publicKey,
    refetchInterval: 15_000,
    queryFn: async (): Promise<Balance> => network.getBalance(publicKey!),
  });

  // On-chain stakes via a single `getCurrentValidators` call, filtered by the
  // wallet's P-address client-side. This avoids the SDK's `getStakesOnP`, which
  // issues one lookup per stake and rate-limits (HTTP 429) the public RPC.
  const onchainStakes = useQuery({
    queryKey: ["stakesOnP", publicKey],
    enabled: !!publicKey,
    retry: 1,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Stake[]> => {
      const pAddress = network.getPAddress(publicKey!);
      return fetchUserStakes(API_ORIGIN, pAddress);
    },
  });

  const stakes: DisplayStake[] = useMemo(() => {
    // `trackedVersion` and `address` are dependencies so the list recomputes
    // after a new local stake is recorded or the account changes.
    void trackedVersion;
    return mergeStakes(onchainStakes.data ?? [], loadTrackedStakes(address));
  }, [onchainStakes.data, address, trackedVersion]);

  const claimableReward = useQuery({
    queryKey: ["claimableStakingReward", address],
    enabled: !!address,
    refetchInterval: 30_000,
    queryFn: async (): Promise<bigint> => network.getClaimableStakingReward(address!),
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["pchain-balance"] });
    queryClient.invalidateQueries({ queryKey: ["validatorsOnP"] });
    queryClient.invalidateQueries({ queryKey: ["claimableStakingReward"] });
    queryClient.invalidateQueries({ queryKey: ["stakesOnP"] });
  }, [queryClient]);

  const refetchStakes = useCallback(() => onchainStakes.refetch(), [onchainStakes]);

  /** Resolve (and cache) the P-chain public key, prompting a one-time signature. */
  const enableP = useCallback(async () => {
    if (publicKey) return publicKey;
    setBusy("enableP");
    const t = toast.loading("Sign the message to enable P-chain staking...");
    try {
      const wallet = await getWallet();
      if (!wallet.getPublicKey) {
        throw new Error("This wallet cannot expose a public key for P-chain staking.");
      }
      const pk = await wallet.getPublicKey();
      setPublicKey(pk);
      if (address) savePublicKey(address, pk);
      toast.success("P-chain staking enabled", { id: t });
      return pk;
    } catch (e: any) {
      toast.error(e?.shortMessage ?? e?.message ?? "Could not enable P-chain", { id: t });
      throw e;
    } finally {
      setBusy(null);
    }
  }, [publicKey, getWallet, address]);

  const moveToP = useCallback(
    async (amountFlr: string) => {
      const amount = Number(amountFlr);
      if (!amount || amount <= 0) return;
      setBusy("moveToP");
      const t = toast.loading(
        `Moving ${amountFlr} FLR to the P-chain (export + import, two confirmations)...`
      );
      try {
        const wallet = await getWallet();
        await network.transferToP(wallet, Amount.nats(amountFlr));
        toast.success(`Moved ${amountFlr} FLR to the P-chain`, { id: t });
        refresh();
      } catch (e: any) {
        toast.error(e?.shortMessage ?? e?.message ?? "Transfer to P-chain failed", { id: t });
        throw e;
      } finally {
        setBusy(null);
      }
    },
    [getWallet, refresh]
  );

  const stake = useCallback(
    async ({ amountFlr, nodeId, durationSecs, validatorEndTime }: StakeParams) => {
      const amount = Number(amountFlr);
      if (!amount || amount <= 0 || !nodeId) return;
      setBusy("stake");
      const t = toast.loading("Confirm the stake in your wallet...");
      try {
        const wallet = await getWallet();
        // Compute the end time fresh at submission and add a latency buffer.
        // Flare (post-Etna) measures the lock from the processing time to
        // `endTime` and ignores the start time, so a stake requested at exactly
        // the minimum duration would be rejected once submission latency is
        // accounted for. Clamp so we never exceed the validator's end time or
        // the protocol maximum duration.
        const startTime = BigInt(Math.floor(Date.now() / 1000));
        let endTime = startTime + durationSecs + STAKE_LATENCY_BUFFER;
        if (endTime > validatorEndTime) endTime = validatorEndTime;
        const maxDuration = limits.data?.maxStakeDuration;
        if (maxDuration && endTime > startTime + maxDuration) {
          endTime = startTime + maxDuration;
        }
        await network.delegateOnP(wallet, Amount.nats(amountFlr), nodeId, startTime, endTime);
        // Record the stake locally so "Your Stakes" shows it immediately,
        // independent of the slow/rate-limited on-chain read.
        if (address) {
          addTrackedStake(address, {
            nodeId,
            amount: Amount.nats(amountFlr).toString(),
            startTime: startTime.toString(),
            endTime: endTime.toString(),
            type: "delegator",
          });
          setTrackedVersion((v) => v + 1);
        }
        toast.success("Stake submitted", { id: t });
        refresh();
      } catch (e: any) {
        toast.error(e?.shortMessage ?? e?.message ?? "Staking failed", { id: t });
        throw e;
      } finally {
        setBusy(null);
      }
    },
    [getWallet, refresh, address, limits.data]
  );

  const claimRewards = useCallback(async () => {
    setBusy("claim");
    const t = toast.loading("Claiming staking rewards...");
    try {
      const wallet = await getWallet();
      await network.claimStakingReward(wallet);
      toast.success("Staking rewards claimed", { id: t });
      refresh();
    } catch (e: any) {
      toast.error(e?.shortMessage ?? e?.message ?? "Claim failed", { id: t });
      throw e;
    } finally {
      setBusy(null);
    }
  }, [getWallet, refresh]);

  const withdrawToC = useCallback(
    async (amountFlr?: string) => {
      setBusy("withdraw");
      const t = toast.loading("Withdrawing FLR from the P-chain to the C-chain...");
      try {
        const wallet = await getWallet();
        await network.transferToC(wallet, amountFlr ? Amount.nats(amountFlr) : undefined);
        toast.success("Withdrawal to C-chain submitted", { id: t });
        refresh();
      } catch (e: any) {
        toast.error(e?.shortMessage ?? e?.message ?? "Withdrawal failed", { id: t });
        throw e;
      } finally {
        setBusy(null);
      }
    },
    [getWallet, refresh]
  );

  /**
   * Remaining delegation capacity for a validator, in wei. Computed lazily (on
   * selection) so the validator list stays cheap to render.
   */
  const getValidatorCapacity = useCallback(
    async (nodeId: string): Promise<bigint | null> => {
      if (!limits.data) return null;
      try {
        const nodeStakes = await network.getValidatorStakesOnP(nodeId);
        const total = nodeStakes.reduce((sum, s) => sum + s.amount, 0n);
        const remaining = limits.data.maxStakeAmount - total;
        return remaining > 0n ? remaining : 0n;
      } catch {
        return null;
      }
    },
    [limits.data]
  );

  return {
    isConnected,
    address,
    publicKey,
    pEnabled: !!publicKey,
    balance: balance.data ?? ZERO_BALANCE,
    balanceLoading: balance.isLoading,
    limits: limits.data ?? null,
    validators: validators.data ?? [],
    validatorsLoading: validators.isLoading,
    stakes,
    stakesFetching: onchainStakes.isFetching,
    stakesOnchainFailed: onchainStakes.isError,
    claimableReward: claimableReward.data ?? 0n,
    busy,
    enableP,
    moveToP,
    stake,
    claimRewards,
    withdrawToC,
    getValidatorCapacity,
    refetchStakes,
    refresh,
  };
}
