import { ValidationError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { enforceRateLimit } from "@/lib/request-guard";
import { SuiAddressSchema } from "@/lib/sui-address";
import { explainWithContext } from "@/modules/ai/agent.service";
import { TRANSFER_EXPLAIN_SYSTEM, transferContext } from "@/modules/assessment/explain";
import { assessTransferRequest } from "@/modules/assessment/transfer.service";
import { TransferRequestSchema } from "@/modules/assessment/transfer.types";
import { getSuiProvider } from "@/modules/blockchain/sui.adapter";
import { memoryProviderInfo } from "@/modules/memory/memory.factory";
import { memoryForRequest, readJson } from "@/modules/memory/memory.http";

/** Grounded AI explanation of a simulated transfer. The assessment is recomputed here, never taken from the client. */
export async function POST(req: Request) {
  return handle("POST /api/assessments/transfer/explain", async () => {
    await enforceRateLimit("tatum");
    const parsed = TransferRequestSchema.safeParse(await readJson(req, 8 * 1024));
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid request.");
    const wallet = SuiAddressSchema.safeParse(parsed.data.address);
    if (!wallet.success) throw new ValidationError("A valid wallet address is required.");
    const memory = memoryProviderInfo().provider === "disabled" ? null : await memoryForRequest({ create: false });
    const assessment = await assessTransferRequest(getSuiProvider(), wallet.data, parsed.data, memory);
    return explainWithContext({
      ctx: transferContext(assessment),
      question: "Explain this simulated transfer assessment: what are the confirmed facts, historical patterns, my own preferences or past decisions, and the unknowns? What should I check before sending?",
      history: [],
      extraSystem: TRANSFER_EXPLAIN_SYSTEM,
    });
  });
}
