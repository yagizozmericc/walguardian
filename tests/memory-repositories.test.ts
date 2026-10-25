import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/errors";
import { MemoryService } from "@/modules/memory/memory.service";
import { MockMemoryClient } from "@/modules/memory/mock.adapter";
import {
  deleteGoal,
  listDecisions,
  listFeedback,
  listGoals,
  loadStrategy,
  saveDecision,
  saveFeedback,
  saveGoal,
  saveStrategy,
} from "@/modules/memory/memory.repositories";
import { goal } from "./fixtures/savings.fixture";
import { settings } from "./fixtures/strategy.fixture";

const P = "33333333-3333-4333-8333-333333333333";
const WALLET = `0x${"aa".repeat(32)}`;
let dir: string;
let file: string;
let t = 0;
const now = () => new Date(Date.UTC(2026, 9, 24, 10, 0, t++));
const svc = () => new MemoryService(new MockMemoryClient(file, 28, now), { namespacePrefix: "guardian-test", network: "testnet" }, P, now);

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "guardian-repo-"));
  file = path.join(dir, "m.json");
});
afterEach(async () => rm(dir, { recursive: true, force: true }));

describe("savings state restoration", () => {
  it("restores goals, earmarks and contribution history exactly after a restart", async () => {
    const g = goal({ id: "g1", allocations: [{ id: "a1", date: "2026-01-01", delta: "300" }, { id: "a2", date: "2026-02-01", delta: "150", note: "Bonus" }] });
    await saveGoal(svc(), WALLET, g);
    const restored = await listGoals(svc(), WALLET);
    expect(restored.items).toHaveLength(1);
    const { memory, ...rest } = restored.items[0];
    expect(rest).toEqual(g);
    expect(memory.blobId).toMatch(/^mock-blob/);
  });

  it("an update supersedes the previous version; deletion hides the goal", async () => {
    await saveGoal(svc(), WALLET, goal({ id: "g1", name: "v1" }));
    await saveGoal(svc(), WALLET, goal({ id: "g1", name: "v2" }));
    expect((await listGoals(svc(), WALLET)).items.map((x) => x.name)).toEqual(["v2"]);
    await deleteGoal(svc(), WALLET, "g1");
    expect((await listGoals(svc(), WALLET)).items).toEqual([]);
    await expect(deleteGoal(svc(), WALLET, "missing")).rejects.toBeInstanceOf(ValidationError);
  });

  it("goals are scoped to the wallet they were created for", async () => {
    await saveGoal(svc(), WALLET, goal({ id: "g1" }));
    expect((await listGoals(svc(), `0x${"bb".repeat(32)}`)).items).toEqual([]);
  });

  it("counts records with invalid payloads instead of silently dropping them", async () => {
    const s = svc();
    await s.write({ kind: "goal", category: "goal", source: "user", entityId: "goal:bad", wallet: WALLET, summary: "corrupt", data: { not: "a goal" } });
    const r = await listGoals(svc(), WALLET);
    expect(r.items).toEqual([]);
    expect(r.unreadable).toBe(1);
  });
});

describe("investment state restoration", () => {
  it("restores preferences, reference prices, targets and constraints", async () => {
    const st = settings({ referencePrices: [{ coinType: "0x2::sui::SUI", priceUsd: "1.5", setOn: "2026-10-24" }], gasReserveSui: "10", minStablecoinReserveUsd: "250", riskTolerance: "balanced" });
    await saveStrategy(svc(), WALLET, st);
    expect((await loadStrategy(svc(), WALLET)).settings).toEqual(st);
    await saveStrategy(svc(), WALLET, { ...st, targets: null });
    expect((await loadStrategy(svc(), WALLET)).settings?.targets).toBeNull();
  });

  it("records investment decisions newest first", async () => {
    await saveDecision(svc(), WALLET, { decision: "rejected", reason: "keep gas", scenario: "reduce SUI; increase stablecoins", targets: null });
    await saveDecision(svc(), WALLET, { decision: "accepted", reason: null, scenario: "reduce SUI; increase stablecoins", targets: null });
    expect((await listDecisions(svc(), WALLET)).items.map((d) => d.decision)).toEqual(["accepted", "rejected"]);
  });
});

describe("Protect feedback persistence", () => {
  const fb = { digest: "FiXtUReDigest1111111111111111111", verdict: "expected" as const, note: "cold wallet", recipients: [WALLET], packages: [], transactionTimeMs: 1, score: 17, critical: false };
  it("persists reviews and keeps only the latest verdict per transaction", async () => {
    await saveFeedback(svc(), WALLET, fb);
    await saveFeedback(svc(), WALLET, { ...fb, verdict: "suspicious", note: "changed my mind" });
    const r = await listFeedback(svc(), WALLET);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ verdict: "suspicious", note: "changed my mind", score: 17 });
  });
});
