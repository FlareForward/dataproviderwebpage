/**
 * Past (ended) P-chain stakes for a wallet.
 *
 * `platform.getCurrentValidators` only lists stakes that are still running, so
 * a stake vanishes from the page the moment it ends. The P-chain keeps the
 * evidence in another place: when a stake ends, the principal comes back as an
 * ordinary unspent output whose transaction id is the original stake
 * transaction. So the history is rebuilt from the wallet's own balance
 * (`platform.getBalance` lists every unspent output id) and one cached
 * `platform.getTx` per distinct transaction -- a handful of light calls, none of
 * which scale with the size of the validator set.
 *
 * Once the user moves the returned FLR out of the P-chain, that output is
 * spent and no longer shows in the balance. The chain still remembers: the
 * transaction that spent it names the stake transaction as an input. So the
 * walk goes backwards from every unspent output through each transaction's
 * inputs, newest first, and keeps every stake transaction it meets. Every
 * stake seen live is also remembered on this device.
 *
 * No viem or SDK imports here, so this file also compiles under the worker
 * unit-test config.
 */

/** nanoFLR -> wei. */
const NANO = 1_000_000_000n;

export interface PastStake {
  /** The stake transaction id; the stable identity of a stake. */
  txId: string;
  nodeId: string;
  /** Principal in wei. */
  amount: bigint;
  startTime: bigint;
  endTime: bigint;
  type: "delegator" | "validator";
}

/** Serializable form of {@link PastStake} (bigints as strings). */
export interface StoredStake {
  txId: string;
  nodeId: string;
  amount: string;
  startTime: string;
  endTime: string;
  type: "delegator" | "validator";
}

const SEEN_PREFIX = "flareforward:pstakehist:";
const TX_PREFIX = "flareforward:ptx2:";
/** Most uncached transaction lookups made in one refresh, to spare the public RPC. */
const MAX_TX_LOOKUPS = 60;

export function toStored(s: PastStake): StoredStake {
  return {
    txId: s.txId,
    nodeId: s.nodeId,
    amount: s.amount.toString(),
    startTime: s.startTime.toString(),
    endTime: s.endTime.toString(),
    type: s.type,
  };
}

export function fromStored(s: StoredStake): PastStake | null {
  try {
    return {
      txId: s.txId,
      nodeId: s.nodeId,
      amount: BigInt(s.amount),
      startTime: BigInt(s.startTime),
      endTime: BigInt(s.endTime),
      type: s.type === "validator" ? "validator" : "delegator",
    };
  } catch {
    return null;
  }
}

/**
 * Read a stake out of a `platform.getTx` (json) result, or null when the
 * transaction is anything else (a transfer, an import, a reward...). Stake
 * transactions carry a `validator` block and a `stake` list; only validator
 * transactions also carry delegation shares or a signer.
 */
export function parseStakeTx(txId: string, tx: any): PastStake | null {
  const u = tx?.unsignedTx ?? tx;
  const v = u?.validator;
  if (!v || !Array.isArray(u?.stake) || typeof v.nodeID !== "string") return null;
  try {
    const isValidator = u.delegationShares != null || u.signer != null;
    return {
      txId,
      nodeId: v.nodeID,
      amount: BigInt(v.weight) * NANO,
      startTime: BigInt(v.start),
      endTime: BigInt(v.end),
      type: isValidator ? "validator" : "delegator",
    };
  } catch {
    return null;
  }
}

/** Newest first; ended stakes only; one row per stake transaction. */
export function mergePastStakes(
  lists: ReadonlyArray<ReadonlyArray<PastStake>>,
  now: bigint = BigInt(Math.floor(Date.now() / 1000))
): PastStake[] {
  const byTx = new Map<string, PastStake>();
  for (const list of lists) {
    for (const s of list) {
      if (s.endTime > now) continue;
      if (!byTx.has(s.txId)) byTx.set(s.txId, s);
    }
  }
  return [...byTx.values()].sort((a, b) =>
    b.endTime > a.endTime ? 1 : b.endTime < a.endTime ? -1 : 0
  );
}

function seenKey(address: string): string {
  return `${SEEN_PREFIX}${address.toLowerCase()}`;
}

export function loadSeenStakes(address?: string): PastStake[] {
  if (!address || typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(seenKey(address));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(fromStored).filter((s): s is PastStake => s !== null);
  } catch {
    return [];
  }
}

