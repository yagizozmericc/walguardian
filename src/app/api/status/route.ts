import { connection } from "next/server";
import { env } from "@/lib/env";
import { toApiError } from "@/lib/errors";
import { newRequestId } from "@/lib/http";
import type { IntegrationStatusItem, IntegrationStatusResponse } from "@/lib/status-types";

export async function GET() {
  await connection();
  const requestId = newRequestId();
  try {
    const e = env();
    const checkedAt = new Date().toISOString();

    const integrations: IntegrationStatusItem[] = [
      {
        id: "tatum",
        label: "Tatum",
        state: e.tatum.apiKey ? "configured" : "not_configured",
        detail: e.tatum.apiKey
          ? `Sui ${e.network} via gRPC ${e.tatum.grpcEndpoint}`
          : "TATUM_API_KEY is not set.",
        checkedAt,
      },
      {
        id: "walrus",
        label: "Walrus Memory",
        state: "not_configured",
        detail: "Memory integration is not implemented yet (Phase 6).",
        checkedAt,
      },
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
