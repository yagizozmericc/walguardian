"use client";

import { useCallback, useSyncExternalStore } from "react";
import { StrategySettingsSchema, type StrategySettings } from "@/modules/strategy/strategy.types";

/**
 * TEMPORARY DEMO STORE for strategy settings (reference prices, targets,
 * constraints). Kept only in this browser tab (sessionStorage) and lost when
 * it closes. Replaced by Walrus Memory persistence.
 */

const PREFIX = "guardian.demo.strategy.";
const memory = new Map<string, string>();
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: StrategySettings }>();

export const STRATEGY_PERSISTENCE = {
  label: "Temporary demo storage",
  detail: "Reference prices, targets and constraints are kept only in this browser tab and are lost when it closes. They are not saved to Walrus Memory yet.",
};

export function defaultSettings(): StrategySettings {
  return {
    targets: null,
    driftBandPct: "5",
    referencePrices: [],
    excluded: [],
    minStablecoinReserveUsd: null,
    gasReserveSui: null,
    riskTolerance: null,
    horizon: null,
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
}

function read(owner: string): StrategySettings {
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(PREFIX + owner);
  } catch {
    raw = memory.get(owner) ?? null;
  }
  const hit = cache.get(owner);
  if (hit && hit.raw === raw) return hit.value;
  let value = defaultSettings();
  if (raw) {
    try {
      const parsed = StrategySettingsSchema.safeParse(JSON.parse(raw));
      if (parsed.success) value = parsed.data;
    } catch {
      // Corrupt entry: fall back to defaults.
    }
  }
  cache.set(owner, { raw, value });
  return value;
}

function write(owner: string, value: StrategySettings) {
  const raw = JSON.stringify(value);
  try {
    window.sessionStorage.setItem(PREFIX + owner, raw);
  } catch {
    memory.set(owner, raw);
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const SERVER_DEFAULT = defaultSettings();

export function useStrategySettings(owner: string | null) {
  const settings = useSyncExternalStore(subscribe, () => (owner ? read(owner) : SERVER_DEFAULT), () => SERVER_DEFAULT);
  const save = useCallback(
    (next: StrategySettings) => owner && write(owner, { ...next, updatedAt: new Date().toISOString() }),
    [owner],
  );
  return { settings, save };
}
