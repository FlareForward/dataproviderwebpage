import { usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import {
  CONTRACT_REGISTRY_ADDRESS,
  contractRegistryAbi,
  wNatAbi,
  voterRegistryAbi,
  entityManagerAbi,
  flareSystemsManagerAbi,
  shortAddress,
} from "../lib/flare";

export const PROVIDER_LIST_URL =
  "https://raw.githubusercontent.com/TowoLabs/ftso-signal-providers/master/bifrost-wallet.providerlist.json";

/**
 * Flare Forward is pinned to the top of the provider list regardless of vote
 * power. Matched against both delegation and identity addresses.
 */
const PINNED_PROVIDER_ADDRESS =
  "0x1FBB55a1877817A0f90cAE60c1ab22FC94f97110".toLowerCase();

/** How often to re-read the live provider roster from chain (ms). */
const REFRESH_MS = 30_000;

export interface RawProvider {
  chainId: number;
  name: string;
  description?: string;
  url?: string;
  address: string;
  logoURI?: string;
  listed?: boolean;
}

export const FLARE_CHAIN_ID_FOR_PROVIDERS = 14;

/**
 * Fetch the community provider list and index it by (lowercased) address. Both
 * the delegation view and the staking view use this to attach display names and
 * logos to on-chain identities. Best-effort: returns an empty map on failure.
 */
export async function fetchProviderMetadata(): Promise<Map<string, RawProvider>> {
  const metadata = new Map<string, RawProvider>();
  try {
    const res = await fetch(PROVIDER_LIST_URL, { cache: "no-cache" });
    if (res.ok) {
      const json = (await res.json()) as { providers: RawProvider[] };
      for (const p of json.providers) {
        if (p.chainId === FLARE_CHAIN_ID_FOR_PROVIDERS && p.address) {
          metadata.set(p.address.toLowerCase(), p);
        }
      }
    }
  } catch {
    // Metadata is best-effort.
  }
  return metadata;
}

export interface ProviderRow {
  /** Delegation address — the address users delegate WFLR to. */
  address: `0x${string}`;
  /** Identity address — the provider's canonical id shown on explorers. */
  identityAddress: `0x${string}`;
  name: string;
  description: string;
  url: string;
  logoURI: string;
  /** Vote power in whole FLR, or null if unavailable. */
  votePower: number | null;
  votePowerLabel: string;
  delegationPct: number | null;
  /** Whether the provider is registered for the current reward epoch. */
  registeredCurrentEpoch: boolean;
  status: "Active" | "Warning" | "Offline";
}

function formatVotePower(vp: number): string {
  if (vp >= 1e9) return `${(vp / 1e9).toFixed(2)}B`;
  if (vp >= 1e6) return `${(vp / 1e6).toFixed(2)}M`;
  if (vp >= 1e3) return `${(vp / 1e3).toFixed(2)}K`;
  return vp.toFixed(0);
}

/** Resolve any protocol contract address by name via the ContractRegistry. */
export function useContractAddress(name: string) {
  const publicClient = usePublicClient();
  return useQuery({
    queryKey: ["contractAddress", name],
    enabled: !!publicClient,
    staleTime: Infinity,
    queryFn: async () =>
      (await publicClient!.readContract({
        address: CONTRACT_REGISTRY_ADDRESS,
        abi: contractRegistryAbi,
        functionName: "getContractAddressByName",
        args: [name],
      })) as `0x${string}`,
  });
}

export function useWNatAddress() {
  return useContractAddress("WNat");
}

export function useProviders() {
  const publicClient = usePublicClient();

  const query = useQuery({
    queryKey: ["providers"],
    enabled: !!publicClient,
    staleTime: REFRESH_MS,
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      // 1. Resolve the protocol contracts we need in one batch.
      const [wNatAddress, voterRegistry, entityManager, systemsManager] =
        (await publicClient!.multicall({
          allowFailure: false,
          contracts: (
            ["WNat", "VoterRegistry", "EntityManager", "FlareSystemsManager"] as const
          ).map((name) => ({
            address: CONTRACT_REGISTRY_ADDRESS,
            abi: contractRegistryAbi,
            functionName: "getContractAddressByName",
            args: [name],
          })),
        })) as unknown as [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`];

      // 2. Enumerate registered providers across the current and previous
      //    reward epoch. Using a two-epoch window means providers that were
      //    active last epoch but have not (yet) re-registered for the current
      //    one still appear, flagged as not currently registered. (Older
      //    epochs are pruned on-chain, so one epoch back is the safe window.)
      const rewardEpochId = Number(
        (await publicClient!.readContract({
          address: systemsManager,
          abi: flareSystemsManagerAbi,
          functionName: "getCurrentRewardEpochId",
        })) as number | bigint
      );

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

      const currentEpochVoters = new Set(voterLists[0].map((v) => v.toLowerCase()));
      const uniqueVoters: `0x${string}`[] = [];
      const seenVoters = new Set<string>();
      for (const list of voterLists) {
        for (const voter of list) {
          const key = voter.toLowerCase();
          if (!seenVoters.has(key)) {
            seenVoters.add(key);
            uniqueVoters.push(voter);
          }
        }
      }

      // 3. Map each voter (identity address) to the delegation address that
      //    users actually delegate WFLR to, keeping the current-epoch flag.
      const delegationResults = await publicClient!.multicall({
        allowFailure: true,
        contracts: uniqueVoters.map((voter) => ({
          address: entityManager,
          abi: entityManagerAbi,
          functionName: "getDelegationAddressOf",
          args: [voter],
        })),
      });
      const entries = uniqueVoters
        .map((voter, i) => {
          const r = delegationResults[i];
          if (r.status !== "success") return null;
          return {
            identityAddress: voter,
            delegationAddress: r.result as unknown as `0x${string}`,
            registeredCurrentEpoch: currentEpochVoters.has(voter.toLowerCase()),
          };
        })
        .filter(
          (
            e
          ): e is {
            identityAddress: `0x${string}`;
            delegationAddress: `0x${string}`;
            registeredCurrentEpoch: boolean;
          } => !!e
        );
      const delegationAddresses = entries.map((e) => e.delegationAddress);

      // 4. Read total + per-provider vote power on-chain.
      let totalVotePower = 0;
      try {
        const total = (await publicClient!.readContract({
          address: wNatAddress,
          abi: wNatAbi,
          functionName: "totalVotePower",
        })) as bigint;
        totalVotePower = Number(formatUnits(total, 18));
      } catch {
        totalVotePower = 0;
      }

      let votePowers: (bigint | null)[] = [];
      try {
        const results = await publicClient!.multicall({
          allowFailure: true,
          contracts: delegationAddresses.map((addr) => ({
            address: wNatAddress,
            abi: wNatAbi,
            functionName: "votePowerOf",
            args: [addr],
          })),
        });
        votePowers = results.map((r) => (r.status === "success" ? (r.result as bigint) : null));
      } catch {
        votePowers = delegationAddresses.map(() => null);
      }

      // 5. Enrich with display metadata (name / logo / description) from the
      //    community provider list. Cache-busted so updates are picked up.
      const metadata = await fetchProviderMetadata();

      const providers: ProviderRow[] = entries.map((entry, i) => {
        const addr = entry.delegationAddress;
        // Metadata lists sometimes key by delegation address, sometimes by
        // identity address — try both.
        const meta =
          metadata.get(addr.toLowerCase()) ??
          metadata.get(entry.identityAddress.toLowerCase());
        const vpWei = votePowers[i];
        const votePower = vpWei !== null ? Number(formatUnits(vpWei, 18)) : null;
        const delegationPct =
          votePower !== null && totalVotePower > 0 ? (votePower / totalVotePower) * 100 : null;
        const status: ProviderRow["status"] =
          votePower === null
            ? "Offline"
            : !entry.registeredCurrentEpoch || votePower === 0
              ? "Warning"
              : "Active";
        return {
          address: addr,
          identityAddress: entry.identityAddress,
          name: meta?.name ?? shortAddress(entry.identityAddress),
          description: meta?.description ?? "",
          url: meta?.url ?? "",
          logoURI: meta?.logoURI ?? "",
          votePower,
          votePowerLabel: votePower !== null ? `${formatVotePower(votePower)} FLR` : "-",
          delegationPct,
          registeredCurrentEpoch: entry.registeredCurrentEpoch,
          status,
        };
      });

      providers.sort((a, b) => {
        const aPinned =
          a.address.toLowerCase() === PINNED_PROVIDER_ADDRESS ||
          a.identityAddress.toLowerCase() === PINNED_PROVIDER_ADDRESS;
        const bPinned =
          b.address.toLowerCase() === PINNED_PROVIDER_ADDRESS ||
          b.identityAddress.toLowerCase() === PINNED_PROVIDER_ADDRESS;
        if (aPinned !== bPinned) return aPinned ? -1 : 1;
        return (b.votePower ?? -1) - (a.votePower ?? -1);
      });
      return { providers, totalVotePower };
    },
  });

  return {
    providers: query.data?.providers ?? [],
    totalVotePower: query.data?.totalVotePower ?? 0,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
