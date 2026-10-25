import { describe, expect, it } from "vitest";
import type { MemoryWriteConfig } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { MemoryKvStore, type Kv, type KvStore } from "@/lib/kv";
import type { MemoryClient } from "@/modules/memory/memory.client";
import { STRUCTURED_KINDS, writeAvailability } from "@/modules/memory/memory.capabilities";
import { createWriteGuard, structuredPolicyKinds } from "@/modules/memory/memory.policy";
import { MemoryService, type WriteInput } from "@/modules/memory/memory.service";

const A = (n: string) => "0x" + n.repeat(64);
const WALLET = A("a");

/** Counts provider writes so tests can prove a refused write never reaches the provider. */
function fakeClient(kind: "walrus" | "mock" = "walrus") {
  const writes: string[] = [];
  const client: MemoryClient = {
    kind,
    rememberAndWait: async (text, namespace) => {
      writes.push(text);
      return { blob_id: `blob-${writes.length}`, namespace };
    },
    recall: async () => ({ results: [] }),
    listMemories: async () => ({ memories: [], next_cursor: null, has_more: false }),
    health: async () => ({ status: "ok", detail: "" }),
  };
  return { client, writes };
}

const PUBLIC: MemoryWriteConfig = { enabled: true, structuredOnly: true, perSessionDay: 20, globalDay: 300 };

function svc(opts: { cfg?: Partial<MemoryWriteConfig>; kv?: Kv; remote?: boolean; principal?: string; client?: MemoryClient } = {}) {
  const kv = opts.kv ?? { store: new MemoryKvStore(), shared: true };
  const guard = createWriteGuard({ ...PUBLIC, ...opts.cfg }, { remote: opts.remote ?? true, kv: () => kv });
  return new MemoryService(opts.client ?? fakeClient().client, { namespacePrefix: "t", network: "testnet" }, opts.principal ?? "p1", undefined, guard);
}

const feedback = (note: string | null = null): WriteInput => ({
  kind: "security_feedback",
  category: "security_decision",
  source: "user",
  entityId: "tx:abc",
  wallet: WALLET,
  summary: "User marked a transaction as suspicious.",
  data: { digest: "5Hq9m2Xc8vYbTn3KpL4wRd7sFgJ1aZ", verdict: "suspicious", note, recipients: [A("b")], packages: [], transactionTimeMs: 1, score: 40, critical: false },
});
const transfer = (data: Record<string, unknown> = {}): WriteInput => ({
  kind: "transfer_decision",
  category: "reasoning",
  source: "user",
  entityId: "transfer-check:1",
  wallet: WALLET,
  summary: "User would not proceed.",
  data: { recipient: A("b"), coinType: `${A("0").slice(0, 65)}2::sui::SUI`, amount: "1.5", decision: "would_not_proceed", note: null, ...data },
});
const investment = (data: Record<string, unknown> = {}): WriteInput => ({
  kind: "investment_decision",
  category: "investment_decision",
  source: "user",
  entityId: "decision:1",
  wallet: WALLET,
  summary: "User rejected the scenario.",
  data: { decision: "rejected", reason: null, scenario: "reduce SUI; increase stablecoins", targets: { native: "60", stablecoin: "40", other: "0" }, ...data },
});
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: AppError) => `${e.code}:${e.status}`);

describe("memory write switch", () => {
  it("refuses every write when the remote provider is read-only, before reaching the provider", async () => {
    const { client, writes } = fakeClient();
    expect(await code(svc({ cfg: { enabled: false }, client }).write(feedback()))).toBe("MEMORY_READ_ONLY:403");
    expect(writes).toHaveLength(0);
  });
});

