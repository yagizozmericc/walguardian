import type { KvStore } from "./kv";

/**
 * Fixed-window counters (per minute and per UTC day) on a shared store, so
 * every server instance enforces the same budget. A denied request still
 * counts toward its window; windows reset at their boundary.
 */

export interface LimitRule {
  /** Identity the budget applies to, e.g. a hashed session or IP. */
  id: string;
  perMinute: number;
  perDay: number;
}

export type LimitResult = { allowed: true } | { allowed: false; reason: string; retryAfterS: number };

const MINUTE = 60_000;
const DAY = 86_400_000;

export async function consumeLimits(store: KvStore, bucket: string, rules: readonly LimitRule[], now = Date.now()): Promise<LimitResult> {
  const minute = Math.floor(now / MINUTE);
  const day = Math.floor(now / DAY);
  const counts = await store.incr(
    rules.flatMap((r) => [
      { key: `rl:${bucket}:${r.id}:m:${minute}`, ttlS: 120 },
      { key: `rl:${bucket}:${r.id}:d:${day}`, ttlS: 90_000 },
    ]),
  );
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (counts[i * 2] > r.perMinute) {
      return { allowed: false, reason: `limit of ${r.perMinute} requests per minute reached`, retryAfterS: Math.ceil(((minute + 1) * MINUTE - now) / 1000) };
    }
    if (counts[i * 2 + 1] > r.perDay) {
      return { allowed: false, reason: `daily limit of ${r.perDay} requests reached`, retryAfterS: Math.ceil(((day + 1) * DAY - now) / 1000) };
    }
  }
  return { allowed: true };
}
