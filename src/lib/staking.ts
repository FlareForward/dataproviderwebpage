import { formatUnits, sha256, toBytes } from "viem";
import type { Stake, StakeLimits } from "@flarenetwork/flare-tx-sdk";

/**
 * A unified stake shape for the "Your Stakes" list. It merges authoritative
 * on-chain stakes with locally-tracked stakes created through this app (which
 * may not yet be indexed on-chain, or which the rate-limited public P-chain RPC
 * failed to return).
 */
export interface DisplayStake {
  key: string;
  nodeId: string;
  amount: bigint;
  startTime: bigint;
  endTime: bigint;
  type: string;
  /** True when the entry is only known locally and not yet confirmed on-chain. */
  pending: boolean;
}

/**
 * A stake record persisted to localStorage right after the user stakes, so the
 * UI can show it immediately without depending on the expensive, rate-limited
 * `getStakesOnP` read. Amounts/times are stored as strings (bigints are not
 * JSON-serializable).
 */
export interface TrackedStake {
  nodeId: string;
  amount: string;
  startTime: string;
  endTime: string;
  type: "delegator" | "validator";
}

const TRACKED_STAKES_PREFIX = "flareforward:pstakes:";
const PUBLIC_KEY_PREFIX = "flareforward:ppubkey:";

/**
 * The P-chain public key is deterministic for an account and is public
 * information (recoverable from any signed message or transaction), so it is
 * safe to cache. Caching it lets us skip the one-time signature prompt on page
 * refreshes while the same wallet stays connected.
 */
export function loadPublicKey(address?: string): string | null {
  if (!address || typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(`${PUBLIC_KEY_PREFIX}${address.toLowerCase()}`);
  } catch {
    return null;
  }
}

export function savePublicKey(address: string, publicKey: string): void {
  if (!address || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(`${PUBLIC_KEY_PREFIX}${address.toLowerCase()}`, publicKey);
  } catch {
    // Best-effort only.
  }
}

function trackedStakesKey(address: string): string {
  return `${TRACKED_STAKES_PREFIX}${address.toLowerCase()}`;
}

export function loadTrackedStakes(address?: string): TrackedStake[] {
  if (!address || typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(trackedStakesKey(address));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TrackedStake[]) : [];
  } catch {
    return [];
  }
}

export function addTrackedStake(address: string, stake: TrackedStake): void {
  if (!address || typeof localStorage === "undefined") return;
  try {
    const existing = loadTrackedStakes(address);
    existing.push(stake);
    localStorage.setItem(trackedStakesKey(address), JSON.stringify(existing));
  } catch {
    // Best-effort only; losing the local cache just means we fall back to the
    // on-chain read.
  }
}

/**
 * Merge on-chain stakes with locally-tracked ones. On-chain entries are
 * authoritative; a tracked entry is only surfaced (as `pending`) when the chain
 * read does not already contain a stake for that node. Also drops tracked
 * entries whose stake period has fully elapsed so stale local records disappear.
 */
export function mergeStakes(
  onchain: readonly Stake[],
  tracked: readonly TrackedStake[],
  now: bigint = BigInt(Math.floor(Date.now() / 1000))
): DisplayStake[] {
  const result: DisplayStake[] = onchain.map((s) => ({
    key: s.txId,
    nodeId: s.nodeId,
    amount: s.amount,
    startTime: s.startTime,
    endTime: s.endTime,
    type: s.type,
    pending: false,
  }));

  const onchainNodes = new Set(onchain.map((s) => s.nodeId));
  for (const t of tracked) {
    if (onchainNodes.has(t.nodeId)) continue;
    const endTime = BigInt(t.endTime);
    if (endTime <= now) continue;
    result.push({
      key: `local:${t.nodeId}:${t.endTime}`,
      nodeId: t.nodeId,
      amount: BigInt(t.amount),
      startTime: BigInt(t.startTime),
      endTime,
      type: t.type,
      pending: true,
    });
  }
  return result;
}

