import { connection } from "next/server";
import { env } from "@/lib/env";
import { AppError, toApiError } from "@/lib/errors";
import { newRequestId } from "@/lib/http";
import { getSuiProvider } from "@/modules/blockchain/sui.adapter";
import type { IntegrationStatusItem, IntegrationStatusResponse } from "@/lib/status-types";
import { getMemoryClient, memoryProviderInfo } from "@/modules/memory/memory.factory";
import { getLlm } from "@/modules/ai/agent.service";
import { DEMO_WALLET_LABEL, demoWalletAddress } from "@/lib/demo";

let llmHealth: { at: number; item: IntegrationStatusItem } | null = null;

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
  try {
    const h = await getMemoryClient().health();
    return { ...base, state: h.status === "ok" ? "connected" : "error", detail: `${info.label}: ${h.detail}` };
  } catch (err) {
    return { ...base, state: "error", detail: err instanceof AppError ? err.message : "Health check failed." };
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
    ];
    const body: IntegrationStatusResponse = {
      network: e.network,
      integrations,
      demo: { walletAddress: demoWalletAddress(), label: DEMO_WALLET_LABEL, syntheticDataAvailable: memoryProviderInfo().provider === "mock" },
    };
    return Response.json(body, { headers: { "x-request-id": requestId } });
  } catch (err) {
    const { status, body } = toApiError(err, requestId);
    return Response.json(body, { status, headers: { "x-request-id": requestId } });
  }
}
