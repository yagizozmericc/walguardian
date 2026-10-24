import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetSynthetic, seedSynthetic } from "@/modules/demo/demo.service";
import { MemoryService } from "@/modules/memory/memory.service";
import { MockMemoryClient } from "@/modules/memory/mock.adapter";
import { isSynthetic, listGoals, loadStrategy, saveGoal, saveStrategy } from "@/modules/memory/memory.repositories";
import { goal } from "./fixtures/savings.fixture";
import { settings } from "./fixtures/strategy.fixture";

const P = "44444444-4444-4444-8444-444444444444";
const W = `0x${"cd".repeat(32)}`;
let dir: string;
let file: string;
let t = 0;
const now = () => new Date(Date.UTC(2026, 9, 25, 9, 0, t++));
const svc = () => new MemoryService(new MockMemoryClient(file, 28, now), { namespacePrefix: "guardian-test", network: "testnet" }, P, now);

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "guardian-demo-"));
  file = path.join(dir, "m.json");
});
afterEach(async () => rm(dir, { recursive: true, force: true }));

describe("synthetic demo data", () => {
  it("seeds labelled goals, preferences and a note", async () => {
    const r = await seedSynthetic(svc(), W, now());
    expect(r.created).toHaveLength(4);
    const goals = (await listGoals(svc(), W)).items;
    expect(goals.map((g) => g.name).sort()).toEqual(["Emergency reserve (synthetic)", "Validator stake fund (synthetic)"]);
    expect(goals.every((g) => g.notes?.includes("Synthetic demo data"))).toBe(true);
    const strategy = await loadStrategy(svc(), W);
    expect(strategy.settings?.referencePrices.map((p) => p.priceUsd)).toEqual(["1.5", "1"]);
    expect(isSynthetic(strategy.memory!)).toBe(true);
    const history = await svc().history();
    expect(history.every((h) => h.record && isSynthetic(h.record))).toBe(true);
  });

  it("is idempotent: running twice creates no duplicates", async () => {
    await seedSynthetic(svc(), W, now());
    const second = await seedSynthetic(svc(), W, now());
    expect(second.created).toEqual([]);
    expect(second.skipped).toHaveLength(4);
    expect((await svc().history()).length).toBe(4);
  });

  it("never overwrites the user's own preferences", async () => {
    const mine = settings({ targets: { native: "80", stablecoin: "20", other: "0" } });
    await saveStrategy(svc(), W, mine);
    const r = await seedSynthetic(svc(), W, now());
    expect(r.skipped).toContain("investment preferences (your own settings are kept)");
    expect((await loadStrategy(svc(), W)).settings?.targets?.native).toBe("80");
    await resetSynthetic(svc(), W);
    expect((await loadStrategy(svc(), W)).settings?.targets?.native).toBe("80");
  });

  it("reset hides only synthetic records and leaves unrelated ones untouched", async () => {
    await saveGoal(svc(), W, goal({ id: "user-goal", name: "My real goal" }));
    await seedSynthetic(svc(), W, now());
    const r = await resetSynthetic(svc(), W);
    expect(r.created).toHaveLength(4);
    expect((await listGoals(svc(), W)).items.map((g) => g.name)).toEqual(["My real goal"]);
    expect((await loadStrategy(svc(), W)).settings).toBeNull();
    // Can be seeded again after a reset.
    expect((await seedSynthetic(svc(), W, now())).created).toHaveLength(4);
  });
});
