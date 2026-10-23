import type { NextRequest } from "next/server";
import { ValidationError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { SuiAddressSchema } from "@/lib/sui-address";
import { getSuiProvider } from "@/modules/blockchain/sui.adapter";
import { getSecurityReport } from "@/modules/security/security.service";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/security/[address]">) {
  return handle("GET /api/security/[address]", async () => {
    const { address: raw } = await ctx.params;
    const address = SuiAddressSchema.safeParse(raw);
    if (!address.success) throw new ValidationError(address.error.issues[0]?.message ?? "Invalid address.");
    const fresh = req.nextUrl.searchParams.get("fresh") === "1";
    return getSecurityReport(getSuiProvider(), address.data, { fresh });
  });
}