/**
 * A validator on the P-chain, shaped for display in the staking UI. Built from
 * the `Stake` entries returned by `Network.getValidatorsOnP()` (one entry per
 * validating node).
 */
export interface ValidatorRow {
  nodeId: string;
  /** Self-bonded amount in wei. */
  selfBond: bigint;
  selfBondLabel: string;
  /** Delegation fee charged to delegators, as a whole percentage (e.g. 15). */
  delegationFeePct: number;
  /** Seconds from the Unix epoch when the validator's stake ends. */
  endTime: bigint;
  endDate: Date;
  /** Whether the validator still has enough remaining time to accept a new stake. */
  acceptsDelegations: boolean;
  /**
   * Display name of the FTSO entity that registered this node, when the node id
   * can be linked back to a known provider (via EntityManager + provider list).
   */
  name?: string;
  /** Logo URL for the linked FTSO entity, when available. */
  logoURI?: string;
  /** Identity address of the FTSO entity that registered this node, if linked. */
  identityAddress?: `0x${string}`;
}

/** Metadata linked to a validator node id via on-chain entity registration. */
export interface ValidatorMeta {
  name?: string;
  logoURI?: string;
  identityAddress: `0x${string}`;
}

const CB58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes: Uint8Array): string {
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let str = "";
  for (const b of bytes) {
    if (b === 0) str += "1";
    else break;
  }
  for (let k = digits.length - 1; k >= 0; k--) str += CB58_ALPHABET[digits[k]];
  return str;
}

/**
 * Convert a raw 20-byte node id (as returned by `EntityManager.getNodeIdsOf`)
 * into the canonical P-chain `NodeID-<CB58>` string, so it can be matched
 * against the node ids returned by the P-chain. CB58 encodes
 * `payload ++ last4(sha256(payload))` with a base58 alphabet.
 */
export function nodeIdToString(hex: string): string {
  const payload = toBytes(hex);
  const checksum = toBytes(sha256(payload)).slice(-4);
  const full = new Uint8Array(payload.length + checksum.length);
  full.set(payload);
  full.set(checksum, payload.length);
  return `NodeID-${base58Encode(full)}`;
}

/** Delegation fees are returned in base points (10000 bips = 100%). */
const BIPS_DENOMINATOR = 10000;

/**
 * Safety margin (seconds) added to a delegation's end time. On Flare (post-Etna)
 * the P-chain ignores the submitted start time and measures the lock from when
 * the transaction is processed to `endTime`. Because transaction submission and
 * wallet confirmation take time, a stake requested at exactly `minStakeDuration`
 * would otherwise be rejected as "too short". This buffer absorbs that latency;
 * it is always clamped so it never exceeds the validator end time or the
 * protocol maximum duration.
 */
export const STAKE_LATENCY_BUFFER = 3600n;

export function formatFlr(wei: bigint, maxFractionDigits = 4): string {
  return Number(formatUnits(wei, 18)).toLocaleString(undefined, {
    maximumFractionDigits: maxFractionDigits,
  });
}

/**
 * Plain (unlocalized) FLR amount for prefilling numeric inputs. `formatFlr`
 * adds locale grouping ("1,234.5"), which `<input type="number">` rejects and
 * `Number()` parses as NaN — so MAX buttons must use this instead.
 */
export function formatFlrPlain(wei: bigint, maxFractionDigits = 6): string {
  const [int, frac = ""] = formatUnits(wei, 18).split(".");
  const trimmed = frac.slice(0, maxFractionDigits).replace(/0+$/, "");
  return trimmed ? `${int}.${trimmed}` : int;
}

/** Compact form of a NodeID for tight UI spots (keeps the recognizable head/tail). */
export function shortNodeId(nodeId: string, chars = 6): string {
  if (!nodeId) return "";
  // NodeIDs look like "NodeID-<base58>"; keep the prefix and trim the middle.
  const [prefix, body] = nodeId.includes("-") ? nodeId.split(/-(.+)/) : ["", nodeId];
  if (!body) return nodeId;
  if (body.length <= chars * 2) return nodeId;
  return `${prefix ? `${prefix}-` : ""}${body.slice(0, chars)}...${body.slice(-chars)}`;
}

