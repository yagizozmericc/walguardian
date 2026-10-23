"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

/**
 * The public address currently being analysed. Watch-only: holding an address
 * here never implies ownership, and it does not unlock any private memory.
 * Persisted per browser as a convenience only.
 */

const STORAGE_KEY = "guardian.watchAddress";
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

interface WatchContextValue {
  address: string | null;
  setAddress: (address: string | null) => void;
}

const WatchContext = createContext<WatchContextValue | null>(null);

export function WatchProvider({ children }: { children: React.ReactNode }) {
  const address = useSyncExternalStore(subscribe, read, () => null);

  const setAddress = useCallback((next: string | null) => {
    try {
      if (next) window.localStorage.setItem(STORAGE_KEY, next);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage unavailable (private mode); the address simply won't persist.
    }
    listeners.forEach((l) => l());
  }, []);

  return <WatchContext.Provider value={{ address, setAddress }}>{children}</WatchContext.Provider>;
}

export function useWatchAddress(): WatchContextValue {
  const ctx = useContext(WatchContext);
  if (!ctx) throw new Error("useWatchAddress must be used inside <WatchProvider>.");
  return ctx;
}
