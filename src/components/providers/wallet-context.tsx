"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getWallets, signTransaction as standardSignTransaction, type SuiChain, type Wallet, type WalletAccount } from "@mysten/wallet-standard";
import { useIntegrationStatus } from "@/components/layout/use-integration-status";
import { useWatchAddress } from "./watch-context";

/**
 * Optional Sui wallet connection over the Wallet Standard. Guardian only ever
 * asks the wallet to sign a transaction it built and simulated; it never sees
 * a key. Connecting makes the connected account the watched address. The
 * last wallet's name is remembered per browser to reconnect silently.
 */

const STORAGE_KEY = "guardian.lastWallet";

type SuiWallet = Wallet & { id?: string };

function isUsable(w: Wallet): boolean {
  return "standard:connect" in w.features && ("sui:signTransaction" in w.features || "sui:signTransactionBlock" in w.features) && w.chains.some((c) => c.startsWith("sui:"));
}

function remember(name: string | null) {
  try {
    if (name) window.localStorage.setItem(STORAGE_KEY, name);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable; the wallet simply won't reconnect on reload.
  }
}

function lastWallet(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

type ConnectFeature = { connect(input?: { silent?: boolean }): Promise<{ accounts: readonly WalletAccount[] }> };
type DisconnectFeature = { disconnect(): Promise<void> };
type EventsFeature = { on(event: "change", cb: (p: { accounts?: readonly WalletAccount[] }) => void): () => void };

interface WalletContextValue {
  /** Wallets detected in this browser that can sign Sui transactions. */
  wallets: SuiWallet[];
  wallet: SuiWallet | null;
  account: WalletAccount | null;
  chain: SuiChain | null;
  connecting: boolean;
  error: string | null;
  connect: (wallet: SuiWallet) => Promise<void>;
  disconnect: () => Promise<void>;
  /** Asks the wallet to sign these exact BCS bytes (base64). Returns what the wallet signed. */
  signTransaction: (bytes: string, signal?: AbortSignal) => Promise<{ bytes: string; signature: string }>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { setAddress } = useWatchAddress();
  const { data: status } = useIntegrationStatus();
  const chain: SuiChain | null = status ? `sui:${status.network}` : null;
  const [wallets, setWallets] = useState<SuiWallet[]>([]);
  const [wallet, setWallet] = useState<SuiWallet | null>(null);
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const registry = getWallets();
    const refresh = () => setWallets(registry.get().filter(isUsable));
    refresh();
    const offRegister = registry.on("register", refresh);
    const offUnregister = registry.on("unregister", refresh);
    return () => {
      offRegister();
      offUnregister();
    };
  }, []);

  const adopt = useCallback(
    (w: SuiWallet, accounts: readonly WalletAccount[]) => {
      const next = accounts.find((a) => !chain || a.chains.includes(chain)) ?? null;
      if (!next) {
        setError(chain ? `${w.name} has no account on ${chain}. Switch the wallet's network and connect again.` : `${w.name} returned no accounts.`);
        return false;
      }
      setWallet(w);
      setAccount(next);
      setAddress(next.address);
      return true;
    },
    [chain, setAddress],
  );

  const connect = useCallback(
    async (w: SuiWallet) => {
      setConnecting(true);
      setError(null);
      try {
        const { accounts } = await (w.features["standard:connect"] as ConnectFeature).connect();
        if (adopt(w, accounts)) remember(w.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : "The wallet refused the connection.");
      } finally {
        setConnecting(false);
      }
    },
    [adopt],
  );

  const disconnect = useCallback(async () => {
    const w = wallet;
    setWallet(null);
    setAccount(null);
    remember(null);
    await (w?.features["standard:disconnect"] as DisconnectFeature | undefined)?.disconnect().catch(() => {});
  }, [wallet]);

  // Silent reconnect to the last wallet once it registers and the network is known.
  useEffect(() => {
    if (wallet || !chain) return;
    const name = lastWallet();
    const w = name ? wallets.find((x) => x.name === name) : undefined;
    if (!w) return;
    (w.features["standard:connect"] as ConnectFeature)
      .connect({ silent: true })
      .then(({ accounts }) => accounts.length > 0 && adopt(w, accounts))
      .catch(() => remember(null));
  }, [wallets, wallet, chain, adopt]);

  // Follow account switches inside the wallet.
  useEffect(() => {
    const events = wallet?.features["standard:events"] as EventsFeature | undefined;
    if (!wallet || !events) return;
    return events.on("change", ({ accounts }) => {
      if (!accounts) return;
      if (accounts.length === 0) {
        setWallet(null);
        setAccount(null);
      } else adopt(wallet, accounts);
    });
  }, [wallet, adopt]);

  const signTransaction = useCallback(
    async (bytes: string, signal?: AbortSignal) => {
      if (!wallet || !account || !chain) throw new Error("Connect a wallet first.");
      // A base64 string is the serialized, fully built transaction, so the wallet cannot re-resolve gas or inputs.
      return standardSignTransaction(wallet, { transaction: { toJSON: async () => bytes }, account, chain, signal });
    },
    [wallet, account, chain],
  );

  const value = useMemo(
    () => ({ wallets, wallet, account, chain, connecting, error, connect, disconnect, signTransaction }),
    [wallets, wallet, account, chain, connecting, error, connect, disconnect, signTransaction],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>.");
  return ctx;
}
