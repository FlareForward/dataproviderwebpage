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
