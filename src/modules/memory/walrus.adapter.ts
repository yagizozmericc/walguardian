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

function mapError(err: unknown, op: string): ProviderError {
  const msg = err instanceof Error ? err.message : String(err);
  if (/\b401\b|unauthori[sz]ed|signature/i.test(msg)) return new ProviderError("walrus", "PROVIDER_UNAUTHORIZED", `Walrus Memory rejected the credentials during ${op}.`);
  if (/\b429\b|rate limit/i.test(msg)) return new ProviderError("walrus", "PROVIDER_RATE_LIMITED", `Walrus Memory rate limit reached during ${op}.`, true);
  if (/timeout|timed out|abort|ECONN|ENOTFOUND|certificate|fetch failed/i.test(msg)) {
    return new ProviderError("walrus", "PROVIDER_UNAVAILABLE", `Walrus Memory relayer unavailable during ${op}: ${msg.slice(0, 160)}`, true);
  }
  return new ProviderError("walrus", "PROVIDER_ERROR", `Walrus Memory ${op} failed: ${msg.slice(0, 160)}`);
}

export function createWalrusClient(cfg: { key: string; accountId: string; serverUrl: string }): MemoryClient {
  const sdk = MemWal.create({ key: cfg.key, accountId: cfg.accountId, serverUrl: cfg.serverUrl });
  const guard = async <T>(op: string, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      throw mapError(err, op);
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
      guard("recall", async () => {
        const r = await sdk.recall({ query: params.query, namespace: params.namespace, limit: params.limit, sort: params.sort });
        return { results: r.results.map((m) => ({ blob_id: m.blob_id, text: m.text, distance: m.distance, created_at: m.created_at })) };
      }),
    listMemories: (opts) =>
      guard("list", async () => {
        const r = await sdk.listMemories({ namespace: opts.namespace, cursor: opts.cursor });
        return {
          memories: r.memories.map((m) => ({ blob_id: m.blob_id, namespace_id: m.namespace_id, created_at: m.created_at, expires_at: m.expires_at, status: m.status })),
          next_cursor: r.next_cursor,
          has_more: r.has_more,
        };
      }),
    health: () =>
      guard("health", async () => {
        const h = await sdk.health();
        return { status: h.status, detail: `relayer ${h.relayerVersion ?? h.version}${h.write_ready === false ? " (writes not ready)" : ""}` };
      }),
  };
}
