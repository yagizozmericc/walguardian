import "server-only";
import { ConfigError } from "@/lib/errors";
import { env } from "@/lib/env";
import { getKv } from "@/lib/kv";
import type { MemoryClient } from "./memory.client";
import { STRUCTURED_ONLY_DETAIL, createWriteGuard } from "./memory.policy";
import { MemoryService } from "./memory.service";
import { MockMemoryClient } from "./mock.adapter";
import { createWalrusClient } from "./walrus.adapter";

let client: MemoryClient | null = null;

/** The configured provider. There is no fallback: a disabled or failing provider surfaces as an error. */
export function getMemoryClient(): MemoryClient {
  if (client) return client;
  const cfg = env().memory;
  if (cfg.provider === "disabled") throw new ConfigError(`Memory storage is not configured. ${cfg.reason}`, "CONFIG_MISSING");
  client =
    cfg.provider === "mock"
      ? new MockMemoryClient(cfg.file, cfg.ttlDays)
      : createWalrusClient({ key: cfg.key, accountId: cfg.accountId, serverUrl: cfg.serverUrl });
  return client;
}

export function getMemoryService(principalId: string): MemoryService {
  const cfg = env().memory;
  if (cfg.provider === "disabled") throw new ConfigError(`Memory storage is not configured. ${cfg.reason}`, "CONFIG_MISSING");
  // Records are tagged with the data network (Tatum), which stays Testnet.
  const guard = createWriteGuard(cfg.writes, { remote: cfg.provider === "walrus", kv: getKv });
  return new MemoryService(getMemoryClient(), { namespacePrefix: cfg.namespacePrefix, network: env().network }, principalId, undefined, guard);
}

export interface MemoryProviderInfo {
  provider: "walrus" | "mock" | "disabled";
  label: string;
  detail: string;
  /** What this deployment lets users save; the UI hides inputs that would be refused. */
  writes: { enabled: boolean; structuredOnly: boolean; detail: string | null };
}

export function memoryProviderInfo(): MemoryProviderInfo {
  const cfg = env().memory;
  if (cfg.provider === "disabled") return { provider: "disabled", label: "Not configured", detail: cfg.reason, writes: { enabled: false, structuredOnly: false, detail: null } };
  if (cfg.provider === "mock") {
    return {
      provider: "mock",
      label: "Development mock",
      detail: `Records are kept in a local file (${cfg.file}) by the SDK's MemWalMock. They are not stored on Walrus, and expiry after ${cfg.ttlDays} days is simulated.`,
      writes: { enabled: cfg.writes.enabled, structuredOnly: cfg.writes.structuredOnly, detail: null },
    };
  }
  return {
    provider: "walrus",
    label: `Walrus Memory (${cfg.network})`,
    detail: `Relayer ${cfg.serverUrl}. Records are stored for a limited, paid period and then expire; they are not permanent. The relayer operator can read their content, so only non-sensitive data is stored.`,
    writes: {
      enabled: cfg.writes.enabled,
      structuredOnly: cfg.writes.structuredOnly,
      detail: cfg.writes.enabled ? (cfg.writes.structuredOnly ? STRUCTURED_ONLY_DETAIL : null) : "Memory is read-only in this deployment: existing records can be shown, but nothing new is saved.",
    },
  };
}
