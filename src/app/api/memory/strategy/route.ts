import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { memoryProviderInfo } from "@/modules/memory/memory.factory";
import { memoryForRequest, readJson, walletParam } from "@/modules/memory/memory.http";
import { loadStrategy, saveStrategy } from "@/modules/memory/memory.repositories";
import { StrategySettingsSchema } from "@/modules/strategy/strategy.types";

export async function GET(req: NextRequest) {
  await connection();
  return handle("GET /api/memory/strategy", async () => {
    const wallet = walletParam(req.nextUrl.searchParams.get("address"));
    const provider = memoryProviderInfo();
    if (provider.provider === "disabled") return { provider, session: false, settings: null, memory: null };
    const service = await memoryForRequest({ create: false });
    if (!service) return { provider, session: false, settings: null, memory: null };
    const { settings, memory } = await loadStrategy(service, wallet);
    return { provider, session: true, settings, memory: memory && { id: memory.id, createdAt: memory.createdAt, expiresAt: memory.expiresAt } };
  });
}

const PutSchema = z.object({ address: z.string(), settings: StrategySettingsSchema });

export async function PUT(req: Request) {
  return handle("PUT /api/memory/strategy", async () => {
    const parsed = PutSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid settings.");
    const wallet = walletParam(parsed.data.address);
    const service = (await memoryForRequest({ create: true }))!;
    const record = await saveStrategy(service, wallet, { ...parsed.data.settings, updatedAt: new Date().toISOString() });
    return { saved: true, memory: { id: record.id, blobId: record.blobId, provider: record.provider } };
  });
}
