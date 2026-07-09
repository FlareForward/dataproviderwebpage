import { createPublicClient, http, formatUnits } from "viem";
import { flare } from "viem/chains";

const REGISTRY = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";

const registryAbi = [
  {
    type: "function",
    name: "getContractAddressByName",
    stateMutability: "view",
    inputs: [{ name: "_name", type: "string" }],
    outputs: [{ name: "", type: "address" }],
  },
];
const ftsoAbi = [
  {
    type: "function",
    name: "getSupportedFeedIds",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "_feedIds", type: "bytes21[]" }],
  },
  {
    type: "function",
    name: "getFeedsByIdInWei",
    stateMutability: "view",
    inputs: [{ name: "_feedIds", type: "bytes21[]" }],
    outputs: [
      { name: "_values", type: "uint256[]" },
      { name: "_timestamp", type: "uint64" },
    ],
  },
];
const wnatAbi = [
  { type: "function", name: "totalVotePower", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "votePowerOf", stateMutability: "view", inputs: [{ name: "_owner", type: "address" }], outputs: [{ type: "uint256" }] },
];

function decode(id) {
  const hex = id.slice(2);
  let name = "";
  for (let i = 2; i < hex.length; i += 2) {
    const c = parseInt(hex.slice(i, i + 2), 16);
    if (c === 0) break;
    name += String.fromCharCode(c);
  }
  return name;
}

const client = createPublicClient({ chain: flare, transport: http() });

const ftso = await client.readContract({ address: REGISTRY, abi: registryAbi, functionName: "getContractAddressByName", args: ["FtsoV2"] });
const wnat = await client.readContract({ address: REGISTRY, abi: registryAbi, functionName: "getContractAddressByName", args: ["WNat"] });
console.log("FtsoV2:", ftso);
console.log("WNat:  ", wnat);

const ids = await client.readContract({ address: ftso, abi: ftsoAbi, functionName: "getSupportedFeedIds" });
const crypto = ids.filter((i) => i.slice(0, 4) === "0x01");
console.log(`Supported feeds: ${ids.length} total, ${crypto.length} crypto`);

const sample = crypto.slice(0, 6);
const [values, ts] = await client.readContract({ address: ftso, abi: ftsoAbi, functionName: "getFeedsByIdInWei", args: [sample] });
console.log("Sample prices @", new Date(Number(ts) * 1000).toISOString());
sample.forEach((id, i) => console.log(`  ${decode(id).padEnd(10)} $${Number(formatUnits(values[i], 18)).toLocaleString()}`));

const res = await fetch("https://raw.githubusercontent.com/TowoLabs/ftso-signal-providers/master/bifrost-wallet.providerlist.json");
const list = await res.json();
const flareProviders = list.providers.filter((p) => p.chainId === 14 && p.listed !== false);
console.log(`Providers (chainId 14): ${flareProviders.length}`);

const total = await client.readContract({ address: wnat, abi: wnatAbi, functionName: "totalVotePower" });
console.log("Total vote power:", Number(formatUnits(total, 18)).toLocaleString(), "FLR");

const first = flareProviders[0];
const vp = await client.readContract({ address: wnat, abi: wnatAbi, functionName: "votePowerOf", args: [first.address] });
console.log(`Vote power of ${first.name}:`, Number(formatUnits(vp, 18)).toLocaleString(), "FLR");
console.log("\nAll real-data paths OK.");
