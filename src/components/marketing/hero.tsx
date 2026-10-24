import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import { Container } from "./primitives";
import { APP_HREF } from "./nav-links";
import { demoWalletAddress } from "@/lib/demo";
import { AppPreview } from "./previews/app-preview";

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden pt-20 pb-24 sm:pt-28 sm:pb-32">
      <div className="mk-grid pointer-events-none absolute inset-0 -z-10" aria-hidden />
      <div className="mk-glow pointer-events-none absolute inset-0 -z-10" aria-hidden />

      <Container>
        <div className="mx-auto max-w-4xl text-center">
          <p className="mk-enter inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-[12px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-brand mk-pulse" aria-hidden />
            Financial copilot for Sui · Testnet
          </p>

          <h1
            id="hero-title"
            className="mk-heading mk-enter mt-7 text-[clamp(2.75rem,8vw,5.75rem)] leading-[0.98] font-semibold tracking-[-0.045em]"
            style={{ "--mk-delay": "80ms" } as React.CSSProperties}
          >
            Your Money.
            <br />
            <span className="mk-gradient-text">A Smarter Memory.</span>
          </h1>

          <p
            className="mk-enter mt-7 text-[clamp(1.15rem,2.2vw,1.4rem)] font-medium tracking-tight text-foreground/90"
            style={{ "--mk-delay": "160ms" } as React.CSSProperties}
          >
            Meet the financial copilot that remembers.
          </p>
          <p
            className="mk-enter mx-auto mt-3 max-w-2xl text-pretty text-[16px] leading-relaxed text-muted-foreground sm:text-[17px]"
            style={{ "--mk-delay": "220ms" } as React.CSSProperties}
          >
            Walguardian brings security intelligence, savings goals, portfolio insights, and financial memory together in one experience. Built on Sui.
          </p>

          <div className="mk-enter mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row" style={{ "--mk-delay": "300ms" } as React.CSSProperties}>
            <Link
              href={APP_HREF}
              className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-foreground px-5 text-[14px] font-medium text-background transition-colors hover:bg-foreground/90 sm:w-auto"
            >
              Launch App
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#pillars"
              className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface/50 px-5 text-[14px] font-medium text-foreground transition-colors hover:border-foreground/20 hover:bg-surface sm:w-auto"
            >
              Explore Features
              <ArrowDown className="size-4 text-muted-foreground transition-transform group-hover:translate-y-0.5" />
            </a>
          </div>
          <p className="mk-enter mt-4 text-[13px] text-muted-foreground" style={{ "--mk-delay": "360ms" } as React.CSSProperties}>
            <Link href={`${APP_HREF}?address=${demoWalletAddress()}`} className="underline decoration-border underline-offset-4 hover:text-foreground">
              Try it with a read-only demo wallet
            </Link>{" "}
            <span className="text-subtle">· a public Sui Testnet address owned by a third party</span>
          </p>
        </div>

        <div className="mk-enter relative mx-auto mt-16 max-w-[1080px] sm:mt-20" style={{ "--mk-delay": "420ms" } as React.CSSProperties}>
          <AppPreview />
          <p className="mt-4 text-center text-[12px] text-subtle">
            Product preview with illustrative data. Balances are read from Sui Testnet in the live app.
          </p>
        </div>
      </Container>
    </section>
  );
}
