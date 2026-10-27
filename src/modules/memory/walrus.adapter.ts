import "server-only";
import { MemWal } from "@mysten-incubation/memwal";
import { ProviderError } from "@/lib/errors";
import type { MemoryClient } from "./memory.client";

/**
 * Real Walrus Memory client via the official SDK (relayer mode). Only built
 * when MEMORY_PROVIDER=walrus and env validation has accepted the relayer URL
 * (Testnet, or Mainnet with explicit approval). Never falls back to the mock.
 */

const REMEMBER_TIMEOUT_MS = 120_000;
/** The SDK's own read timeouts are 15-30 s; memory is optional context, so reads give up sooner. */
const READ_TIMEOUT_MS = 8_000;
/** After repeated relayer failures, reads fail fast for this long instead of each paying the timeout. */
const BREAKER_COOLDOWN_MS = 30_000;
/** Consecutive failures that open the breaker; one latency spike should not disable memory for everyone. */
const BREAKER_THRESHOLD = 2;

export function mapError(err: unknown, op: string): ProviderError {
  const msg = err instanceof Error ? err.message : String(err);
  // The relayer's own embedding provider can fail (including with a 401 from its shared credential;
  // walrus-memory#1285/#1286). That is a relayer-side outage, not a problem with our credentials.
  if (/embedding|embed api|upstream inference/i.test(msg)) {
    return new ProviderError("walrus", "PROVIDER_UNAVAILABLE", `The Walrus Memory relayer's embedding service is failing during ${op}; this is on the relayer side. Try again later.`, true);
  }
  if (/\b401\b|unauthori[sz]ed|signature/i.test(msg)) return new ProviderError("walrus", "PROVIDER_UNAUTHORIZED", `Walrus Memory rejected the credentials during ${op}.`);
  if (/\b429\b|rate limit/i.test(msg)) return new ProviderError("walrus", "PROVIDER_RATE_LIMITED", `Walrus Memory rate limit reached during ${op}.`, true);
  if (/timeout|timed out|abort|ECONN|ENOTFOUND|certificate|fetch failed/i.test(msg)) {
    return new ProviderError("walrus", "PROVIDER_UNAVAILABLE", `Walrus Memory relayer unavailable during ${op}: ${msg.slice(0, 160)}`, true);
  }
  if (/\b50[0-4]\b|server error|internal error/i.test(msg)) {
    return new ProviderError("walrus", "PROVIDER_UNAVAILABLE", `The Walrus Memory relayer returned a server error during ${op}. Try again later.`, true);
  }
  return new ProviderError("walrus", "PROVIDER_ERROR", `Walrus Memory ${op} failed: ${msg.slice(0, 160)}`);
}

type Sdk = Pick<MemWal, "rememberAndWait" | "recall" | "listMemories" | "health">;

export interface WalrusClientOptions {
  sdk?: Sdk;
  readTimeoutMs?: number;
  cooldownMs?: number;
  threshold?: number;
  now?: () => number;
}

export function createWalrusClient(cfg: { key: string; accountId: string; serverUrl: string }, opts: WalrusClientOptions = {}): MemoryClient {
  const sdk: Sdk = opts.sdk ?? MemWal.create({ key: cfg.key, accountId: cfg.accountId, serverUrl: cfg.serverUrl });
  const readTimeoutMs = opts.readTimeoutMs ?? READ_TIMEOUT_MS;
  const cooldownMs = opts.cooldownMs ?? BREAKER_COOLDOWN_MS;
  const now = opts.now ?? Date.now;
  // Per-instance circuit breakers, one per read operation: listing can stay healthy while recall
  // (which depends on the relayer's embedding service) fails, so a list success must not mask
  // recall failures (walrus-memory#1285). An outage costs one timeout, not one per request.
  const breakers = new Map<string, { openUntil: number; failures: number }>();

  const guard = async <T>(op: string, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      throw mapError(err, op);
    }
  };

  const read = async <T>(op: string, fn: () => Promise<T>): Promise<T> => {
    let b = breakers.get(op);
    if (!b) breakers.set(op, (b = { openUntil: 0, failures: 0 }));
    if (now() < b.openUntil) {
      throw new ProviderError("walrus", "PROVIDER_UNAVAILABLE", `Walrus Memory ${op} is temporarily unavailable after recent relayer failures; retrying in ${Math.ceil((b.openUntil - now()) / 1000)}s.`, true);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ProviderError("walrus", "PROVIDER_UNAVAILABLE", `Walrus Memory did not answer the ${op} within ${readTimeoutMs / 1000}s.`, true)), readTimeoutMs);
    });
    try {
      const value = await Promise.race([guard(op, fn), timeout]);
      b.failures = 0;
      b.openUntil = 0;
      return value;
    } catch (err) {
      // Outages and rate limits count toward the breaker; credential or validation errors do not.
      if (err instanceof ProviderError && err.retryable && ++b.failures >= (opts.threshold ?? BREAKER_THRESHOLD)) b.openUntil = now() + cooldownMs;
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };
  return {
    kind: "walrus",
    rememberAndWait: (text, namespace, opts) =>
      guard("remember", async () => {
        const r = await sdk.rememberAndWait(text, namespace, { idempotencyKey: opts.idempotencyKey, timeoutMs: REMEMBER_TIMEOUT_MS });
        // Persistence is confirmed only when the job reached "done" and returned a blob id.
        if (!r.blob_id) throw new Error("remember job finished without a blob id");
        return { blob_id: r.blob_id, namespace: r.namespace };
      }),
    recall: (params) =>
      read("recall", async () => {
        const r = await sdk.recall({ query: params.query, namespace: params.namespace, limit: params.limit, sort: params.sort });
        return { results: r.results.map((m) => ({ blob_id: m.blob_id, text: m.text, distance: m.distance, created_at: m.created_at })) };
      }),
    listMemories: (o) =>
      read("list", async () => {
        const r = await sdk.listMemories({ namespace: o.namespace, cursor: o.cursor });
        return {
          memories: r.memories.map((m) => ({ blob_id: m.blob_id, namespace_id: m.namespace_id, created_at: m.created_at, expires_at: m.expires_at, status: m.status })),
          next_cursor: r.next_cursor,
          has_more: r.has_more,
        };
      }),
    health: () =>
      read("health", async () => {
        const h = await sdk.health();
        return { status: h.status, detail: `relayer ${h.relayerVersion ?? h.version}${h.write_ready === false ? " (writes not ready)" : ""}` };
      }),
  };
}
