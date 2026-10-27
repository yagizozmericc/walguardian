"use client";

import { Wallet } from "lucide-react";
import { useWallet } from "@/components/providers/wallet-context";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { shortAddress } from "@/lib/sui-address";

/** Optional wallet connection; needed only to sign a transfer Guardian has checked. */
export function WalletButton() {
  const { wallets, wallet, account, connecting, error, connect, disconnect } = useWallet();

  if (wallet && account) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="font-mono">
            {/* eslint-disable-next-line @next/next/no-img-element -- Wallet Standard icons are data: URIs, not optimizable assets. */}
            {wallet.icon && <img src={wallet.icon} alt="" className="size-3.5 rounded-sm" />}
            <span className="hidden sm:inline">{shortAddress(account.address, 4)}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Connected through {wallet.name}. Guardian asks it to sign only transfers you have checked; it never holds keys.
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void disconnect()}>Disconnect</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={connecting}>
          <Wallet />
          <span className="hidden sm:inline">{connecting ? "Connecting…" : "Connect wallet"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {wallets.length === 0 ? (
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            No Sui wallet found in this browser. Install a Wallet Standard wallet such as{" "}
            <a href="https://slush.app" target="_blank" rel="noreferrer" className="underline">
              Slush
            </a>
            , then reload.
          </DropdownMenuLabel>
        ) : (
          wallets.map((w) => (
            <DropdownMenuItem key={w.name} onSelect={() => void connect(w)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- Wallet Standard icons are data: URIs, not optimizable assets. */}
              {w.icon && <img src={w.icon} alt="" className="size-4 rounded-sm" />}
              {w.name}
            </DropdownMenuItem>
          ))
        )}
        {error && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-critical">{error}</DropdownMenuLabel>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
