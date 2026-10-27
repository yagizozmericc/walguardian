import { ValidationError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { enforceRateLimit } from "@/lib/request-guard";
import { getSuiProvider } from "@/modules/blockchain/sui.adapter";
import { getSuiSdkClient } from "@/modules/blockchain/sui.sdk";
import { executeSigned } from "@/modules/execution/execution.service";
import { ExecuteRequestSchema } from "@/modules/execution/execution.types";
import { readJson, walletParam } from "@/modules/memory/memory.http";

/** Broadcasts a wallet-signed transaction through Tatum, only if Guardian prepared and assessed it. */
export async function POST(req: Request) {
  return handle("POST /api/transactions/execute", async () => {
    await enforceRateLimit("tatum");
    const parsed = ExecuteRequestSchema.safeParse(await readJson(req, 96 * 1024));
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid request.");
    return executeSigned(getSuiProvider(), getSuiSdkClient(), walletParam(parsed.data.address), parsed.data);
  });
}
