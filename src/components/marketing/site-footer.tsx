import Link from "next/link";
import { BRAND_NAME, BRAND_TAGLINE, LogoMark } from "@/components/brand/logo";
import { GITHUB_URL } from "@/lib/site";
import { Container } from "./primitives";
import { APP_HREF, NAV_LINKS } from "./nav-links";

const APP_LINKS = [
  { href: APP_HREF, label: "Overview" },
  { href: "/security", label: "Security" },
  { href: "/savings", label: "Savings" },
  { href: "/strategy", label: "Strategy" },
  { href: "/assess", label: "Transfer check" },
  { href: "/memory", label: "Financial memory" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-ink">
      <Container className="py-14">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="inline-flex items-center gap-2 rounded-md" aria-label={`${BRAND_NAME} home`}>
              <LogoMark className="size-[18px] text-brand" />
              <span className="text-[14px] font-semibold tracking-tight">{BRAND_NAME}</span>
            </Link>
            <p className="mt-3 text-[13.5px] text-muted-foreground">{BRAND_TAGLINE}</p>
          </div>
          <nav aria-label="Footer: product">
            <h2 className="text-[12px] font-medium text-foreground">Product</h2>
            <ul className="mt-3 space-y-2">
              {NAV_LINKS.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Footer: app">
            <h2 className="text-[12px] font-medium text-foreground">App</h2>
            <ul className="mt-3 space-y-2">
              {APP_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Footer: resources">
            <h2 className="text-[12px] font-medium text-foreground">Resources</h2>
            <ul className="mt-3 space-y-2">
              <li>
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                  GitHub
                </a>
              </li>
              <li>
                <a href="#security" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                  Security principles
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mk-hairline mt-12 h-px" aria-hidden />
        <div className="mt-6 flex flex-col gap-3 text-[12px] leading-relaxed text-subtle md:flex-row md:justify-between md:gap-10">
          <p className="max-w-3xl">
            Walguardian is an experimental analysis tool running on Sui Testnet. It does not provide financial, investment or security advice, does not execute transactions, and cannot guarantee that any transaction or recipient is safe. Product previews on this page use illustrative data.
          </p>
          <p className="shrink-0">Built for the Tatum Total Recall Hackathon.</p>
        </div>
      </Container>
    </footer>
  );
}
