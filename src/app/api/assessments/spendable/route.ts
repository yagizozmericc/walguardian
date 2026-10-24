import { ValidationError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { enforceRateLimit } from "@/lib/request-guard";
import { SuiAddressSchema } from "@/lib/sui-address";
import { spendableFor } from "@/modules/assessment/transfer.service";
import { SpendableRequestSchema } from "@/modules/assessment/transfer.types";
import { getSuiProvider } from "@/modules/blockchain/sui.adapter";
import { memoryProviderInfo } from "@/modules/memory/memory.factory";
import { memoryForRequest, readJson } from "@/modules/memory/memory.http";

/** Conservative estimated available amount (balance minus earmarks, reserves and a gas buffer). */
export async function POST(req: Request) {
  return handle("POST /api/assessments/spendable", async () => {
    await enforceRateLimit("tatum");
    const parsed = SpendableRequestSchema.safeParse(await readJson(req, 4 * 1024));
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid request.");
    const wallet = SuiAddressSchema.safeParse(parsed.data.address);
    if (!wallet.success) throw new ValidationError("A valid wallet address is required.");
    const memory = memoryProviderInfo().provider === "disabled" ? null : await memoryForRequest({ create: false });
    return spendableFor(getSuiProvider(), wallet.data, parsed.data.coinType, memory);
  });
}
