import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BRAND_NAME, LogoMark } from "@/components/brand/logo";
import { Container } from "./primitives";
import { MobileNav } from "./mobile-nav";
import { APP_HREF, NAV_LINKS } from "./nav-links";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-ink/75 backdrop-blur-md supports-[backdrop-filter]:bg-ink/60">
      <Container className="flex h-14 items-center gap-6">
        <Link href="/" className="flex items-center gap-2 rounded-md" aria-label={`${BRAND_NAME} home`}>
          <LogoMark className="size-[18px] text-brand" />
          <span className="text-[14px] font-semibold tracking-tight">{BRAND_NAME}</span>
        </Link>

        <nav aria-label="Main" className="hidden flex-1 items-center justify-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="rounded-md px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link
            href={APP_HREF}
            className="group hidden h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[13px] font-medium text-background transition-colors hover:bg-foreground/90 sm:inline-flex"
          >
            Launch App
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
          </Link>
          <MobileNav />
        </div>
      </Container>
    </header>
  );
}
