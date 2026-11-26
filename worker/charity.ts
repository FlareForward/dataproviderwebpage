/**
 * `/api/charity` — what the FTSO charity Safe has received from profits.
 *
 * Every FTSO splitter pays a fixed 5% of profit to this 2-of-3 Safe. The total
 * is the sum of every successful FLR transfer INTO the Safe (splitter payouts
 * arrive as internal transactions; a direct send would be a plain one), read
 * from the public Flare explorer. The current balance comes from Flare RPC.
 * "Received" stays honest after the Safe gives money away; "balance" does not.
 *
 * If any explorer page fails, `received_flr` is null rather than a short
 * number (the page then shows the balance only).
 */

export const CHARITY_SAFE = "0xD797c533f890F2f1ECf4f5D6e7d7BF3bBF6eeCfa";

const BLOCKSCOUT = "https://flare-explorer.flare.network/api/v2";
const FLARE_RPC = "https://flare-api.flare.network/ext/C/rpc";
const MAX_PAGES = 20;
const CACHE_SECONDS = 300;

type Item = { value?: string; success?: boolean; status?: string; timestamp?: string };

let cache: { expiresAtMs: number; body: unknown } | null = null;

async function sumIncoming(kind: "internal-transactions" | "transactions") {
  let wei = 0n;
  let count = 0;
  let lastTs: number | null = null;
  let params: Record<string, unknown> | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({ filter: "to" });
    if (params) for (const [k, v] of Object.entries(params)) q.set(k, String(v));
    const res = await fetch(`${BLOCKSCOUT}/addresses/${CHARITY_SAFE}/${kind}?${q}`, {
      headers: { Accept: "application/json" },
      cf: { cacheTtl: 120, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) throw new Error(`explorer ${kind} -> ${res.status}`);
    const data = (await res.json()) as { items?: Item[]; next_page_params?: Record<string, unknown> | null };
    for (const it of data.items ?? []) {
      const ok = it.success === true || it.status === "ok";
      const v = BigInt(it.value ?? "0");
      if (!ok || v === 0n) continue;
      wei += v;
      count += 1;
      const ts = it.timestamp ? Math.floor(Date.parse(it.timestamp) / 1000) : NaN;
      if (Number.isFinite(ts) && (lastTs == null || ts > lastTs)) lastTs = ts;
    }
    params = data.next_page_params ?? null;
    if (!params) return { wei, count, lastTs };
  }
  throw new Error(`explorer ${kind}: more than ${MAX_PAGES} pages`);
}

async function balanceWei(): Promise<bigint> {
  const res = await fetch(FLARE_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [CHARITY_SAFE, "latest"] }),
  });
  const j = (await res.json()) as { result?: string };
  if (!j.result) throw new Error("rpc balance");
  return BigInt(j.result);
}

const toFlr = (wei: bigint) => Number(wei / 10n ** 14n) / 10_000;

export async function handleCharity(): Promise<Response> {
  const now = Date.now();
  if (!cache || cache.expiresAtMs <= now) {
    const [inner, direct, bal] = await Promise.allSettled([
      sumIncoming("internal-transactions"),
      sumIncoming("transactions"),
      balanceWei(),
    ]);
    const received =
      inner.status === "fulfilled" && direct.status === "fulfilled"
        ? {
            flr: toFlr(inner.value.wei + direct.value.wei),
            payouts: inner.value.count + direct.value.count,
            last:
              Math.max(inner.value.lastTs ?? 0, direct.value.lastTs ?? 0) || null,
          }
        : null;
    cache = {
      expiresAtMs: now + CACHE_SECONDS * 1000,
      body: {
        generated_at_unix: Math.floor(now / 1000),
        address: CHARITY_SAFE,
        received_flr: received?.flr ?? null,
        payouts: received?.payouts ?? null,
        last_received_unix: received?.last ?? null,
        balance_flr: bal.status === "fulfilled" ? toFlr(bal.value) : null,
      },
    };
  }
  return new Response(JSON.stringify(cache.body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${CACHE_SECONDS}`,
      "access-control-allow-origin": "*",
    },
  });
}