describe("structured-only policy (public demo)", () => {
  it("accepts predefined decisions and review verdicts", async () => {
    const s = svc();
    expect(await code(s.write(feedback()))).toBe("ok");
    expect(await code(s.write(transfer()))).toBe("ok");
    expect(await code(s.write(investment()))).toBe("ok");
    expect(await code(s.write(investment({ scenario: "no change", targets: null })))).toBe("ok");
  });

  it("refuses notes, goals, strategy and synthetic seeding", async () => {
    const { client, writes } = fakeClient();
    const s = svc({ client });
    for (const kind of ["note", "goal", "goal_delete", "strategy", "synthetic"] as const) {
      expect(await code(s.write({ ...feedback(), kind }))).toBe("MEMORY_POLICY:403");
    }
    expect(writes).toHaveLength(0);
  });

  it("refuses free text hidden in otherwise allowed records", async () => {
    const s = svc();
    expect(await code(s.write(feedback("my seed phrase is ...")))).toBe("MEMORY_POLICY:403");
    expect(await code(s.write(transfer({ note: "call me at ..." })))).toBe("MEMORY_POLICY:403");
    expect(await code(s.write(investment({ reason: "because ..." })))).toBe("MEMORY_POLICY:403");
    expect(await code(s.write(investment({ scenario: "reduce SUI; my email is x@y.z" })))).toBe("MEMORY_POLICY:403");
    expect(await code(s.write(transfer({ coinType: "0x2::sui::SUI my notes" })))).toBe("MEMORY_POLICY:403");
    expect(await code(s.write(transfer({ extra: "field" })))).toBe("MEMORY_POLICY:403");
  });

  it("accepts canonical generic coin types in transfer decisions", async () => {
    const hex = (h: string) => "0x" + h.padStart(64, "0");
    const lp = `${hex("5d")}::lp::LP<${hex("2")}::sui::SUI,${hex("db")}::usdc::USDC>`;
    expect(await code(svc().write(transfer({ coinType: lp })))).toBe("ok");
    expect(await code(svc().write(transfer({ coinType: `${lp} note` })))).toBe("MEMORY_POLICY:403");
    expect(await code(svc().write(transfer({ coinType: lp.replace(",", ", ") })))).toBe("MEMORY_POLICY:403");
  });

  it("does not restrict the local development mock", async () => {
    const s = svc({ cfg: { structuredOnly: false }, remote: false, kv: { store: new MemoryKvStore(), shared: false } });
    expect(await code(s.write({ ...feedback("a note"), kind: "note" }))).toBe("ok");
  });
});

describe("memory write quotas", () => {
  it("enforces the per-session daily quota", async () => {
    const s = svc({ cfg: { perSessionDay: 2 } });
    expect(await code(s.write(feedback()))).toBe("ok");
    expect(await code(s.write(feedback()))).toBe("ok");
    expect(await code(s.write(feedback()))).toBe("MEMORY_QUOTA:429");
  });

  it("enforces the global daily quota across sessions", async () => {
    const kv = { store: new MemoryKvStore(), shared: true };
    expect(await code(svc({ kv, cfg: { globalDay: 2 }, principal: "p1" }).write(feedback()))).toBe("ok");
    expect(await code(svc({ kv, cfg: { globalDay: 2 }, principal: "p2" }).write(feedback()))).toBe("ok");
    expect(await code(svc({ kv, cfg: { globalDay: 2 }, principal: "p3" }).write(feedback()))).toBe("MEMORY_QUOTA:429");
  });

  it("fails closed for remote writes when Redis is down or not configured", async () => {
    const down: KvStore = { incr: () => Promise.reject(new Error("down")), get: async () => null, set: async () => {}, ping: async () => {} };
    const { client, writes } = fakeClient();
    expect(await code(svc({ client, kv: { store: down, shared: true } }).write(feedback()))).toBe("MEMORY_QUOTA:503");
    expect(await code(svc({ client, kv: { store: new MemoryKvStore(), shared: false } }).write(feedback()))).toBe("MEMORY_QUOTA:503");
    expect(writes).toHaveLength(0);
  });
});

describe("client write availability (memory.capabilities)", () => {
  const walrus = (enabled: boolean, structuredOnly: boolean) => ({ provider: "walrus" as const, writes: { enabled, structuredOnly } });

  it("matches the server policy's structured kinds exactly", () => {
    expect([...structuredPolicyKinds()].sort()).toEqual([...STRUCTURED_KINDS].sort());
  });

  it("disables goals and strategy settings under the public structured-only policy, with a reason", () => {
    for (const kind of ["goal", "strategy"] as const) {
      const r = writeAvailability(walrus(true, true), kind);
      expect(r.allowed).toBe(false);
      if (!r.allowed) expect(r.reason).toMatch(/not saved in this public demo/);
    }
    expect(writeAvailability(walrus(true, true), "security_feedback")).toEqual({ allowed: true });
  });

  it("explains read-only, disabled and unknown states", () => {
    const ro = writeAvailability(walrus(false, true), "goal");
    expect(!ro.allowed && ro.reason).toMatch(/read-only/);
    const off = writeAvailability({ provider: "disabled", writes: { enabled: false, structuredOnly: false } }, "strategy");
    expect(!off.allowed && off.reason).toMatch(/not configured/);
    expect(writeAvailability(null, "goal").allowed).toBe(false);
  });

  it("allows everything on the local mock", () => {
    for (const kind of ["goal", "strategy", "note"] as const) {
      expect(writeAvailability({ provider: "mock", writes: { enabled: true, structuredOnly: false } }, kind)).toEqual({ allowed: true });
    }
  });
});
