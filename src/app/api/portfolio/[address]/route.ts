import type { NextRequest } from "next/server";
import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { SuiAddressSchema } from "@/lib/sui-address";
import { getSuiProvider, MAX_TX_PAGE } from "@/modules/blockchain/sui.adapter";
import { getPortfolioSnapshot } from "@/modules/portfolio/portfolio.service";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_TX_PAGE).default(50),
  cursor: z.string().max(2048).optional(),
});

export async function GET(req: NextRequest, ctx: RouteContext<"/api/portfolio/[address]">) {
  return handle("GET /api/portfolio/[address]", async () => {
    const { address: rawAddress } = await ctx.params;
    const address = SuiAddressSchema.safeParse(rawAddress);
    if (!address.success) throw new ValidationError(address.error.issues[0]?.message ?? "Invalid address.");

    const query = QuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!query.success) throw new ValidationError("Invalid query parameters.", { issues: query.error.issues });

    return getPortfolioSnapshot(getSuiProvider(), address.data, {
      activityLimit: query.data.limit,
      cursor: query.data.cursor,
    });
  });
}