/**
 * Convert the raw validator stakes from `getValidatorsOnP()` into display rows.
 * A validator can only accept a new delegation if its stake ends far enough in
 * the future to satisfy the minimum stake duration.
 */
/**
 * This validator is pinned to the top of the staking list regardless of its
 * self-bond amount.
 */
export const PINNED_VALIDATOR_NODE_ID =
  "NodeID-5amxeiA5AKHPPy6v1C7S1YgmkoXQDedtE";

export function aggregateValidators(
  validators: readonly Stake[],
  minStakeDuration: bigint,
  now: bigint = BigInt(Math.floor(Date.now() / 1000))
): ValidatorRow[] {
  return validators
    .map((v): ValidatorRow => {
      const feeBips = v.delegationFee ?? 0n;
      return {
        nodeId: v.nodeId,
        selfBond: v.amount,
        selfBondLabel: formatFlr(v.amount, 0),
        delegationFeePct: (Number(feeBips) / BIPS_DENOMINATOR) * 100,
        endTime: v.endTime,
        endDate: new Date(Number(v.endTime) * 1000),
        // Require enough remaining window to satisfy the minimum duration plus
        // the latency buffer we add at submission time.
        acceptsDelegations: v.endTime > now + minStakeDuration + STAKE_LATENCY_BUFFER,
      };
    })
    .sort((a, b) => {
      const aPinned = a.nodeId === PINNED_VALIDATOR_NODE_ID;
      const bPinned = b.nodeId === PINNED_VALIDATOR_NODE_ID;
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      return b.selfBond > a.selfBond ? 1 : b.selfBond < a.selfBond ? -1 : 0;
    });
}

export interface DurationOption {
  label: string;
  seconds: bigint;
}

const DAY = 86_400n;

/**
 * Build the list of stake-duration presets that are valid for a given
 * validator. Presets are clamped to `[minStakeDuration, maxStakeDuration]` and
 * must finish on or before the validator's own end time.
 */
export function buildDurationOptions(
  limits: StakeLimits,
  validatorEndTime: bigint,
  now: bigint = BigInt(Math.floor(Date.now() / 1000))
): DurationOption[] {
  const presets: Array<{ label: string; seconds: bigint }> = [
    { label: "2 weeks", seconds: 14n * DAY },
    { label: "1 month", seconds: 30n * DAY },
    { label: "3 months", seconds: 90n * DAY },
    { label: "6 months", seconds: 180n * DAY },
    { label: "1 year", seconds: 365n * DAY },
  ];

  // Longest duration that still ends on or before the validator's end time.
  const maxByValidator = validatorEndTime > now ? validatorEndTime - now : 0n;
  const upperBound =
    limits.maxStakeDuration < maxByValidator ? limits.maxStakeDuration : maxByValidator;

  const options = presets.filter(
    (p) => p.seconds >= limits.minStakeDuration && p.seconds <= upperBound
  );

  // Always offer a "max available" option that fills the validator window (or
  // the protocol maximum, whichever is smaller), as long as it clears the
  // minimum duration.
  if (upperBound >= limits.minStakeDuration) {
    const alreadyHasMax = options.some((o) => o.seconds === upperBound);
    if (!alreadyHasMax) {
      options.push({ label: "Max (until validator end)", seconds: upperBound });
    }
  }

  return options;
}

/** Derive the API origin (scheme + host) from a full RPC URL. */
export function deriveApiOrigin(rpcUrl: string): string {
  try {
    return new URL(rpcUrl).origin;
  } catch {
    return "https://flare-api.flare.network";
  }
}

function normalizePAddress(addr: string): string {
  return addr.replace(/^P-/i, "").toLowerCase();
}