/** Remember stakes so they stay in the history after the chain stops listing them. */
export function rememberStakes(address: string, stakes: readonly PastStake[]): void {
  if (!address || stakes.length === 0 || typeof localStorage === "undefined") return;
  try {
    const known = new Map(loadSeenStakes(address).map((s) => [s.txId, s]));
    let changed = false;
    for (const s of stakes) {
      if (!known.has(s.txId)) {
        known.set(s.txId, s);
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem(seenKey(address), JSON.stringify([...known.values()].map(toStored)));
    }
  } catch {
    // Best-effort only.
  }
}

/** What one P-chain transaction tells us: the stake it is (if any) and what funded it. */
export interface TxInfo {
  stake: PastStake | null;
  /** Transactions whose outputs this one spent. */
  parents: string[];
}

/** Read a `platform.getTx` (json) result into a {@link TxInfo}. */
export function parseTxInfo(txId: string, tx: any): TxInfo {
  const u = tx?.unsignedTx ?? tx;
  const inputs: any[] = Array.isArray(u?.inputs) ? u.inputs : [];
  const parents = [
    ...new Set(inputs.map((i) => i?.txID).filter((t): t is string => typeof t === "string")),
  ];
  return { stake: parseStakeTx(txId, tx), parents };
}

/**
 * Walk backwards from `roots` through each transaction's inputs, nearest
 * first, collecting stake transactions. `getInfo` resolves one transaction
 * (cache first, then the network) and returns undefined when it cannot, which
 * just leaves that branch for a later refresh. `budget` caps how many
 * transactions are resolved in one run so a long history never floods the
 * public RPC; cached ones are free and the walk resumes where it stopped.
 */
export async function walkStakeAncestry(
  roots: readonly string[],
  getInfo: (txId: string) => Promise<TxInfo | undefined>,
  budget: { remaining: number },
  concurrency = 4
): Promise<PastStake[]> {
  const found: PastStake[] = [];
  const seen = new Set<string>(roots);
  let level = [...roots];
  while (level.length > 0 && budget.remaining > 0) {
    const next: string[] = [];
    for (let i = 0; i < level.length && budget.remaining > 0; i += concurrency) {
      const chunk = level.slice(i, i + concurrency);
      const infos = await Promise.all(chunk.map((id) => getInfo(id)));
      for (const info of infos) {
        if (!info) continue;
        if (info.stake) found.push(info.stake);
        for (const p of info.parents) {
          if (!seen.has(p)) {
            seen.add(p);
            next.push(p);
          }
        }
      }
    }
    level = next;
  }
  return found;
}

/**
 * A transaction never changes once accepted, so each lookup is cached for good.
 * (Key v2: the first version cached only the stake, not the parents.)
 */
function loadCachedTx(txId: string): TxInfo | undefined {
  if (typeof localStorage === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(TX_PREFIX + txId);
    if (raw == null) return undefined;
    const parsed = JSON.parse(raw) as { stake: StoredStake | null; parents: string[] };
    return {
      stake: parsed.stake ? fromStored(parsed.stake) : null,
      parents: Array.isArray(parsed.parents) ? parsed.parents : [],
    };
  } catch {
    return undefined;
  }
}

function saveCachedTx(txId: string, info: TxInfo): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      TX_PREFIX + txId,
      JSON.stringify({ stake: info.stake ? toStored(info.stake) : null, parents: info.parents })
    );
  } catch {
    // Best-effort only.
  }
}

async function rpc<T>(apiOrigin: string, method: string, params: unknown): Promise<T> {
  const res = await fetch(`${apiOrigin}/ext/bc/P`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`P-chain RPC responded ${res.status}`);
  const json = await res.json();
  if (json?.error) throw new Error(json.error.message ?? "P-chain RPC error");
  return json.result as T;
}

/**
 * Ended stakes found on the chain for a P-address: every stake transaction
 * behind the wallet's current unspent outputs, including ones whose returned
 * FLR has since been moved on. A failed lookup is skipped and retried on the
 * next refresh rather than failing the list.
 */
export async function fetchPastStakes(
  apiOrigin: string,
  pAddress: string,
  now: bigint = BigInt(Math.floor(Date.now() / 1000))
): Promise<PastStake[]> {
  const addr = pAddress.startsWith("P-") ? pAddress : `P-${pAddress}`;
  const bal = await rpc<{ utxoIDs?: Array<{ txID: string }> }>(apiOrigin, "platform.getBalance", {
    addresses: [addr],
  });
  const roots = [...new Set((bal.utxoIDs ?? []).map((u) => u.txID))];
  const budget = { remaining: MAX_TX_LOOKUPS };

  const getInfo = async (txId: string): Promise<TxInfo | undefined> => {
    const cached = loadCachedTx(txId);
    if (cached) return cached;
    if (budget.remaining <= 0) return undefined;
    budget.remaining--;
    try {
      const r = await rpc<{ tx: unknown }>(apiOrigin, "platform.getTx", {
        txID: txId,
        encoding: "json",
      });
      const info = parseTxInfo(txId, r.tx);
      saveCachedTx(txId, info);
      return info;
    } catch {
      return undefined;
    }
  };

  return mergePastStakes([await walkStakeAncestry(roots, getInfo, budget)], now);
}
