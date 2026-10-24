import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProviderError } from "@/lib/errors";
import type { MemoryClient } from "@/modules/memory/memory.client";
import { encodeMemory } from "@/modules/memory/memory.codec";
import { MemoryService, latestByEntity } from "@/modules/memory/memory.service";
import { MockMemoryClient } from "@/modules/memory/mock.adapter";
import { encodeSession, principalTag, verifySession } from "@/modules/session/session";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const CFG = { namespacePrefix: "guardian-test", network: "testnet" as const };
const WALLET = `0x${"aa".repeat(32)}`;

let dir: string;
let file: string;
let clock: Date;
const now = () => clock;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "guardian-mem-"));
  file = path.join(dir, "mock-memory.json");
  clock = new Date("2026-10-24T10:00:00.000Z");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const service = (principal: string, client = new MockMemoryClient(file, 28, now)) => new MemoryService(client, CFG, principal, now);
const goalInput = (name: string, extra: Partial<Parameters<MemoryService["write"]>[0]> = {}) => ({
  category: "goal" as const,
  source: "user" as const,
  entityId: "goal:g1",
  wallet: WALLET,
  summary: `Savings goal ${name}`,
  data: { name },
  ...extra,
});

describe("persistence and retrieval (mock provider)", () => {
  it("confirms writes with a blob id and retrieves them", async () => {
    const s = service(ALICE);
    const written = await s.write(goalInput("Emergency fund"));
    expect(written.blobId).toBeTruthy();
    expect(written.provider).toBe("mock");
    const { records } = await s.list("goal", { wallet: WALLET });
    expect(records.map((r) => r.data)).toEqual([{ name: "Emergency fund" }]);
    expect(records[0].expiresAt).toBe("2026-11-21T10:00:00.000Z"); // simulated 28-day expiry
  });

  it("survives an application restart (new client, same store)", async () => {
    await service(ALICE).write(goalInput("Emergency fund"));
    const afterRestart = service(ALICE, new MockMemoryClient(file, 28, now));
    expect((await afterRestart.list("goal")).records).toHaveLength(1);
    const stored = JSON.parse(await readFile(file, "utf8"));
    expect(stored.note).toMatch(/Not Walrus/);
  });

  it("is idempotent per record id", async () => {
    const client = new MockMemoryClient(file, 28, now);
    const a = await client.rememberAndWait("x\n<<guardian:{}>>", "ns", { idempotencyKey: "k1" });
    const b = await client.rememberAndWait("x\n<<guardian:{}>>", "ns", { idempotencyKey: "k1" });
    expect(b.blob_id).toBe(a.blob_id);
    expect((await client.listMemories({ namespace: "ns" })).memories).toHaveLength(1);
  });

  it("newest record wins per entity; tombstones remove it but stay in history", async () => {
    const s = service(ALICE);
    await s.write(goalInput("v1"));
    clock = new Date("2026-10-24T11:00:00.000Z");
    const v2 = await s.write(goalInput("v2"));
    let { byEntity } = await s.current("goal");
    expect(byEntity.get("goal:g1")?.id).toBe(v2.id);
    clock = new Date("2026-10-24T12:00:00.000Z");
    await s.write(goalInput("deleted", { deleted: true, supersedes: v2.id }));
    ({ byEntity } = await s.current("goal"));
    expect(byEntity.size).toBe(0);
    const history = await s.history();
    expect(history.map((h) => h.status).sort()).toEqual(["deleted", "superseded", "superseded"]);
  });

  it("filters by wallet", async () => {
    const s = service(ALICE);
    await s.write(goalInput("a"));
    await s.write(goalInput("b", { entityId: "goal:g2", wallet: `0x${"bb".repeat(32)}` }));
    expect((await s.list("goal", { wallet: WALLET })).records.map((r) => r.data)).toEqual([{ name: "a" }]);
  });
});

