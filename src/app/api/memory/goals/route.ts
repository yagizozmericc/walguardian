import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { memoryProviderInfo } from "@/modules/memory/memory.factory";
import { memoryForRequest, readJson, walletParam } from "@/modules/memory/memory.http";
import { listGoals, saveGoal } from "@/modules/memory/memory.repositories";
import { validateGoalAmounts } from "@/modules/savings/savings.engine";
import { SavingsGoalSchema } from "@/modules/savings/savings.types";

export async function GET(req: NextRequest) {
  await connection();
  return handle("GET /api/memory/goals", async () => {
    const wallet = walletParam(req.nextUrl.searchParams.get("address"));
    const provider = memoryProviderInfo();
    if (provider.provider === "disabled") return { provider, session: false, items: [], expired: 0, unreadable: 0, truncated: false };
    const service = await memoryForRequest({ create: false });
    if (!service) return { provider, session: false, items: [], expired: 0, unreadable: 0, truncated: false };
    return { provider, session: true, ...(await listGoals(service, wallet)) };
  });
}

const PutSchema = z.object({ address: z.string(), goal: SavingsGoalSchema });

export async function PUT(req: Request) {
  return handle("PUT /api/memory/goals", async () => {
    const parsed = PutSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid goal.");
    const wallet = walletParam(parsed.data.address);
    const problems = validateGoalAmounts(parsed.data.goal);
    if (problems.length) throw new ValidationError(problems.join(" "));
    const service = (await memoryForRequest({ create: true }))!;
    const record = await saveGoal(service, wallet, parsed.data.goal);
    return { saved: true, memory: { id: record.id, blobId: record.blobId, provider: record.provider, createdAt: record.createdAt } };
  });
}
