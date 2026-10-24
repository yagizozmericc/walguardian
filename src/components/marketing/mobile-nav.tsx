"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { APP_HREF, NAV_LINKS } from "./nav-links";

/** The only interactive part of the header: a disclosure menu below `md`. */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      <div
        id="mobile-menu"
        hidden={!open}
        className="absolute inset-x-0 top-14 h-[calc(100dvh-3.5rem)] overflow-y-auto border-b border-border bg-ink"
      >
        <nav aria-label="Mobile" className="flex flex-col px-4 py-3">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="border-b border-border/60 py-3 text-[15px] text-muted-foreground last:border-0 hover:text-foreground">
              {l.label}
            </a>
          ))}
          <Link href={APP_HREF} className="mt-3 inline-flex h-10 items-center justify-center rounded-md bg-foreground text-[14px] font-medium text-background">
            Launch App
          </Link>
        </nav>
      </div>
    </div>
  );
}
