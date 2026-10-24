import { ValidationError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { enforceRateLimit } from "@/lib/request-guard";
import { SuiAddressSchema } from "@/lib/sui-address";
import { assessTransferRequest } from "@/modules/assessment/transfer.service";
import { TransferRequestSchema } from "@/modules/assessment/transfer.types";
import { getSuiProvider } from "@/modules/blockchain/sui.adapter";
import { memoryProviderInfo } from "@/modules/memory/memory.factory";
import { memoryForRequest, readJson } from "@/modules/memory/memory.http";

/** Simulated transfer assessment. Nothing is built, signed or sent. */
export async function POST(req: Request) {
  return handle("POST /api/assessments/transfer", async () => {
    await enforceRateLimit("tatum");
    const parsed = TransferRequestSchema.safeParse(await readJson(req, 8 * 1024));
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid request.");
    const wallet = SuiAddressSchema.safeParse(parsed.data.address);
    if (!wallet.success) throw new ValidationError("A valid wallet address is required.");
    const memory = memoryProviderInfo().provider === "disabled" ? null : await memoryForRequest({ create: false });
    return assessTransferRequest(getSuiProvider(), wallet.data, parsed.data, memory);
  });
}
