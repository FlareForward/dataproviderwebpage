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
type Eip1193Listener = (...args: any[]) => void;
interface Eip1193Source {
  request: (args: Eip1193RequestArgs) => Promise<unknown>;
  on?: (event: string, listener: Eip1193Listener) => unknown;
  removeListener?: (event: string, listener: Eip1193Listener) => unknown;
}
interface Eip1193Provider {
  request: (args: Eip1193RequestArgs) => Promise<unknown>;
  on: (event: string, listener: Eip1193Listener) => unknown;
  removeListener: (event: string, listener: Eip1193Listener) => unknown;
}

/**
 * Canonicalizes an `eth_chainId` result to a minimal `0x`-prefixed hex string
 * (e.g. `0xe`), matching the format the Flare SDK compares against. Handles the
 * common connector variations: a number/bigint (WalletConnect), a decimal
 * string, or a zero-padded hex string (`0x0e`). Anything unparseable is
 * returned untouched.
 */
function canonicalChainId(value: unknown): unknown {
  try {
    if (typeof value === "number" || typeof value === "bigint") {
      return `0x${BigInt(value).toString(16)}`;
    }
    if (typeof value === "string" && value.trim() !== "") {
      return `0x${BigInt(value).toString(16)}`;
    }
  } catch {
    // Not a parseable chain id; leave it alone.
  }
  return value;
}

/**
 * Wraps a wallet's EIP-1193 provider before handing it to the Flare SDK.
 *
 * The SDK's EIP-1193 layer assumes `eth_chainId` returns a hex string and calls
 * `String.prototype.startsWith` on it while resolving the chain before signing.
 * Connectors such as WalletConnect return the chain id as a number, which
 * surfaced as "a.startsWith is not a function" and broke every SDK write (wrap,
 * delegate, and both reward claims). A non-canonical value (e.g. `0x0e` or a
 * numeric `14`) also makes the SDK believe the wallet is on the wrong chain and
 * fire a `wallet_addEthereumChain` / `wallet_switchEthereumChain` dance that
 * some wallets stall on instead of ever surfacing the transaction prompt.
 *
 * Normalizing `eth_chainId` to a canonical hex string fixes both. We forward
 * only the members the SDK actually uses (`request`, `on`, `removeListener`) via
 * a plain object so we never interfere with the provider's internal state.
 */
export function wrapWalletProvider(provider: Eip1193Source): Eip1193Provider {
  return {
    request: async (args: Eip1193RequestArgs) => {
      const started = Date.now();
      // TEMP DEBUG: trace every wallet RPC call to localize the prod claim stall.
      console.info("[flare-provider] \u2192", args?.method);
      try {
        const result = await provider.request(args);
        console.info("[flare-provider] \u2713", args?.method, `${Date.now() - started}ms`);
        return args?.method === "eth_chainId" ? canonicalChainId(result) : result;
      } catch (e) {
        console.info("[flare-provider] \u2717", args?.method, `${Date.now() - started}ms`, e);
        throw e;
      }
    },
    on: (event, listener) => provider.on?.(event, listener),
    removeListener: (event, listener) => provider.removeListener?.(event, listener),
  };
}
