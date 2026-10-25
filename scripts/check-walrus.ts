/**
 * Memory provider check. Read-only by default.
 *
 *   npm run check:walrus                       # config, relayer network, health, authenticated listing (no writes)
 *   npm run check:walrus -- --recall-probe     # also one recall (read-only; exercises the relayer's embedding service)
 *   CONFIRM_WALRUS_TEST_WRITE=yes npm run check:walrus -- --write-test
 *                                              # one synthetic record: write, wait, recall
 *
 * Uses MEMORY_PROVIDER from .env/.env.local. With the Walrus provider, the
 * write is a real relayer write: run it only with the project owner's approval.
 * It goes through the same write guard as the app, so it also needs
 * MEMORY_WRITES_ENABLED=true and Redis (KV_REST_API_URL/TOKEN) for quotas.
 */
import { existsSync } from "node:fs";
import { AppError } from "@/lib/errors";
import { parseEnv } from "@/lib/env";
import { getMemoryClient, getMemoryService, memoryProviderInfo } from "@/modules/memory/memory.factory";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

async function main() {
  const cfg = parseEnv(process.env).memory;
  const info = memoryProviderInfo();
  console.log(`provider: ${info.provider} — ${info.label}\n  ${info.detail}`);
  console.log(`writes: ${info.writes.enabled ? "enabled" : "disabled (read-only)"}${info.writes.structuredOnly ? ", structured-only" : ""}`);
  if (cfg.provider === "disabled") return;

  if (cfg.provider === "walrus") {
    // Unauthenticated, read-only: the relayer's own view of its network must match the configuration.
    const remote = (await (await fetch(`${cfg.serverUrl}/config`, { signal: AbortSignal.timeout(10_000) })).json()) as { network?: string };
    console.log(`relayer network: ${remote.network ?? "unknown"} (configured: ${cfg.network})`);
    if (cfg.network !== "unknown" && remote.network !== cfg.network) throw new Error("The relayer reports a different network than configured. Stopping.");
  }

  const client = getMemoryClient();
  // health() does not check credentials (per the Walrus Memory docs); the listing below does.
  console.log("health:", await client.health());

  const principal = "00000000-0000-4000-8000-00000000c4ec"; // fixed check principal; never a real user
  const service = getMemoryService(principal);
  const listed = await client.listMemories({ namespace: service.namespace("reasoning") });
  console.log(`credentials accepted: check namespace holds ${listed.memories.length} record(s)`);
  for (const m of listed.memories.slice(0, 5)) console.log(`  ${m.blob_id.slice(0, 12)}… created ${m.created_at}, expires ${m.expires_at ?? "unknown"} (${m.status})`);

  if (process.argv.includes("--recall-probe")) {
    // Read-only, but exercises the relayer's embedding service (the part affected by walrus-memory#1285/#1286).
    const started = Date.now();
    try {
      const r = await client.recall({ query: "guardian connectivity check", namespace: service.namespace("reasoning"), limit: 1 });
      console.log(`recall probe: ok (${r.results.length} result(s), ${Date.now() - started} ms)`);
    } catch (err) {
      console.log(`recall probe: FAILED after ${Date.now() - started} ms: ${err instanceof AppError ? `${err.code}: ${err.message}` : String(err)}`);
      process.exitCode = 1;
    }
  }

  if (!process.argv.includes("--write-test")) {
    console.log("read-only check complete (pass --write-test to write one synthetic record)");
    return;
  }
  if (process.env.CONFIRM_WALRUS_TEST_WRITE !== "yes") {
    throw new Error("Refusing to write: set CONFIRM_WALRUS_TEST_WRITE=yes to confirm one synthetic test write.");
  }
  const written = await service.write({
    kind: "connectivity_check",
    category: "reasoning",
    source: "system",
    entityId: "check:connectivity",
    wallet: null,
    summary: "Synthetic connectivity check record written by Guardian's check script.",
    data: { synthetic: true, at: new Date().toISOString() },
  });
  console.log("written:", { id: written.id, blobId: written.blobId, provider: written.provider });
  const { records } = await service.list("reasoning");
  console.log("recalled:", records.some((r) => r.id === written.id) ? "yes" : "NOT FOUND", `(${records.length} in namespace)`);
}

main()
  .catch((err) => {
    console.error(err instanceof AppError ? `${err.code}: ${err.message}` : err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