describe("isolation", () => {
  it("one principal never sees another's memories", async () => {
    const client = new MockMemoryClient(file, 28, now);
    await service(ALICE, client).write(goalInput("alice secret plan"));
    expect((await service(BOB, client).list("goal")).records).toEqual([]);
    expect(await service(BOB, client).history()).toEqual([]);
  });

  it("rejects records whose envelope belongs to a different principal even inside the namespace", async () => {
    const client = new MockMemoryClient(file, 28, now);
    const bob = service(BOB, client);
    // A forged record written straight into Bob's namespace, tagged with Alice's principal.
    const forged = encodeMemory("forged", {
      v: 1, id: "forged", principal: principalTag(ALICE), category: "goal", source: "user", entityId: "goal:x",
      wallet: null, network: "testnet", createdAt: clock.toISOString(), supersedes: null, deleted: false, data: {},
    });
    await client.rememberAndWait(forged, bob.namespace("goal"), { idempotencyKey: "forged" });
    expect((await bob.list("goal")).records).toEqual([]);
  });

  it("namespaces are derived from the server-side principal", () => {
    expect(service(ALICE).namespace("security_decision")).toBe(`guardian-test-${ALICE}-security_decision`);
  });
});

describe("expiry", () => {
  it("expired memories are no longer served but are reported", async () => {
    const s = service(ALICE);
    await s.write(goalInput("old"));
    clock = new Date("2026-11-22T10:00:00.000Z"); // past the 28-day simulated expiry
    const fresh = service(ALICE, new MockMemoryClient(file, 28, now));
    const list = await fresh.list("goal");
    expect(list.records).toEqual([]);
    expect(list.expired).toBe(1);
    expect((await fresh.history())[0]).toMatchObject({ status: "expired", record: null });
  });
});

describe("relevant memories", () => {
  it("returns the closest matches across categories, excluding tombstones", async () => {
    const s = service(ALICE);
    await s.write({ category: "security_decision", source: "user", entityId: "tx:1", wallet: WALLET, summary: "User marked transfer to cold wallet as expected", data: {} });
    await s.write({ category: "reasoning", source: "user", entityId: "note:1", wallet: WALLET, summary: "Rent is paid monthly to landlord", data: {} });
    const r = await s.relevant("cold wallet transfer", ["security_decision", "reasoning"], { limit: 1 });
    expect(r[0].summary).toContain("cold wallet");
  });
});

describe("provider failures", () => {
  const failing: MemoryClient = {
    kind: "walrus",
    rememberAndWait: async () => {
      throw new ProviderError("walrus", "PROVIDER_UNAVAILABLE", "relayer unavailable", true);
    },
    recall: async () => {
      throw new ProviderError("walrus", "PROVIDER_UNAVAILABLE", "relayer unavailable", true);
    },
    listMemories: async () => {
      throw new ProviderError("walrus", "PROVIDER_UNAVAILABLE", "relayer unavailable", true);
    },
    health: async () => ({ status: "error", detail: "down" }),
  };
  it("surfaces errors instead of returning empty or fabricated results", async () => {
    const s = new MemoryService(failing, CFG, ALICE, now);
    await expect(s.write(goalInput("x"))).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE", provider: "walrus" });
    await expect(s.list("goal")).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("sessions", () => {
  const secret = "cd".repeat(32);
  it("verifies signed sessions and rejects tampering", () => {
    const v = encodeSession(ALICE, secret);
    expect(verifySession(v, secret)).toBe(ALICE);
    expect(verifySession(v.replace(ALICE, BOB), secret)).toBeNull();
    expect(verifySession(v, "ef".repeat(32))).toBeNull();
    expect(verifySession("garbage", secret)).toBeNull();
    expect(verifySession(undefined, secret)).toBeNull();
  });
  it("principal tags are stable and distinct", () => {
    expect(principalTag(ALICE)).toMatch(/^[0-9a-f]{16}$/);
    expect(principalTag(ALICE)).not.toBe(principalTag(BOB));
  });
});

describe("latestByEntity", () => {
  it("orders by createdAt regardless of input order", () => {
    const base = { v: 1 as const, principal: "0".repeat(16), category: "goal" as const, source: "user" as const, wallet: null, network: "testnet" as const, supersedes: null, deleted: false, data: {}, summary: "", blobId: "b", expiresAt: null, provider: "mock" as const, entityId: "e" };
    const m = latestByEntity([{ ...base, id: "2", createdAt: "2026-01-02T00:00:00.000Z" }, { ...base, id: "1", createdAt: "2026-01-01T00:00:00.000Z" }]);
    expect(m.get("e")?.id).toBe("2");
  });
});
