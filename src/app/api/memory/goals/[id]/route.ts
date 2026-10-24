import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import { ValidationError } from "@/lib/errors";
import { memoryForRequest, walletParam } from "@/modules/memory/memory.http";
import { deleteGoal } from "@/modules/memory/memory.repositories";

export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/memory/goals/[id]">) {
  return handle("DELETE /api/memory/goals/[id]", async () => {
    const { id } = await ctx.params;
    if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) throw new ValidationError("Invalid goal id.");
    const wallet = walletParam(req.nextUrl.searchParams.get("address"));
    const service = await memoryForRequest({ create: false });
    if (!service) throw new ValidationError("No memory session.");
    const record = await deleteGoal(service, wallet, id);
    // Walrus has no delete: a tombstone hides the goal; earlier records remain until they expire.
    return { deleted: true, memory: { id: record.id, blobId: record.blobId } };
  });
}
