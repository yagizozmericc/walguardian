import { connection } from "next/server";
import { env } from "@/lib/env";
import { AppError, toApiError } from "@/lib/errors";
import { newRequestId } from "@/lib/http";
import { getSuiProvider } from "@/modules/blockchain/sui.adapter";
import type { IntegrationStatusItem, IntegrationStatusResponse } from "@/lib/status-types";
import { getMemoryClient, memoryProviderInfo } from "@/modules/memory/memory.factory";

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
    const checkedAt = new Date().toISOString();
    const integrations: IntegrationStatusItem[] = [
      await tatumStatus(),
      await memoryStatus(),
      {
        id: "llm",
        label: "AI model",
        state: "not_configured",
        detail: "Copilot integration is not implemented yet (Phase 7).",
        checkedAt,
      },
    ];
    const body: IntegrationStatusResponse = { network: e.network, integrations };
    return Response.json(body, { headers: { "x-request-id": requestId } });
  } catch (err) {
    const { status, body } = toApiError(err, requestId);
    return Response.json(body, { status, headers: { "x-request-id": requestId } });
  }
}
