import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useConfig, usePublicClient } from "wagmi";
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
  nodeIdToString,
  savePublicKey,
  STAKE_LATENCY_BUFFER,
  type DisplayStake,
  type ValidatorMeta,
  type ValidatorRow,
} from "../lib/staking";
import { loadCachedStats, saveCachedStats } from "../lib/statsCache";
import { fetchProviderMetadata } from "./useProviders";
import {
  CONTRACT_REGISTRY_ADDRESS,
  contractRegistryAbi,
  entityManagerAbi,
  flareSystemsManagerAbi,
  voterRegistryAbi,
  FLARE_RPC_URL,
  resolveLiveConnector,
  wrapWalletProvider,
} from "../lib/flare";

const network = Network.FLARE;
const API_ORIGIN = deriveApiOrigin(FLARE_RPC_URL);

export type StakingBusy =
  | null
  | "enableP"
  | "moveToP"
  | "stake"
  | "claim"
  | "withdraw"
  | "importToP"
  | "importToC";

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
  const { address, connector, status } = useAccount();
  // wagmi reports `isConnected` while it is still reconnecting a persisted
  // session, at which point the connector cannot sign anything yet.
  const isConnected = status === "connected";
  const config = useConfig();
  const publicClient = usePublicClient();
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
    const live = resolveLiveConnector(config, connector);
    if (!live) {
      throw new Error("Wallet is still reconnecting — try again in a moment.");
    }
    const provider = wrapWalletProvider((await live.getProvider()) as any);
    const controller = new EIP1193WalletController(provider);
    const wallet = await controller.getActiveWallet();
    if (!wallet) throw new Error("Could not resolve an active wallet account");
    return wallet;
  }, [connector, config]);

  // Protocol stake limits and the validator roster are public P-chain reads and
  // do not require the user's public key, so they load as soon as possible.
  // Both hydrate from the last visit's localStorage snapshot (placeholderData)
  // so the page paints instantly while the slow public-RPC reads run.
  const limits = useQuery({
    queryKey: ["stakeLimits"],
    staleTime: 5 * 60_000,
    placeholderData: () => loadCachedStats<StakeLimits>("stakeLimits"),
    queryFn: async (): Promise<StakeLimits> => network.getStakeLimits(),
  });

  const validatorsQuery = useQuery({
    queryKey: ["validatorsOnP"],
    staleTime: 60_000,
    refetchInterval: 60_000,
    enabled: !!limits.data,
    placeholderData: () => loadCachedStats<ValidatorRow[]>("validatorsOnP"),
    queryFn: async (): Promise<ValidatorRow[]> => {
      const raw = await network.getValidatorsOnP();
      return aggregateValidators(raw, limits.data!.minStakeDuration);
    },
  });

  // Snapshot fresh (non-placeholder) results for the next page load.
  useEffect(() => {
    if (limits.data && !limits.isPlaceholderData) saveCachedStats("stakeLimits", limits.data);
  }, [limits.data, limits.isPlaceholderData]);
  useEffect(() => {
    if (validatorsQuery.data && !validatorsQuery.isPlaceholderData)
      saveCachedStats("validatorsOnP", validatorsQuery.data);
  }, [validatorsQuery.data, validatorsQuery.isPlaceholderData]);

  // Link P-chain node ids back to the FTSO entities that registered them, so we
  // can show the provider's name and logo next to each validator. The mapping
  // is fully on-chain: EntityManager records the `bytes20` node ids each voter
  // registered; we CB58-encode those to `NodeID-...` strings and attach the
  // display metadata from the community provider list (matched by identity or
  // delegation address).
  const validatorMeta = useQuery({
    queryKey: ["validatorMeta"],
    enabled: !!publicClient,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<Map<string, ValidatorMeta>> => {
      const [voterRegistry, entityManager, systemsManager] = (await publicClient!.multicall({
        allowFailure: false,
        contracts: (["VoterRegistry", "EntityManager", "FlareSystemsManager"] as const).map(
          (name) => ({
            address: CONTRACT_REGISTRY_ADDRESS,
            abi: contractRegistryAbi,
            functionName: "getContractAddressByName",
            args: [name],
          })
        ),
      })) as unknown as [`0x${string}`, `0x${string}`, `0x${string}`];

      const rewardEpochId = Number(
        (await publicClient!.readContract({
          address: systemsManager,
          abi: flareSystemsManagerAbi,
          functionName: "getCurrentRewardEpochId",
        })) as number | bigint
      );
      // Use a two-epoch window so validators for an entity that has not yet
      // re-registered this epoch still resolve, mirroring useProviders().
      const epochsToRead =
        rewardEpochId > 0 ? [rewardEpochId, rewardEpochId - 1] : [rewardEpochId];
      const voterLists = (await Promise.all(
        epochsToRead.map((epoch) =>
          publicClient!
            .readContract({
              address: voterRegistry,
              abi: voterRegistryAbi,
              functionName: "getRegisteredVoters",
              args: [BigInt(epoch)],
            })
            .catch(() => [] as readonly `0x${string}`[])
        )
      )) as readonly (readonly `0x${string}`[])[];

      const uniqueVoters: `0x${string}`[] = [];
      const seenVoters = new Set<string>();
      for (const list of voterLists) {
        for (const voter of list ?? []) {
          const key = voter.toLowerCase();
          if (!seenVoters.has(key)) {
            seenVoters.add(key);
            uniqueVoters.push(voter);
          }
        }
      }

      if (uniqueVoters.length === 0) return new Map();

      // Read the node ids each entity currently has registered. Note we use
      // `getNodeIdsOf` (live) rather than the reward-epoch snapshot
      // `getNodeIdsOfAt`, which returns empty for this index.
      const [nodeIdResults, delegationResults, metadata] = await Promise.all([
        publicClient!.multicall({
          allowFailure: true,
          contracts: uniqueVoters.map((voter) => ({
            address: entityManager,
            abi: entityManagerAbi,
            functionName: "getNodeIdsOf",
            args: [voter],
          })),
        }),
        publicClient!.multicall({
          allowFailure: true,
          contracts: uniqueVoters.map((voter) => ({
            address: entityManager,
            abi: entityManagerAbi,
            functionName: "getDelegationAddressOf",
            args: [voter],
          })),
        }),
        fetchProviderMetadata(),
      ]);

      const map = new Map<string, ValidatorMeta>();
      uniqueVoters.forEach((voter, i) => {
        const nr = nodeIdResults[i];
        if (nr.status !== "success") return;
        const rawNodeIds = nr.result as unknown as readonly `0x${string}`[];
        if (!rawNodeIds || rawNodeIds.length === 0) return;

        const delegation =
          delegationResults[i]?.status === "success"
            ? (delegationResults[i].result as unknown as `0x${string}`)
            : undefined;
        // Provider lists key by delegation address or identity address; try both.
        const meta =
          metadata.get(voter.toLowerCase()) ??
          (delegation ? metadata.get(delegation.toLowerCase()) : undefined);

        for (const raw of rawNodeIds) {
          map.set(nodeIdToString(raw), {
            name: meta?.name,
            logoURI: meta?.logoURI,
            identityAddress: voter,
          });
        }
      });
      return map;
    },
  });

  // Merge the on-chain metadata into the validator rows (order preserved).
  const validators = useMemo(() => {
    const rows = validatorsQuery.data ?? [];
    const meta = validatorMeta.data;
    if (!meta || meta.size === 0) return rows;
    return rows.map((v) => {
      const m = meta.get(v.nodeId);
      if (!m) return v;
      return { ...v, name: m.name, logoURI: m.logoURI, identityAddress: m.identityAddress };
    });
  }, [validatorsQuery.data, validatorMeta.data]);

  const balance = useQuery({
    queryKey: ["pchain-balance", publicKey],
    enabled: !!publicKey,
    refetchInterval: 15_000,
    // Last-known balances for this account paint immediately; the live read
    // replaces them within seconds and every 15s after.
    placeholderData: () =>
      publicKey ? loadCachedStats<Balance>(`balance:${publicKey}`) : undefined,
    queryFn: async (): Promise<Balance> => network.getBalance(publicKey!),
  });

  useEffect(() => {
    if (publicKey && balance.data && !balance.isPlaceholderData)
      saveCachedStats(`balance:${publicKey}`, balance.data);
  }, [balance.data, balance.isPlaceholderData, publicKey]);

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

  /**
   * Resolve (and cache) the P-chain public key.
   *
   * The public key is public information and the SDK recovers it in two ways:
   * first from the account's existing on-chain transaction history (via the
   * block explorer, with no wallet interaction), and only if that fails does it
   * fall back to prompting a one-time message signature. As a result, accounts
   * that have already sent a transaction on a Flare network are enabled without
   * any signature — the wallet is never asked to sign, so the copy below must
   * not promise a signature that may not happen.
   */
  const enableP = useCallback(async () => {
    if (publicKey) return publicKey;
    setBusy("enableP");
    const t = toast.loading("Enabling P-chain staking — approve the signature if your wallet prompts you...");
    try {
      const wallet = await getWallet();
      if (!wallet.getPublicKey) {
        throw new Error("This wallet cannot expose a public key for P-chain staking.");
      }
      const pk = await wallet.getPublicKey();
      // The SDK verifies the recovered key against the connected address, but
      // guard here too so a wallet that returns nothing (or a key for another
      // account) never silently "enables" staking against the wrong identity.
      if (!pk) {
        throw new Error("Could not obtain the public key for this account.");
      }
      if (address && network.getCAddress(pk).toLowerCase() !== address.toLowerCase()) {
        throw new Error("Recovered public key does not match the connected account.");
      }
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
      } catch (e: any) {
        toast.error(e?.shortMessage ?? e?.message ?? "Transfer to P-chain failed", { id: t });
        throw e;
      } finally {
        setBusy(null);
        // Refresh even on failure: if the export landed but the import didn't,
        // the balance now carries a non-zero `notImportedToP` and the UI shows
        // the pending-import recovery notice.
        refresh();
      }
    },
    [getWallet, refresh]
  );

  /**
   * Finish a C→P transfer whose import step never completed (e.g. the user
   * rejected or missed the second wallet confirmation). Imports every UTXO
   * waiting in the P-chain import queue for this account.
   */
  const importToP = useCallback(async () => {
    setBusy("importToP");
    const t = toast.loading("Finishing the import to the P-chain...");
    try {
      const wallet = await getWallet();
      await network.importToP(wallet);
      toast.success("FLR imported to the P-chain", { id: t });
    } catch (e: any) {
      toast.error(e?.shortMessage ?? e?.message ?? "Import to P-chain failed", { id: t });
      throw e;
    } finally {
      setBusy(null);
      refresh();
    }
  }, [getWallet, refresh]);

  /** Counterpart of {@link importToP} for a stalled P→C withdrawal. */
  const importToC = useCallback(async () => {
    setBusy("importToC");
    const t = toast.loading("Finishing the import to the C-chain...");
    try {
      const wallet = await getWallet();
      await network.importToC(wallet);
      toast.success("FLR imported to the C-chain", { id: t });
    } catch (e: any) {
      toast.error(e?.shortMessage ?? e?.message ?? "Import to C-chain failed", { id: t });
      throw e;
    } finally {
      setBusy(null);
      refresh();
    }
  }, [getWallet, refresh]);

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
      } catch (e: any) {
        toast.error(e?.shortMessage ?? e?.message ?? "Withdrawal failed", { id: t });
        throw e;
      } finally {
        setBusy(null);
        // Same recovery story as moveToP: surface `notImportedToC` right away.
        refresh();
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
    validators,
    validatorsLoading: validatorsQuery.isLoading,
    stakes,
    stakesFetching: onchainStakes.isFetching,
    stakesOnchainFailed: onchainStakes.isError,
    claimableReward: claimableReward.data ?? 0n,
    claimableRewardReady: claimableReward.isSuccess,
    claimableRewardLoading: claimableReward.isLoading,
    claimableRewardError: claimableReward.isError,
    busy,
    enableP,
    moveToP,
    importToP,
    importToC,
    stake,
    claimRewards,
    withdrawToC,
    getValidatorCapacity,
    refetchStakes,
    refresh,
  };
}
