"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND_NAME, LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";
import { IntegrationStatus } from "./integration-status";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-px" aria-label="Primary">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] text-sidebar-foreground/80 transition-colors",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
            )}
          >
            <Icon className={cn("size-4 text-subtle", active && "text-brand")} strokeWidth={1.75} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2 rounded-md px-2.5" aria-label={`${BRAND_NAME} home`}>
      <LogoMark className="text-brand" />
      <span className="text-[13px] font-semibold tracking-tight">{BRAND_NAME}</span>
    </Link>
  );
}

export function AppSidebar() {
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex h-12 items-center border-b border-sidebar-border px-2">
        <Wordmark />
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <SidebarNav />
      </div>
      <div className="border-t border-sidebar-border px-4 py-3">
        <IntegrationStatus />
      </div>
    </aside>
  );
}
