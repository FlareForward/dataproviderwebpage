import assert from "node:assert/strict";
import test from "node:test";
import { combineEarnedTotals, type EarnedClaim } from "../src/lib/earned.js";

const NEGATIVE_OWNER = "0x4ebb057d0a2382959aa5b0a310a24c450f8c061f";
const FLAREFORWARD_VOTER = "0x1FBB55a1877817A0f90cAE60c1ab22FC94f97110";
const REWARD_MANAGER =
  "0xC8f55c5aA2C752eE285Bd872855C749f4ee6239B".toLowerCase();
const V2_CLAIM_TOPIC =
  "0x06f77960d1401cc7d724b5c2b5ad672b9dbf08d8b11516a38c21697c23fbb0d2";

type FetchHandler = (url: URL) => MockResponse;

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
  value: async (input: string | URL | Request) => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    return activeFetch(new URL(rawUrl));
  },
  configurable: true,
});

const { loadEarnedClaims } = await import("./earned.js");

function topicFor(address: string): string {
  return `0x${"0".repeat(24)}${address.replace(/^0x/, "").toLowerCase()}`;
}

function hex(n: number): string {
  return `0x${n.toString(16)}`;
}

function word(value: bigint | number): string {
  return BigInt(value).toString(16).padStart(64, "0");
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

function isV2RewardQuery(url: URL): boolean {
  const params = url.searchParams;
  return (
    params.get("action") === "getLogs" &&
    params.get("address")?.toLowerCase() === REWARD_MANAGER &&
    params.get("topic0") === V2_CLAIM_TOPIC
  );
}

function hasAttributedTopics(url: URL, owner: string): boolean {
  const params = url.searchParams;
  return (
    params.get("topic1") === topicFor(FLAREFORWARD_VOTER) &&
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
