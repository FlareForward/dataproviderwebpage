import { flare as flareChain } from "viem/chains";
import { flare as flareAbis } from "@flarenetwork/flare-wagmi-periphery-package";

/**
 * The FlareContractRegistry has the same address on every Flare network and is
 * the canonical way to resolve protocol contract addresses at runtime. We never
 * hardcode FtsoV2 / WNat addresses (per Flare developer guidance).
 */
export const CONTRACT_REGISTRY_ADDRESS =
  "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019" as const;

export const FLARE_RPC_URL =
  import.meta.env.VITE_FLARE_RPC_URL ?? flareChain.rpcUrls.default.http[0];

export const chain = flareChain;

/** ABIs sourced from the official @flarenetwork/flare-wagmi-periphery-package. */
export const contractRegistryAbi = flareAbis.iFlareContractRegistryAbi;
export const ftsoV2Abi = flareAbis.ftsoV2InterfaceAbi;
/** WNat implements IVPToken: balanceOf / votePowerOf / totalVotePower / delegatesOf. */
export const wNatAbi = flareAbis.ivpTokenAbi;

/**
 * On-chain FTSO provider registry contracts. These let us enumerate the live
 * set of registered data providers directly from chain state (instead of a
 * manually-maintained off-chain list), so newly registered providers show up
 * as soon as they are on-chain.
 */
export const flareSystemsManagerAbi = flareAbis.iFlareSystemsManagerAbi;
/** VoterRegistry.getRegisteredVoters(rewardEpochId) -> identity addresses. */
export const voterRegistryAbi = flareAbis.iVoterRegistryAbi;
/** EntityManager.getDelegationAddressOf(voter) maps identity -> delegation address. */
export const entityManagerAbi = flareAbis.iEntityManagerAbi;

/**
 * Block-latency feed reads are free view calls on Flare mainnet, but the
 * canonical FtsoV2 ABI marks them `payable`. We use a view-typed subset so
 * viem's typed `readContract` accepts them (eth_call ignores payability).
 */
export const ftsoV2ReadAbi = [
  {
    type: "function",
    name: "getSupportedFeedIds",
    inputs: [],
    outputs: [{ name: "_feedIds", type: "bytes21[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getFeedsByIdInWei",
    inputs: [{ name: "_feedIds", type: "bytes21[]" }],
    outputs: [
      { name: "_values", type: "uint256[]" },
      { name: "_timestamp", type: "uint64" },
    ],
    stateMutability: "view",
  },
] as const;

export const EXPLORER_URL = "https://flare-explorer.flare.network";

export function shortAddress(address?: string, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, 2 + chars)}...${address.slice(-chars)}`;
}

type Eip1193RequestArgs = { method: string; params?: unknown };

/**
 * Wraps an EIP-1193 provider so the Flare SDK never chokes on a numeric
 * `eth_chainId`. The SDK's EIP-1193 layer assumes `eth_chainId` returns a hex
 * string and calls `String.prototype.startsWith` on it while switching chains
 * before signing. Some connectors (notably WalletConnect) return the chain id
 * as a number, which surfaces as "a.startsWith is not a function" and breaks
 * every SDK write (wrap, delegate, and both reward claims). Coercing the result
 * back to a hex string keeps the whole signing path working regardless of
 * connector. The provider is otherwise passed through untouched.
 */
export function wrapWalletProvider<T extends { request: (args: Eip1193RequestArgs) => Promise<unknown> }>(
  provider: T
): T {
  return new Proxy(provider, {
    get(target, prop, receiver) {
      if (prop !== "request") {
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
      return async (args: Eip1193RequestArgs) => {
        const result = await target.request(args);
        if (
          args?.method === "eth_chainId" &&
          (typeof result === "number" || typeof result === "bigint")
        ) {
          return `0x${result.toString(16)}`;
        }
        return result;
      };
    },
  });
}
