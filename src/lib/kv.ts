import "server-only";
import { Redis } from "@upstash/redis";
import { env } from "./env";

/**
 * The few shared key-value operations Walguardian needs: counters for rate
 * limits, quotas and the Tatum budget, and short-lived JSON caches. Backed by
 * Upstash Redis (REST) when configured. Redis is never used to store memory
 * content; Walrus Memory remains the only memory store.
 *
 * Every method throws on a store failure; callers decide whether that fails
 * open (caches), degrades (read limits) or fails closed (writes, paid calls).
 */
export interface KvStore {
  /** Increments each counter by one and (re)sets its TTL; returns the new values in order. */
  incr(counters: readonly { key: string; ttlS: number }[]): Promise<number[]>;
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlS: number): Promise<void>;
  ping(): Promise<void>;
}

/** Upstash calls must never stall a request: one fast retry, then fail. */
const REDIS_TIMEOUT_MS = 1500;

export class UpstashKvStore implements KvStore {
  private readonly redis: Redis;

  constructor(cfg: { url: string; token: string }, private readonly prefix: string) {
    this.redis = new Redis({
      url: cfg.url,
      token: cfg.token,
      enableTelemetry: false,
      retry: { retries: 1, backoff: () => 100 },
      signal: () => AbortSignal.timeout(REDIS_TIMEOUT_MS),
    });
  }

  async incr(counters: readonly { key: string; ttlS: number }[]): Promise<number[]> {
    if (counters.length === 0) return [];
    const p = this.redis.pipeline();
    // Window boundaries are encoded in the key names, so refreshing the TTL on every hit is harmless.
    for (const c of counters) p.incr(this.prefix + c.key).expire(this.prefix + c.key, c.ttlS);
    const out = (await p.exec()) as unknown[];
    return counters.map((_, i) => Number(out[i * 2]));
  }

  async get<T>(key: string): Promise<T | null> {
    return (await this.redis.get<T>(this.prefix + key)) ?? null;
  }

  async set(key: string, value: unknown, ttlS: number): Promise<void> {
    await this.redis.set(this.prefix + key, value, { ex: ttlS });
  }

  async ping(): Promise<void> {
    await this.redis.ping();
  }
}

/** In-process store: the local-development default and the degraded fallback during a Redis outage. */
export class MemoryKvStore implements KvStore {
  private readonly data = new Map<string, { value: unknown; expires: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async incr(counters: readonly { key: string; ttlS: number }[]): Promise<number[]> {
    this.prune();
    return counters.map((c) => {
      const current = this.live(c.key);
      const next = (typeof current === "number" ? current : 0) + 1;
      this.data.set(c.key, { value: next, expires: this.now() + c.ttlS * 1000 });
      return next;
    });
  }

  async get<T>(key: string): Promise<T | null> {
    const v = this.live(key);
    // Mirror Redis: values round-trip through JSON.
    return v === undefined ? null : (JSON.parse(JSON.stringify(v)) as T);
  }

  async set(key: string, value: unknown, ttlS: number): Promise<void> {
    this.prune();
    this.data.set(key, { value: JSON.parse(JSON.stringify(value)), expires: this.now() + ttlS * 1000 });
  }

  async ping(): Promise<void> {}

  private live(key: string): unknown {
    const e = this.data.get(key);
    if (!e) return undefined;
    if (e.expires <= this.now()) {
      this.data.delete(key);
      return undefined;
    }
    return e.value;
  }

  private prune() {
    if (this.data.size < 10_000) return;
    const now = this.now();
    for (const [k, e] of this.data) if (e.expires <= now) this.data.delete(k);
  }
}

export interface Kv {
  store: KvStore;
  /** True when the store is shared across instances (Redis); false for the in-process store. */
  shared: boolean;
}

let kv: Kv | null = null;
let local: MemoryKvStore | null = null;

export function getKv(): Kv {
  if (kv) return kv;
  const r = env().redis;
  kv = r ? { store: new UpstashKvStore(r, r.prefix), shared: true } : { store: localKv(), shared: false };
  return kv;
}

/** The process-local store, also used as the fallback when Redis is unavailable. */
export function localKv(): MemoryKvStore {
  local ??= new MemoryKvStore();
  return local;
}

/** For tests: replace the store. */
export function setKvForTests(next: Kv | null): void {
  kv = next;
  local = null;
}
