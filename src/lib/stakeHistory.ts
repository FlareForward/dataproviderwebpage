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
 * spent and the chain no longer points at the stake, so every stake we see
 * (live or ended) is also remembered on this device.
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
const TX_PREFIX = "flareforward:ptx:";
/** Most uncached transaction lookups made in one refresh, to spare the public RPC. */
const MAX_TX_LOOKUPS = 24;

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

/**
 * A transaction never changes once accepted, so each lookup is cached for good
 * (including "this is not a stake", stored as null).
 */
function loadCachedTx(txId: string): PastStake | null | undefined {
  if (typeof localStorage === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(TX_PREFIX + txId);
    if (raw == null) return undefined;
    const parsed = JSON.parse(raw);
    return parsed === null ? null : fromStored(parsed);
  } catch {
    return undefined;
  }
}

function saveCachedTx(txId: string, stake: PastStake | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(TX_PREFIX + txId, JSON.stringify(stake ? toStored(stake) : null));
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
 * Ended stakes found on the chain for a P-address. Reads the unspent outputs
 * once, then looks up each distinct transaction not already known. A failed
 * lookup is skipped (and retried next refresh) rather than failing the list.
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
  const txIds = [...new Set((bal.utxoIDs ?? []).map((u) => u.txID))];

  const found: PastStake[] = [];
  let lookups = 0;
  for (const txId of txIds) {
    const cached = loadCachedTx(txId);
    if (cached !== undefined) {
      if (cached) found.push(cached);
      continue;
    }
    if (lookups >= MAX_TX_LOOKUPS) continue;
    lookups++;
    try {
      const r = await rpc<{ tx: unknown }>(apiOrigin, "platform.getTx", {
        txID: txId,
        encoding: "json",
      });
      const stake = parseStakeTx(txId, r.tx);
      saveCachedTx(txId, stake);
      if (stake) found.push(stake);
    } catch {
      // Leave uncached so the next refresh tries again.
    }
  }
  return mergePastStakes([found], now);
}
