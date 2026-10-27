import { ValidationError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { enforceRateLimit } from "@/lib/request-guard";
import { TransferRequestSchema } from "@/modules/assessment/transfer.types";
import { getSuiProvider } from "@/modules/blockchain/sui.adapter";
import { getSuiSdkClient } from "@/modules/blockchain/sui.sdk";
import { prepareTransfer } from "@/modules/execution/execution.service";
import { memoryProviderInfo } from "@/modules/memory/memory.factory";
import { memoryForRequest, readJson, walletParam } from "@/modules/memory/memory.http";

/** Assesses, builds and simulates a transfer through Tatum. Nothing is signed or sent. */
export async function POST(req: Request) {
  return handle("POST /api/transactions/transfer/prepare", async () => {
    await enforceRateLimit("tatum");
    const parsed = TransferRequestSchema.safeParse(await readJson(req, 8 * 1024));
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid request.");
    const wallet = walletParam(parsed.data.address);
    const memory = memoryProviderInfo().provider === "disabled" ? null : await memoryForRequest({ create: false });
    return prepareTransfer(getSuiProvider(), getSuiSdkClient(), wallet, parsed.data, memory);
  });
}
