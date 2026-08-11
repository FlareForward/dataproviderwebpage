/**
 * Tiny localStorage snapshot cache for slow chain reads (validator roster,
 * stake limits, balances, validator card stats). Queries hand their last
 * successful result here and hydrate from it as react-query placeholderData on
 * the next visit, so the staking page paints with last-known numbers instantly
 * while the real fetch runs behind it.
 *
 * Chain data is full of bigints (and validator rows carry Dates), which plain
 * JSON can't round-trip — values are tagged on the way out and revived on the
 * way in. Bump VERSION whenever a cached shape changes so stale snapshots are
 * ignored rather than misparsed.
 */

const VERSION = 1;
const PREFIX = `flareforward:statscache:v${VERSION}:`;

function replacer(this: Record<string, unknown>, key: string, value: unknown): unknown {
  if (typeof value === "bigint") return { $bigint: value.toString() };
  // Dates have already been flattened to ISO strings by toJSON when the
  // replacer runs; the untouched original lives on the holder object.
  if (this[key] instanceof Date) return { $date: (this[key] as Date).toISOString() };
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.$bigint === "string") return BigInt(v.$bigint);
    if (typeof v.$date === "string") return new Date(v.$date);
  }
  return value;
}

export function loadCachedStats<T>(key: string): T | undefined {
  if (typeof localStorage === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw, reviver) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function saveCachedStats(key: string, value: unknown): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value, replacer));
  } catch {
    // Best-effort cache — a quota or serialization failure just means the
    // next visit is a cold load again.
  }
}
