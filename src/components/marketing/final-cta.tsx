import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GITHUB_URL } from "@/lib/site";
import { LogoMark } from "@/components/brand/logo";
import { Container } from "./primitives";
import { APP_HREF } from "./nav-links";

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="relative isolate overflow-hidden border-t border-border/60 py-28 sm:py-36">
      <div className="mk-grid pointer-events-none absolute inset-0 -z-10 rotate-180" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[70%] bg-[radial-gradient(ellipse_50%_60%_at_50%_100%,oklch(0.67_0.17_258/16%),transparent_70%)]" aria-hidden />
      <Container className="mk-reveal text-center">
        <LogoMark className="mx-auto size-9 text-brand" />
        <h2 id="cta-title" className="mk-heading mx-auto mt-8 max-w-3xl text-balance text-[clamp(2.25rem,5.5vw,4.25rem)] leading-[1.02] font-semibold tracking-[-0.04em]">
          Make every financial decision count.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-pretty text-[17px] leading-relaxed text-muted-foreground">
          Your wallet already knows what happened. Walguardian helps you understand what comes next.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href={APP_HREF}
            className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-foreground px-5 text-[14px] font-medium text-background transition-colors hover:bg-foreground/90 sm:w-auto"
          >
            Launch Walguardian
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface/50 px-5 text-[14px] font-medium transition-colors hover:border-foreground/20 hover:bg-surface sm:w-auto"
          >
            View on GitHub
          </a>
        </div>
        <p className="mt-6 text-[12.5px] text-subtle">Runs on Sui Testnet. Enter any public address to explore. No wallet connection required.</p>
      </Container>
    </section>
  );
}
