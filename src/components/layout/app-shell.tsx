"use client";

import { useState } from "react";
import { Menu, PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { AppSidebar, SidebarNav, Wordmark } from "./app-sidebar";
import { AddressBar } from "./address-bar";
import { CopilotPanel } from "./copilot-panel";
import { WalletButton } from "./wallet-button";
import { IntegrationStatus, NetworkBadge } from "./integration-status";
import { useCopilot } from "@/components/copilot/copilot-context";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { open: copilotOpen, setOpen: setCopilotOpen } = useCopilot();

  return (
    <div className="flex h-dvh overflow-hidden">
      <AppSidebar />

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-64 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-12 items-center border-b border-sidebar-border px-2">
            <Wordmark />
          </div>
          <div className="px-2 py-3">
            <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
          </div>
          <div className="mt-auto border-t border-sidebar-border px-4 py-3">
            <IntegrationStatus />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu />
          </Button>
          <div className="min-w-0 flex-1">
            <AddressBar />
          </div>
          <NetworkBadge />
          <WalletButton />
          <Button
            variant={copilotOpen ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setCopilotOpen(!copilotOpen)}
            aria-pressed={copilotOpen}
          >
            <PanelRight />
            <span className="hidden sm:inline">Copilot</span>
          </Button>
        </header>

        <div className="flex min-h-0 flex-1">
          <main className={cn("min-w-0 flex-1 overflow-y-auto", copilotOpen && "hidden lg:block")}>
            {children}
          </main>
          {copilotOpen && <CopilotPanel onClose={() => setCopilotOpen(false)} />}
        </div>
      </div>
    </div>
  );
}
