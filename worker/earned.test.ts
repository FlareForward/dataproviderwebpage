import assert from "node:assert/strict";
import test from "node:test";
import { combineEarnedTotals, type EarnedClaim } from "../src/lib/earned.js";

const NEGATIVE_OWNER = "0x4ebb057d0a2382959aa5b0a310a24c450f8c061f";
const DELEGATION_RATE_OWNER = "0x29055665e976439e5c45c27231979c78e0cb4cb4";
const STAKING_RATE_OWNER = "0xd3cc069b3cd3e3dd9750ceb2dd7eef26827d0a76";
const FLAREFORWARD_VOTER = "0x1FBB55a1877817A0f90cAE60c1ab22FC94f97110";
/**
 * Read on chain from EntityManager 2026-08-27. A member's rewards are credited
 * to the ROLE address, never the identity — delegation to the delegation
 * address, staking to the node id.
 */
const FLAREFORWARD_DELEGATION_ADDRESS =
  "0xce2c92c54f7307894725e8ceb16424b7c9c18807";
const FLAREFORWARD_NODE_ID = "0x3243c29a0658ce530b9e4fc610d2af2cbfbc5487";
const FLAREFORWARD_VOTERS = [
  FLAREFORWARD_VOTER,
  FLAREFORWARD_DELEGATION_ADDRESS,
  FLAREFORWARD_NODE_ID,
].map((a) => a.toLowerCase());
const REWARD_MANAGER =
  "0xC8f55c5aA2C752eE285Bd872855C749f4ee6239B".toLowerCase();
const FLARE_RPC = "https://flare-api.flare.network/ext/C/rpc";
const EXPECTED_WNAT = "0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d";
const EXPECTED_FLARE_SYSTEMS_MANAGER =
  "0x89e50DC0380e597ecE79c8494bAAFD84537AD0D4";
const EXPECTED_P_CHAIN_STAKE_MIRROR =
  "0x7b61F9F27153a4F2F57Dc30bF08A8eb0cCB96C22";
const V2_CLAIM_TOPIC =
  "0x06f77960d1401cc7d724b5c2b5ad672b9dbf08d8b11516a38c21697c23fbb0d2";
const RATE_SELECTORS = {
  registry: "0x82760fca",
  votePowerBlock: "0xc2632216",
  delegationPrincipal: "0xe64767aa",
  stakingPrincipal: "0x1f7ff2c7",
} as const;

type FetchHandler = (
  url: URL,
  init?: RequestInit,
) => MockResponse | Promise<MockResponse>;

class MockResponse {
  ok: boolean;
  status: number;
  headers: Record<string, string>;

  constructor(
    private readonly bodyText: string,
    init: { status?: number; headers?: Record<string, string> } = {},
  ) {
    this.status = init.status ?? 200;
    this.ok = this.status >= 200 && this.status < 300;
    this.headers = init.headers ?? {};
  }

  async json(): Promise<unknown> {
    return JSON.parse(this.bodyText);
  }

  async text(): Promise<string> {
    return this.bodyText;
  }

  clone(): MockResponse {
    return new MockResponse(this.bodyText, {
      status: this.status,
      headers: this.headers,
    });
  }
}

let activeFetch: FetchHandler = () => {
  throw new Error("Unexpected fetch call");
};

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

const {
  loadEarnedClaims,
  loadEarnedResponse,
  __resetEarnedRateCachesForTest,
} = await import("./earned.js");
const { weightedRate } = await import("../src/hooks/useEarned.js");

function topicFor(address: string): string {
  return `0x${"0".repeat(24)}${address.replace(/^0x/, "").toLowerCase()}`;
}

function hex(n: number): string {
  return `0x${n.toString(16)}`;
}

function word(value: bigint | number): string {
  return BigInt(value).toString(16).padStart(64, "0");
}

function strip0x(value: string): string {
  return value.replace(/^0x/, "");
}

function uintResult(value: bigint | number): string {
  return `0x${word(value)}`;
}

function addressResult(address: string): string {
  return `0x${strip0x(address).toLowerCase().padStart(64, "0")}`;
}

function flr(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return (
    BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0").slice(0, 18))
  );
}

