/**
 * Memory provider check. Read-only by default.
 *
 *   npm run check:walrus                       # config + health + list (no writes)
 *   CONFIRM_WALRUS_TEST_WRITE=yes npm run check:walrus -- --write-test
 *                                              # one synthetic record: write, wait, recall
 *
 * Uses MEMORY_PROVIDER from .env/.env.local. With the Walrus provider, the
 * write is a real relayer write: run it only with the project owner's approval.
 */
import { existsSync } from "node:fs";
import { AppError } from "@/lib/errors";
import { parseEnv } from "@/lib/env";
import { getMemoryClient, memoryProviderInfo } from "@/modules/memory/memory.factory";
import { MemoryService } from "@/modules/memory/memory.service";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

async function main() {
  const cfg = parseEnv(process.env).memory;
  const info = memoryProviderInfo();
  console.log(`provider: ${info.provider} — ${info.label}\n  ${info.detail}`);
  if (cfg.provider === "disabled") return;

  const client = getMemoryClient();
  console.log("health:", await client.health());

  const principal = "00000000-0000-4000-8000-00000000c4ec"; // fixed check principal; never a real user
  const service = new MemoryService(client, { namespacePrefix: cfg.namespacePrefix, network: "testnet" }, principal);
  const listed = await client.listMemories({ namespace: service.namespace("reasoning") });
  console.log(`check namespace holds ${listed.memories.length} record(s)`);

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
