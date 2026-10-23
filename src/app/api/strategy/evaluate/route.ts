import { ValidationError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { SuiAddressSchema } from "@/lib/sui-address";
import { getSuiProvider } from "@/modules/blockchain/sui.adapter";
import { evaluateStrategy } from "@/modules/strategy/strategy.service";
import { StrategyRequestSchema } from "@/modules/strategy/strategy.types";

const MAX_BODY_BYTES = 128 * 1024;

export async function POST(req: Request) {
  return handle("POST /api/strategy/evaluate", async () => {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) throw new ValidationError("Request body too large.");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ValidationError("Request body must be JSON.");
    }
    const parsed = StrategyRequestSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new ValidationError(`${first?.path.join(".") || "body"}: ${first?.message ?? "invalid"}`, { issues: parsed.error.issues });
    }
    const address = SuiAddressSchema.safeParse(parsed.data.address);
    if (!address.success) throw new ValidationError(address.error.issues[0]?.message ?? "Invalid address.");
    return evaluateStrategy(getSuiProvider(), address.data, parsed.data.settings, parsed.data.earmarks);
  });
}