function rawToStake(
  raw: any,
  type: "validator" | "delegator",
  pAddress: string,
  feePercent?: string
): Stake {
  // Delegation fee comes as a percentage string (e.g. "10.0000"); store it as
  // base points (10% -> 1000) to match the SDK's `Stake.delegationFee`.
  const delegationFee =
    feePercent != null && feePercent !== ""
      ? BigInt(Math.round(Number(feePercent) * 100))
      : undefined;
  return {
    txId: raw.txID,
    type: type as Stake["type"],
    pAddress,
    nodeId: raw.nodeID,
    startTime: BigInt(raw.startTime),
    endTime: BigInt(raw.endTime),
    // `weight` is denominated in nanoFLR; scale to wei.
    amount: BigInt(raw.weight) * BigInt(1e9),
    delegationFee,
  };
}

/**
 * Fetch the stakes belonging to a P-chain address in a SINGLE RPC call.
 *
 * The Flare P-chain `platform.getCurrentValidators` response already includes
 * every validator and its delegators inline, so we can filter client-side by
 * reward-owner address. This deliberately avoids the SDK's `getStakesOnP`,
 * which issues one transaction lookup per stake and gets rate-limited (HTTP 429)
 * on the public RPC.
 */
export async function fetchUserStakes(apiOrigin: string, pAddress: string): Promise<Stake[]> {
  const target = normalizePAddress(pAddress);
  const res = await fetch(`${apiOrigin}/ext/bc/P`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "platform.getCurrentValidators",
      params: {},
    }),
  });
  if (!res.ok) throw new Error(`P-chain RPC responded ${res.status}`);
  const json = await res.json();
  const validators: any[] = json?.result?.validators ?? [];

  const owns = (owner: any): boolean =>
    Array.isArray(owner?.addresses) &&
    owner.addresses.some((a: string) => normalizePAddress(a) === target);

  const stakes: Stake[] = [];
  for (const v of validators) {
    if (owns(v.validationRewardOwner) || owns(v.rewardOwner)) {
      stakes.push(rawToStake(v, "validator", pAddress, v.delegationFee));
    }
    const delegators: any[] = Array.isArray(v.delegators) ? v.delegators : [];
    for (const d of delegators) {
      if (owns(d.rewardOwner) || owns(d.delegationRewardOwner)) {
        stakes.push(
          rawToStake({ ...d, nodeID: d.nodeID ?? v.nodeID }, "delegator", pAddress, v.delegationFee)
        );
      }
    }
  }
  return stakes;
}

/**
 * Validate a requested stake amount against protocol limits and the balance
 * currently available on the P-chain. Returns a human-readable reason string
 * when invalid, or `null` when the amount is acceptable.
 */
export function validateStakeAmount(
  amountWei: bigint,
  limits: StakeLimits,
  availableOnP: bigint
): string | null {
  if (amountWei <= 0n) return "Enter an amount to stake.";
  if (amountWei < limits.minStakeAmountDelegator) {
    return `Minimum stake is ${formatFlr(limits.minStakeAmountDelegator, 0)} FLR.`;
  }
  if (amountWei > limits.maxStakeAmount) {
    return `Maximum stake is ${formatFlr(limits.maxStakeAmount, 0)} FLR.`;
  }
  if (amountWei > availableOnP) {
    return `Only ${formatFlr(availableOnP)} FLR available on the P-chain. Move more FLR to the P-chain first.`;
  }
  return null;
}

/**
 * Validate a requested cross-chain transfer against the balance available on
 * the source chain. Returns a human-readable reason when invalid, or `null`
 * when the amount is acceptable.
 */
export function validateTransferAmount(
  amountWei: bigint,
  available: bigint,
  sourceLabel: string
): string | null {
  if (amountWei <= 0n) return "Enter an amount to move.";
  if (amountWei > available) {
    // `sourceLabel` is a full phrase ("in your wallet", "on the P-chain") so
    // each side reads naturally — users don't need to know what the C-chain is.
    return `Only ${formatFlr(available)} FLR available ${sourceLabel}.`;
  }
  return null;
}
