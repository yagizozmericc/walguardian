import { ValidationError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { enforceRateLimit, readJsonBody } from "@/lib/request-guard";
import { SuiAddressSchema } from "@/lib/sui-address";
import { getSuiProvider } from "@/modules/blockchain/sui.adapter";
import { evaluateSavings } from "@/modules/savings/savings.service";
import { EvaluateRequestSchema } from "@/modules/savings/savings.types";

const MAX_BODY_BYTES = 256 * 1024;

export async function POST(req: Request) {
  return handle("POST /api/savings/evaluate", async () => {
    await enforceRateLimit("tatum");
    const json = await readJsonBody(req, MAX_BODY_BYTES);
    const parsed = EvaluateRequestSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new ValidationError(`${first?.path.join(".") || "body"}: ${first?.message ?? "invalid"}`, { issues: parsed.error.issues });
    }
    const address = SuiAddressSchema.safeParse(parsed.data.address);
    if (!address.success) throw new ValidationError(address.error.issues[0]?.message ?? "Invalid address.");
    return evaluateSavings(getSuiProvider(), address.data, parsed.data.goals);
  });
}
