import assert from "node:assert/strict";
import test from "node:test";
import {
  annualizePct,
  buildNetworkRatesResponse,
  handleNetworkRates,
} from "./networkRates.js";

const FLAREFORWARD_ADDRESS = "0x1FBB55a1877817A0f90cAE60c1ab22FC94f97110";

type FetchHandler = (
  url: URL,
  init?: RequestInit,
) => Response | Promise<Response>;

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

function withMockFetch(handler: FetchHandler): () => void {
  activeFetch = handler;
  return () => {
    activeFetch = () => {
      throw new Error("Unexpected fetch call");
    };
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function responseBody(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function approx(actual: number | null, expected: number, tolerance = 1e-12) {
  if (typeof actual !== "number") {
    assert.fail(`expected a number, got ${actual}`);
  }
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} was not within ${tolerance} of ${expected}`,
  );
}

function row({
  epoch = 429,
  wnatRate,
  mirrorRate,
  wnatWeight,
  stakingWeight,
  marker,
}: {
  epoch?: number;
  wnatRate: number;
  mirrorRate: number;
  wnatWeight: number | string;
  stakingWeight: number | string;
  marker?: unknown;
}) {
  return {
    marker,
    entityrewardslatest: {
      reward_epoch: epoch,
      reward_rate_wnat: wnatRate,
      reward_rate_mirror: mirrorRate,
    },
    denormalizedsigningpolicy: {
      w_nat_weight: wnatWeight,
      staking_weight: stakingWeight,
    },
  };
}

test("network rates computes weighted and simple medians on a 3-row fixture", () => {
  const data = buildNetworkRatesResponse([
    row({
      epoch: 428,
      wnatRate: 0.99,
      mirrorRate: 0.99,
      wnatWeight: 100,
      stakingWeight: 100,
    }),
    row({
      wnatRate: 0.0001,
      mirrorRate: 0.0005,
      wnatWeight: 1,
      stakingWeight: 1,
    }),
    row({
      wnatRate: 0.0002,
      mirrorRate: 0.0003,
      wnatWeight: 10,
      stakingWeight: 10,
    }),
    row({
      wnatRate: 0.0003,
      mirrorRate: 0.0001,
      wnatWeight: 1,
      stakingWeight: 1,
    }),
  ]);

  assert.equal(data.reward_epoch, 429);
  assert.equal(data.delegation.n, 3);
  assert.equal(data.staking.n, 3);
  approx(data.delegation.network_weighted_median_pct, annualizePct(0.0002));
  approx(data.delegation.network_median_pct, annualizePct(0.0002));
  approx(data.staking.network_weighted_median_pct, annualizePct(0.0003));
  approx(data.staking.network_median_pct, annualizePct(0.0003));
});

test("network rates returns 502 when the upstream returns 403", async () => {
  const restore = withMockFetch(() => json({ detail: "forbidden" }, 403));
  try {
    const res = await handleNetworkRates();
    assert.equal(res.status, 502);
    assert.match(String((await responseBody(res)).error), /network rates/i);
  } finally {
    restore();
  }
});

test("network rates returns 502 when the upstream returns 500", async () => {
  const restore = withMockFetch(() => json({ detail: "server error" }, 500));
  try {
    const res = await handleNetworkRates();
    assert.equal(res.status, 502);
    assert.match(String((await responseBody(res)).error), /network rates/i);
  } finally {
    restore();
  }
});

test("network rates detects the FlareForward row by address substring", () => {
  const data = buildNetworkRatesResponse([
    row({
      wnatRate: 0.0001,
      mirrorRate: 0.0001,
      wnatWeight: 1,
      stakingWeight: 1,
    }),
    row({
      wnatRate: 0.000314,
      mirrorRate: 0.00157,
      wnatWeight: 1,
      stakingWeight: 1,
      marker: {
        arbitrary_nested_text: `provider ${FLAREFORWARD_ADDRESS.toLowerCase()} here`,
      },
    }),
    row({
      wnatRate: 0.0002,
      mirrorRate: 0.0002,
      wnatWeight: 1,
      stakingWeight: 1,
    }),
  ]);

  approx(data.delegation.flareforward_pct, annualizePct(0.000314));
  approx(data.staking.flareforward_pct, annualizePct(0.00157));
});

test("network rates annualizes per-epoch fractions with the Flare epoch factor", () => {
  approx(annualizePct(0.01), 104.28571428571429);
  approx(annualizePct(1), 10428.57142857143);
});
