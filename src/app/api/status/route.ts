import { connection } from "next/server";
import { env } from "@/lib/env";
import { AppError, toApiError } from "@/lib/errors";
import { newRequestId } from "@/lib/http";
import { getSuiProvider } from "@/modules/blockchain/sui.adapter";
import type { IntegrationStatusItem, IntegrationStatusResponse } from "@/lib/status-types";
import { getMemoryClient, memoryProviderInfo } from "@/modules/memory/memory.factory";
import { getLlm } from "@/modules/ai/agent.service";
import { DEMO_WALLET_LABEL, demoWalletAddress } from "@/lib/demo";
import { getKv } from "@/lib/kv";

let llmHealth: { at: number; item: IntegrationStatusItem } | null = null;
let walrusHealth: { at: number; item: IntegrationStatusItem } | null = null;

/** Model metadata check (no generation), cached for 10 minutes. */
async function llmStatus(): Promise<IntegrationStatusItem> {
  const base = { id: "llm" as const, label: "AI model", checkedAt: new Date().toISOString() };
  const llm = getLlm();
  if (!llm) return { ...base, state: "not_configured", detail: "GEMINI_API_KEY is not set; the copilot shows deterministic summaries." };
  if (llmHealth && Date.now() - llmHealth.at < 600_000) return llmHealth.item;
  const h = await llm.health();
  const item: IntegrationStatusItem = { ...base, state: h.ok ? "connected" : "error", detail: `Gemini ${llm.model} (free tier): ${h.detail}` };
  llmHealth = { at: Date.now(), item };
  return item;
}

async function memoryStatus(): Promise<IntegrationStatusItem> {
  const base = { id: "walrus" as const, label: "Walrus Memory", checkedAt: new Date().toISOString() };
  const info = memoryProviderInfo();
  if (info.provider === "disabled") return { ...base, state: "not_configured", detail: info.detail };
  if (info.provider === "mock") return { ...base, state: "mock", detail: `${info.label}: ${info.detail}` };
  if (walrusHealth && Date.now() - walrusHealth.at < 60_000) return walrusHealth.item;
  let item: IntegrationStatusItem;
  try {
    // /health is unauthenticated and does not exercise storage, so it can report ok while reads fail
    // (walrus-memory#1285). An authenticated listing is the honest signal; it reads metadata only.
    const client = getMemoryClient();
    const h = await client.health();
    const cfg = env().memory;
    const ns = `${cfg.provider === "disabled" ? "guardian" : cfg.namespacePrefix}-status`;
    await client.listMemories({ namespace: ns });
    // Recall depends on the relayer's embedding service, which can fail while listing works.
    await client.recall({ query: "status check", namespace: ns, limit: 1 });
    const writes = info.writes.enabled ? "writes enabled" : "read-only";
    item = { ...base, state: h.status === "ok" ? "connected" : "error", detail: `${info.label}: ${h.detail}; authenticated listing and recall ok; ${writes}.` };
  } catch (err) {
    item = { ...base, state: "error", detail: err instanceof AppError ? err.message : "Walrus Memory check failed." };
  }
  walrusHealth = { at: Date.now(), item };
  return item;
}

async function redisStatus(): Promise<IntegrationStatusItem> {
  const base = { id: "redis" as const, label: "Shared limits", checkedAt: new Date().toISOString() };
  const { store, shared } = getKv();
  if (!shared) return { ...base, state: "not_configured", detail: "Redis is not configured: rate limits and caches apply per server instance." };
  try {
    await store.ping();
    return { ...base, state: "connected", detail: `Upstash Redis (${env().deployment.environment} keys): shared rate limits, write quotas, Tatum budget and short-lived caches.` };
  } catch {
    return { ...base, state: "error", detail: "Redis is unreachable: reads use stricter per-instance limits; AI calls and memory writes are paused." };
  }
}

async function tatumStatus(): Promise<IntegrationStatusItem> {
  const e = env();
  const base = { id: "tatum" as const, label: "Tatum", checkedAt: new Date().toISOString() };
  if (!e.tatum.apiKey) return { ...base, state: "not_configured", detail: "TATUM_API_KEY is not set." };
  try {
    const chain = await getSuiProvider().assertNetwork();
    return {
      ...base,
      state: "connected",
      detail: `Sui ${chain.chain} via gRPC ${e.tatum.grpcEndpoint}; checkpoint ${chain.checkpointHeight}.`,
    };
  } catch (err) {
    return { ...base, state: "error", detail: err instanceof AppError ? err.message : "Connection check failed." };
  }
}

export async function GET() {
  await connection();
  const requestId = newRequestId();
  try {
    const e = env();
    const integrations: IntegrationStatusItem[] = [
      await tatumStatus(),
      await memoryStatus(),
      await llmStatus(),
      await redisStatus(),
    ];
    const body: IntegrationStatusResponse = {
      network: e.network,
      integrations,
      demo: { walletAddress: demoWalletAddress(), label: DEMO_WALLET_LABEL, syntheticDataAvailable: memoryProviderInfo().provider === "mock" },
      memoryWrites: memoryProviderInfo().writes,
    };
    return Response.json(body, { headers: { "x-request-id": requestId } });
  } catch (err) {
    const { status, body } = toApiError(err, requestId);
    return Response.json(body, { status, headers: { "x-request-id": requestId } });
  }
}