function makeV2Log(
  index: number,
  {
    amountWei = 10n ** 18n,
    claimType = 2,
    block = 67_561_043 + index,
    unix = 1_786_913_510 + index,
  }: {
    amountWei?: bigint;
    claimType?: number;
    block?: number;
    unix?: number;
  } = {},
) {
  return {
    blockNumber: hex(block),
    timeStamp: hex(unix),
    data: `0x${word(index)}${word(claimType)}${word(amountWei)}`,
    topics: [V2_CLAIM_TOPIC],
  };
}

function json(body: unknown, status = 200): MockResponse {
  return new MockResponse(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function withMockFetch(handler: FetchHandler): () => void {
  activeFetch = handler;
  return () => {
    activeFetch = () => {
      throw new Error("Unexpected fetch call");
    };
  };
}

function requestBody(init?: RequestInit): unknown {
  const body = init?.body;
  if (typeof body !== "string") throw new Error("Expected string request body");
  return JSON.parse(body);
}

function decodeArg(data: string, index: number): string {
  const body = strip0x(data).slice(8);
  return body.slice(index * 64, (index + 1) * 64);
}

function decodeAddressArg(data: string, index: number): string {
  return `0x${decodeArg(data, index).slice(-40)}`.toLowerCase();
}

function decodeBytes20Arg(data: string, index: number): string {
  return `0x${decodeArg(data, index).slice(0, 40)}`.toLowerCase();
}

function decodeUintArg(data: string, index: number): bigint {
  return BigInt(`0x${decodeArg(data, index)}`);
}

function decodeStringArg(data: string): string {
  const body = strip0x(data).slice(8);
  const offset = Number(BigInt(`0x${body.slice(0, 64)}`)) * 2;
  const length = Number(BigInt(`0x${body.slice(offset, offset + 64)}`));
  const raw = body.slice(offset + 64, offset + 64 + length * 2);
  return new TextDecoder().decode(
    Uint8Array.from(raw.match(/../g)?.map((byte) => Number.parseInt(byte, 16)) ?? []),
  );
}

function ratePrincipalKey(
  kind: "delegation" | "staking",
  owner: string,
  epoch: number,
): string {
  return `${kind}:${owner.toLowerCase()}:${epoch}`;
}

function annualizedPct(amountWei: bigint, principalWei: bigint): number {
  return Number((amountWei * 7_300_000n) / (principalWei * 7n)) / 100;
}

interface EarnedEndpointMockOptions {
  owner: string;
  head: number;
  logsByVoter: Record<string, ReturnType<typeof makeV2Log>[]>;
  votePowerBlocks: Record<number, bigint>;
  principals: Record<string, bigint>;
  failPrincipalReads?: boolean;
}

interface RpcBatchRequest {
  id: number;
  method: string;
  params: [{ to: string; data: string }, string];
}

interface RpcMockState {
  registryNames: string[];
  batches: RpcBatchRequest[][];
}

function withEarnedEndpointMock(
  options: EarnedEndpointMockOptions,
): { restore: () => void; state: RpcMockState } {
  const state: RpcMockState = { registryNames: [], batches: [] };
  const votePowerBlockToEpoch = new Map(
    Object.entries(options.votePowerBlocks).map(([epoch, block]) => [
      block.toString(),
      Number(epoch),
    ]),
  );
  const restore = withMockFetch((url, init) => {
    if (url.toString() === FLARE_RPC) {
      const body = requestBody(init);
      if (!Array.isArray(body)) {
        assert.equal((body as { method?: string }).method, "eth_blockNumber");
        return json({
          jsonrpc: "2.0",
          id: (body as { id?: number }).id ?? 1,
          result: hex(options.head),
        });
      }

      const batch = body as RpcBatchRequest[];
      state.batches.push(batch);
      return json(
        batch.map((entry) => {
          assert.equal(entry.method, "eth_call");
          const call = entry.params[0];
          const selector = call.data.slice(0, 10);
          if (selector === RATE_SELECTORS.registry) {
            const name = decodeStringArg(call.data);
            state.registryNames.push(name);
            const byName: Record<string, string> = {
              WNat: EXPECTED_WNAT,
              FlareSystemsManager: EXPECTED_FLARE_SYSTEMS_MANAGER,
              PChainStakeMirror: EXPECTED_P_CHAIN_STAKE_MIRROR,
            };
            return { jsonrpc: "2.0", id: entry.id, result: addressResult(byName[name]) };
          }
          if (selector === RATE_SELECTORS.votePowerBlock) {
            const epoch = Number(decodeUintArg(call.data, 0));
            const block = options.votePowerBlocks[epoch];
            if (block == null) {
              return {
                jsonrpc: "2.0",
                id: entry.id,
                error: { code: -32000, message: "missing vote-power block" },
              };
            }
            return { jsonrpc: "2.0", id: entry.id, result: uintResult(block) };
          }
          if (
            selector === RATE_SELECTORS.delegationPrincipal ||
            selector === RATE_SELECTORS.stakingPrincipal
          ) {
            if (options.failPrincipalReads) {
              return {
                jsonrpc: "2.0",
                id: entry.id,
                error: { code: -32000, message: "principal read failed" },
              };
            }
            const kind =
              selector === RATE_SELECTORS.delegationPrincipal
                ? "delegation"
                : "staking";
            const owner = decodeAddressArg(call.data, 0);
            if (kind === "delegation") {
              assert.equal(
                decodeAddressArg(call.data, 1),
                FLAREFORWARD_DELEGATION_ADDRESS,
              );
            } else {
              assert.equal(decodeBytes20Arg(call.data, 1), FLAREFORWARD_NODE_ID);
            }
            const votePowerBlock = decodeUintArg(call.data, 2);
            const epoch = votePowerBlockToEpoch.get(votePowerBlock.toString());
            assert.notEqual(epoch, undefined);
            const key = ratePrincipalKey(kind, owner, epoch ?? 0);
            return {
              jsonrpc: "2.0",
              id: entry.id,
              result: uintResult(options.principals[key] ?? 0n),
            };
          }
          return {
            jsonrpc: "2.0",
            id: entry.id,
            error: { code: -32601, message: `unexpected selector ${selector}` },
          };
        }),
      );
    }

    if (!isV2RewardQuery(url) || !hasAttributedTopics(url, options.owner)) {
      return json({ message: "No logs found" });
    }
    const voter = voterOf(url);
    const logs = (voter ? options.logsByVoter[voter] : undefined) ?? [];
    const inRange = logs.filter((log) =>
      containsBlock(url, Number.parseInt(log.blockNumber ?? "0", 16)),
    );
    return inRange.length > 0
      ? json({ result: inRange })
      : json({ message: "No logs found" });
  });
  return { restore, state };
}

async function readEarned(address: string): Promise<{
  status: number;
  body: {
    epochs_per_year?: number;
    rates_partial?: boolean;
    claimed?: { total_wei?: string; delegation_wei?: string; staking_wei?: string };
    claims?: Array<{
      kind: string;
      principal_wei: string | null;
      rate_annualized_pct: number | null;
    }>;
  };
}> {
  const res = await loadEarnedResponse(address);
  return {
    status: res.status,
    body: res.body as {
      epochs_per_year?: number;
      rates_partial?: boolean;
      claimed?: { total_wei?: string; delegation_wei?: string; staking_wei?: string };
      claims?: Array<{
        kind: string;
        principal_wei: string | null;
        rate_annualized_pct: number | null;
      }>;
    },
  };
}

function isV2RewardQuery(url: URL): boolean {
  const params = url.searchParams;
  return (
    params.get("action") === "getLogs" &&
    params.get("address")?.toLowerCase() === REWARD_MANAGER &&
    params.get("topic0") === V2_CLAIM_TOPIC
  );
}

function voterOf(url: URL): string | null {
  const t = url.searchParams.get("topic1");
  if (!t) return null;
  const addr = `0x${t.slice(-40)}`.toLowerCase();
  return FLAREFORWARD_VOTERS.includes(addr) ? addr : null;
}

function hasAttributedTopics(url: URL, owner: string): boolean {
  const params = url.searchParams;
  return (
    voterOf(url) !== null &&
    params.get("topic2") === topicFor(owner) &&
    params.get("topic0_1_opr") === "and" &&
    params.get("topic0_2_opr") === "and" &&
    params.get("topic1_2_opr") === "and"
  );
}

function containsBlock(url: URL, block: number): boolean {
  const fromBlock = Number(url.searchParams.get("fromBlock") ?? 0);
  const toBlock = Number(url.searchParams.get("toBlock") ?? 0);
  return fromBlock <= block && block <= toBlock;
}

test("delegation claims include realized annualized rate from vote-power principal", async () => {
  __resetEarnedRateCachesForTest();
  const amountWei = 557_938_173_644_929_261n;
  const principalWei = 1_740_981_767_659_802_959_961n;
  const epoch = 428;
  const claimBlock = 68_300_000;
  const { restore, state } = withEarnedEndpointMock({
    owner: DELEGATION_RATE_OWNER,
    head: claimBlock,
    logsByVoter: {
      [FLAREFORWARD_DELEGATION_ADDRESS]: [
        makeV2Log(epoch, {
          amountWei,
          claimType: 2,
          block: claimBlock,
          unix: 1_786_913_510,
        }),
      ],
    },
    votePowerBlocks: { [epoch]: 68_274_379n },
    principals: {
      [ratePrincipalKey("delegation", DELEGATION_RATE_OWNER, epoch)]:
        principalWei,
    },
  });

  try {
    const { status, body } = await readEarned(DELEGATION_RATE_OWNER);

    assert.equal(status, 200);
    assert.equal(body.epochs_per_year, 104.2857);
    assert.equal(body.rates_partial, false);
    assert.deepEqual(state.registryNames, [
      "WNat",
      "FlareSystemsManager",
      "PChainStakeMirror",
    ]);
    assert.equal(body.claimed?.delegation_wei, amountWei.toString());
    assert.equal(body.claimed?.total_wei, amountWei.toString());
    assert.equal(body.claims?.[0]?.principal_wei, principalWei.toString());
    assert.equal(body.claims?.[0]?.rate_annualized_pct, 3.34);
  } finally {
    restore();
  }
});

test("staking claims include realized annualized rate from mirrored stake principal", async () => {
  __resetEarnedRateCachesForTest();
  const amountWei = 86_041_617_759_078_518_752n;
  const principalWei = 50_000_000_000_000_000_000_000n;
  const epoch = 424;
  const claimBlock = 67_300_000;
  const { restore } = withEarnedEndpointMock({
    owner: STAKING_RATE_OWNER,
    head: claimBlock,
    logsByVoter: {
      [FLAREFORWARD_NODE_ID]: [
        makeV2Log(epoch, {
          amountWei,
          claimType: 3,
          block: claimBlock,
          unix: 1_786_000_000,
        }),
      ],
    },
    votePowerBlocks: { [epoch]: 67_280_307n },
    principals: {
      [ratePrincipalKey("staking", STAKING_RATE_OWNER, epoch)]: principalWei,
    },
  });

  try {
    const { status, body } = await readEarned(STAKING_RATE_OWNER);

    assert.equal(status, 200);
    assert.equal(body.rates_partial, false);
    assert.equal(body.claimed?.staking_wei, amountWei.toString());
    assert.equal(body.claimed?.total_wei, amountWei.toString());
    assert.equal(body.claims?.[0]?.kind, "staking");
    assert.equal(body.claims?.[0]?.principal_wei, principalWei.toString());
    assert.equal(body.claims?.[0]?.rate_annualized_pct, 17.94);
  } finally {
    restore();
  }
});

test("zero principal leaves rate null without changing earned totals", async () => {
  __resetEarnedRateCachesForTest();
  const owner = "0x1111111111111111111111111111111111111111";
  const amountWei = flr("12.5");
  const epoch = 426;
  const claimBlock = 67_900_000;
  const { restore } = withEarnedEndpointMock({
    owner,
    head: claimBlock,
    logsByVoter: {
      [FLAREFORWARD_DELEGATION_ADDRESS]: [
        makeV2Log(epoch, {
          amountWei,
          claimType: 2,
          block: claimBlock,
          unix: 1_786_100_000,
        }),
      ],
    },
    votePowerBlocks: { [epoch]: 67_820_078n },
    principals: {
      [ratePrincipalKey("delegation", owner, epoch)]: 0n,
    },
  });

  try {
    const { status, body } = await readEarned(owner);

    assert.equal(status, 200);
    assert.equal(body.rates_partial, false);
    assert.equal(body.claimed?.total_wei, amountWei.toString());
    assert.equal(body.claims?.[0]?.principal_wei, "0");
    assert.equal(body.claims?.[0]?.rate_annualized_pct, null);
  } finally {
    restore();
  }
});

test("principal RPC failures mark rates partial without changing earned totals", async () => {
  __resetEarnedRateCachesForTest();
  const owner = "0x2222222222222222222222222222222222222222";
  const amountWei = flr("8");
  const epoch = 427;
  const claimBlock = 68_000_000;
  const { restore } = withEarnedEndpointMock({
    owner,
    head: claimBlock,
    logsByVoter: {
      [FLAREFORWARD_DELEGATION_ADDRESS]: [
        makeV2Log(epoch, {
          amountWei,
          claimType: 2,
          block: claimBlock,
          unix: 1_786_200_000,
        }),
      ],
    },
    votePowerBlocks: { [epoch]: 67_930_566n },
    principals: {},
    failPrincipalReads: true,
  });

  try {
    const { status, body } = await readEarned(owner);

    assert.equal(status, 200);
    assert.equal(body.rates_partial, true);
    assert.equal(body.claimed?.total_wei, amountWei.toString());
    assert.equal(body.claims?.[0]?.principal_wei, null);
    assert.equal(body.claims?.[0]?.rate_annualized_pct, null);
  } finally {
    restore();
  }
});

test("weightedRate uses the pooled amount over the pooled principal", () => {
  const claims = [
    { amountWei: flr("10"), principalWei: flr("1000") },
    { amountWei: flr("5"), principalWei: flr("100") },
  ];
  const amount = flr("15");
  const principal = flr("1100");

  assert.equal(weightedRate(claims), annualizedPct(amount, principal));
  assert.equal(weightedRate([{ amountWei: 1n, principalWei: 0n }]), null);
});

test("negative control rejects owner-only foreign claims for a non-FlareForward earner", async () => {
  const foreignClaims = Array.from({ length: 398 }, (_, i) => makeV2Log(i));
  const calls: URL[] = [];
  const restore = withMockFetch((url) => {
    calls.push(url);
    const params = url.searchParams;
    if (!isV2RewardQuery(url)) return json({ message: "No logs found" });

    const hasOwner = params.get("topic2") === topicFor(NEGATIVE_OWNER);
    if (hasAttributedTopics(url, NEGATIVE_OWNER))
      return json({ message: "No logs found" });
    if (hasOwner) return json({ result: foreignClaims });
    return json({ message: "No logs found" });
  });

  try {
    const { claims, partial } = await loadEarnedClaims(
      NEGATIVE_OWNER,
      67_561_043,
    );
    const total = claims.reduce(
      (sum, claim) => sum + BigInt(claim.amount_wei),
      0n,
    );

    assert.equal(partial, false);
    assert.equal(claims.length, 0);
    assert.equal(total, 0n);
    assert.ok(calls.some((url) => hasAttributedTopics(url, NEGATIVE_OWNER)));
  } finally {
    restore();
  }
});

test("positive control returns FlareForward owner FEE claims", async () => {
  const firstClaimBlock = 65_008_498;
  const feeClaims = [
    ...Array.from({ length: 27 }, (_, i) =>
      makeV2Log(i, {
        amountWei: flr("1000"),
        claimType: 2,
        block: firstClaimBlock + i,
        unix: 1_783_900_800 + i,
      }),
    ),
    makeV2Log(27, {
      amountWei: flr("938.04"),
      claimType: 2,
      block: firstClaimBlock + 27,
      unix: 1_783_900_827,
    }),
  ];
  const restore = withMockFetch((url) => {
    if (
      isV2RewardQuery(url) &&
      hasAttributedTopics(url, FLAREFORWARD_VOTER) &&
      voterOf(url) === FLAREFORWARD_VOTER.toLowerCase() &&
      containsBlock(url, firstClaimBlock)
    ) {
      return json({ result: feeClaims });
    }
    return json({ message: "No logs found" });
  });

  try {
    const { claims, partial } = await loadEarnedClaims(
      FLAREFORWARD_VOTER,
      67_561_043,
    );
    const total = claims.reduce(
      (sum, claim) => sum + BigInt(claim.amount_wei),
      0n,
    );

    assert.equal(partial, false);
    assert.equal(claims.length, 28);
    assert.equal(total, flr("27938.04"));
    assert.equal(
      claims.every((claim) => claim.kind === "delegation"),
      true,
    );
  } finally {
    restore();
  }
});

test("claimed logs and live claimable balances compose without double-counting", () => {
  const claims: EarnedClaim[] = [
    {
      block: 1,
      unix: 100,
      epoch: 10,
      kind: "delegation",
      amountWei: flr("10"),
    },
    {
      block: 2,
      unix: 200,
      epoch: 11,
      kind: "staking",
      amountWei: flr("20"),
    },
  ];
  const totals = combineEarnedTotals(claims, {
    delegationWei: flr("3"),
    stakingWei: flr("7"),
  });

  assert.equal(totals.claimed.totalWei, flr("30"));
  assert.equal(totals.claimable.totalWei, flr("10"));
  assert.equal(totals.earned.totalWei, flr("40"));
  assert.equal(
    totals.earned.totalWei,
    totals.claimed.totalWei + totals.claimable.totalWei,
  );
  assert.equal(totals.claimableReady, true);
});

test("claimable read gaps are surfaced instead of trusted as zero", () => {
  const totals = combineEarnedTotals([], {
    delegationWei: 0n,
    stakingWei: 0n,
    claimableReady: false,
  });

  assert.equal(totals.claimableReady, false);
});

test("bond earned totals keep claimed and claimable distributor rewards", () => {
  const totals = combineEarnedTotals([], {
    bondsTracked: true,
    bondsClaimedWei: flr("5"),
    bondsWei: flr("2"),
  });

  assert.equal(totals.claimed.bondsWei, flr("5"));
  assert.equal(totals.claimable.bondsWei, flr("2"));
  assert.equal(totals.earned.bondsWei, flr("7"));
  assert.equal(totals.earned.totalWei, flr("7"));
});

test("a full 1000-row Blockscout page marks the scan partial", async () => {
  const cappedPage = Array.from({ length: 1000 }, (_, i) => makeV2Log(i));
  const restore = withMockFetch((url) => {
    if (isV2RewardQuery(url) && hasAttributedTopics(url, FLAREFORWARD_VOTER)) {
      return json({ result: cappedPage });
    }
    return json({ message: "No logs found" });
  });

  try {
    const { partial } = await loadEarnedClaims(FLAREFORWARD_VOTER, 67_561_043);
    assert.equal(partial, true);
  } finally {
    restore();
  }
});

/**
 * Regression for the 2026-08-27 under-count. A member's rewards are credited to
 * FlareForward's ROLE addresses -- delegation to the delegation address, staking
 * to the node id -- never to the identity. Filtering on the identity alone
 * returned 0 FLR for a wallet that had actually been paid 2,915.44 FLR through
 * us, and the emptiness read as "nobody has earned anything yet" instead of as a
 * bug. Both role addresses must be queried.
 */
test("member rewards credited to the delegation address and node id are counted", async () => {
  const block = 66_000_000;
  const delegationClaims = [
    makeV2Log(0, { amountWei: flr("661.79"), claimType: 2, block, unix: 1_786_000_000 }),
  ];
  const stakingClaims = [
    makeV2Log(1, { amountWei: flr("2253.65"), claimType: 3, block: block + 1, unix: 1_786_000_100 }),
  ];
  const seen: string[] = [];
  const restore = withMockFetch((url) => {
    if (!isV2RewardQuery(url)) return json({ message: "No logs found" });
    const voter = voterOf(url);
    if (!voter || !containsBlock(url, block)) return json({ message: "No logs found" });
    seen.push(voter);
    if (voter === FLAREFORWARD_DELEGATION_ADDRESS) return json({ result: delegationClaims });
    if (voter === FLAREFORWARD_NODE_ID) return json({ result: stakingClaims });
    return json({ message: "No logs found" });
  });

  try {
    const { claims, partial } = await loadEarnedClaims(NEGATIVE_OWNER, block + 10);
    const total = claims.reduce((sum, c) => sum + BigInt(c.amount_wei), 0n);

    assert.equal(partial, false);
    assert.equal(claims.length, 2, "both role-address streams must be returned");
    assert.equal(total, flr("2915.44"), "delegation + staking must both be counted");
    assert.equal(claims.filter((c) => c.kind === "delegation").length, 1);
    assert.equal(claims.filter((c) => c.kind === "staking").length, 1);
    // The identity address must still be queried -- it carries our own FEE claims.
    assert.ok(seen.includes(FLAREFORWARD_DELEGATION_ADDRESS));
    assert.ok(seen.includes(FLAREFORWARD_NODE_ID));
  } finally {
    restore();
  }
});
