import assert from "node:assert/strict";
import test from "node:test";
import { CURRENT_LOT, tierKind } from "../src/lib/bondLot.js";

const EXPLORER_BASE =
  "https://flare-systems-explorer-backend.flare.network/api/v0";
const FLARE_RPC = "https://flare-api.flare.network/ext/C/rpc";
const NODE_ID = "NodeID-FlareForward";

const SELECTORS = {
  mintOpen: "0x24bbd049",
  isMintOpen: "0x19908016",
  totalSupply: "0x18160ddd",
  maxSupply: "0xd5abeb01",
  mintPrice: "0x6817c76c",
} as const;

type FetchHandler = (
  url: URL,
  init?: RequestInit,
) => MockResponse | Promise<MockResponse>;

class MockHeaders {
  private readonly map = new Map<string, string>();

  constructor(init?: Record<string, string> | MockHeaders) {
    if (init instanceof MockHeaders) {
      for (const [key, value] of init.map) this.map.set(key, value);
      return;
    }
    for (const [key, value] of Object.entries(init ?? {})) {
      this.set(key, value);
    }
  }

  get(name: string): string | null {
    return this.map.get(name.toLowerCase()) ?? null;
  }

  set(name: string, value: string): void {
    this.map.set(name.toLowerCase(), value);
  }
}

class MockResponse {
  ok: boolean;
  status: number;
  headers: MockHeaders;
  body: string;

  constructor(
    body: string | null = "",
    init: { status?: number; headers?: Record<string, string> | MockHeaders } = {},
  ) {
    this.body = body ?? "";
    this.status = init.status ?? 200;
    this.ok = this.status >= 200 && this.status < 300;
    this.headers = new MockHeaders(init.headers);
  }

  async json(): Promise<unknown> {
    return JSON.parse(this.body);
  }

  async text(): Promise<string> {
    return this.body;
  }

  clone(): MockResponse {
    return new MockResponse(this.body, {
      status: this.status,
      headers: this.headers,
    });
  }
}

let activeFetch: FetchHandler = () => {
  throw new Error("Unexpected fetch call");
};

Object.defineProperty(globalThis, "Response", {
  value: MockResponse,
  configurable: true,
});

Object.defineProperty(globalThis, "fetch", {
  value: async (input: string | URL | Request, init?: RequestInit) => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    return activeFetch(new URL(rawUrl), init);
  },
  configurable: true,
});

const worker = await import("./index.js");

function json(body: unknown, status = 200): MockResponse {
  return new MockResponse(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestBody(init?: RequestInit): unknown {
  if (typeof init?.body !== "string") throw new Error("Expected JSON body");
  return JSON.parse(init.body);
}

function word(value: bigint | number): string {
  return BigInt(value).toString(16).padStart(64, "0");
}

function uintResult(value: bigint | number): string {
  return `0x${word(value)}`;
}

function boolResult(value: boolean): string {
  return uintResult(value ? 1 : 0);
}

function stakeRaw(flr: number): number {
  return flr * 1e9;
}

function tierKeyFor(address: string): string {
  const tier = CURRENT_LOT.tiers.find(
    (t) => t.address?.toLowerCase() === address.toLowerCase(),
  );
  if (!tier) throw new Error(`Unexpected tier address ${address}`);
  return tier.key;
}

test("support endpoint shows open bond lots and full validator, omitting unavailable reads", async () => {
  worker.__resetSupportCacheForTest();

  activeFetch = (url, init) => {
    if (url.toString() === `${EXPLORER_BASE}/entity?query=0x1FBB55a1877817A0f90cAE60c1ab22FC94f97110`) {
      return json({
        results: [
          {
            denormalizedentity: {
              node_ids: [NODE_ID],
            },
          },
        ],
      });
    }

    if (url.toString() === `${EXPLORER_BASE}/validators?limit=100&offset=0`) {
      return json({
        count: 1,
        results: [
          {
            node_id: NODE_ID,
            self_bond: stakeRaw(20),
            delegated: stakeRaw(80),
            total_available_stake: stakeRaw(100),
          },
        ],
      });
    }

    if (url.toString() === FLARE_RPC) {
      const batch = requestBody(init) as Array<{
        id: number;
        method: string;
        params: [{ to: string; data: string }, string];
      }>;
      return json(
        batch.map((entry) => {
          assert.equal(entry.method, "eth_call");
          assert.equal(entry.params[1], "latest");
          const call = entry.params[0];
          const key = tierKeyFor(call.to);
          const isTerm = tierKind(CURRENT_LOT.tiers.find((t) => t.key === key)!) === "term";
          const openSelector = isTerm ? SELECTORS.isMintOpen : SELECTORS.mintOpen;

          if (key === "lot3-1m") {
            return { jsonrpc: "2.0", id: entry.id, error: { message: "boom" } };
          }

          const states: Record<string, { open: boolean; total: bigint; max: bigint }> = {
            "tier-a": { open: true, total: 250n, max: 250n },
            "tier-b": { open: false, total: 3n, max: 21n },
            "lot2-10k": { open: true, total: 138n, max: 250n },
          };
          const state = states[key] ?? { open: false, total: 0n, max: 250n };

          if (call.data === openSelector) {
            return { jsonrpc: "2.0", id: entry.id, result: boolResult(state.open) };
          }
          if (call.data === SELECTORS.totalSupply) {
            return { jsonrpc: "2.0", id: entry.id, result: uintResult(state.total) };
          }
          if (call.data === SELECTORS.maxSupply) {
            return { jsonrpc: "2.0", id: entry.id, result: uintResult(state.max) };
          }
          if (call.data === SELECTORS.mintPrice) {
            return { jsonrpc: "2.0", id: entry.id, result: uintResult(10_000n * 10n ** 18n) };
          }
          throw new Error(`Unexpected call data ${call.data}`);
        }),
      );
    }

    throw new Error(`Unexpected fetch ${url.toString()}`);
  };

  const res = await worker.default.fetch(
    { url: "https://ftso.flareforward.com/api/support" } as Request,
    {},
  );
  const body = (await res.json()) as {
    version: number;
    staking: Array<{ id: string; state: string; room_flr: number }>;
    bonds: Array<{ id: string; left: number }>;
  };

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.equal(res.headers.get("cache-control"), "public, max-age=60");
  assert.equal(res.headers.get("content-type"), "application/json");
  assert.equal(body.version, 1);
  assert.deepEqual(body.staking, [
    { id: "ftso-v1", name: "FlareForward validator", state: "full", room_flr: 0, url: "https://ftso.flareforward.com/staking" },
  ]);
  assert.deepEqual(body.bonds, [
    {
      id: "lot2-10k",
      name: "Lot 2 · 10,000 FLR",
      left: 112,
      open_flr: 1_120_000,
      url: "https://ftso.flareforward.com/nft",
    },
  ]);
});
