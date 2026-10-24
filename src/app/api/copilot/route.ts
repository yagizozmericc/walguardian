import { ValidationError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { enforceRateLimit } from "@/lib/request-guard";
import { SuiAddressSchema } from "@/lib/sui-address";
import { answerQuestion } from "@/modules/ai/agent.service";
import { CopilotRequestSchema } from "@/modules/ai/ai.types";
import { memoryProviderInfo } from "@/modules/memory/memory.factory";
import { memoryForRequest, readJson } from "@/modules/memory/memory.http";

export async function POST(req: Request) {
  return handle("POST /api/copilot", async () => {
    await enforceRateLimit("tatum");
    const parsed = CopilotRequestSchema.safeParse(await readJson(req, 32 * 1024));
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid request.");
    const address = SuiAddressSchema.safeParse(parsed.data.address);
    if (!address.success) throw new ValidationError("A valid Sui address is required.");
    const memory = memoryProviderInfo().provider === "disabled" ? null : await memoryForRequest({ create: false });
    return answerQuestion({ address: address.data, question: parsed.data.question, history: parsed.data.history, memory });
  });
}
