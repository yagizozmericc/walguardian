import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { readJsonBody } from "@/lib/request-guard";
import { resetSynthetic, seedSynthetic } from "@/modules/demo/demo.service";
import { memoryProviderInfo } from "@/modules/memory/memory.factory";
import { memoryForRequest, walletParam } from "@/modules/memory/memory.http";

const BodySchema = z.object({ address: z.string() });

/** Synthetic demo data: only with the development mock provider, never with Walrus. */
async function guard(req: Request) {
  if (memoryProviderInfo().provider !== "mock") throw new ValidationError("Synthetic demo data is only available with MEMORY_PROVIDER=mock.");
  const parsed = BodySchema.safeParse(await readJsonBody(req, 2048));
  if (!parsed.success) throw new ValidationError("A wallet address is required.");
  return { wallet: walletParam(parsed.data.address), service: (await memoryForRequest({ create: true }))! };
}

export async function POST(req: Request) {
  return handle("POST /api/demo/synthetic", async () => {
    const { wallet, service } = await guard(req);
    return seedSynthetic(service, wallet);
  });
}

export async function DELETE(req: Request) {
  return handle("DELETE /api/demo/synthetic", async () => {
    const { wallet, service } = await guard(req);
    return resetSynthetic(service, wallet);
  });
}
