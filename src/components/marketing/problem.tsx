import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Container, Dot, Eyebrow, Heading, Lede, Section } from "./primitives";
import { SCENARIO as S } from "./scenario";

const CONTEXT = [
  { pillar: "Protect", tone: "bg-warning", text: "First payment to this recipient. Amount is above this wallet's usual range." },
  { pillar: "Save", tone: "bg-critical", text: `Would take your ${S.reserve.name} below the ${S.reserve.minimum} SUI minimum you set.` },
  { pillar: "Invest", tone: "bg-muted-foreground/60", text: "SUI would fall outside your target allocation band." },
  { pillar: "Memory", tone: "bg-brand", text: `On ${S.day1} you chose to keep a minimum SUI reserve.` },
];

export function Problem() {
  return (
    <Section id="problem" labelledBy="problem-title" className="border-t border-border/60">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div className="mk-reveal lg:sticky lg:top-28 lg:self-start">
            <Eyebrow>The problem</Eyebrow>
            <Heading id="problem-title" className="mt-5">
              Your wallet tracks transactions. It doesn&apos;t understand decisions.
            </Heading>
            <Lede className="mt-6">
              Wallets show balances and history. They don&apos;t connect what you&apos;re about to do with the goals you set, the risks you&apos;ve reviewed, or the choices you made last month.
            </Lede>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-subtle">
              So every decision starts from zero: one address, one amount, one confirm button.
            </p>
          </div>

          <div className="mk-reveal relative grid gap-4 md:grid-cols-2 md:gap-0">
            {/* Conventional wallet */}
            <div className="rounded-xl border border-border bg-surface/40 p-5 md:rounded-r-none md:border-r-0">
              <div className="font-mono text-[10.5px] tracking-[0.14em] text-subtle uppercase">A typical wallet</div>
              <div className="mt-5 rounded-lg border border-border bg-background/60 p-4">
                <div className="text-[12px] text-subtle">Send</div>
                <div className="num mt-1 text-[26px] font-medium tracking-tight">{S.transfer} SUI</div>
                <dl className="num mt-4 space-y-2 text-[12.5px]">
                  <div className="flex justify-between gap-3">
                    <dt className="text-subtle">To</dt>
                    <dd className="font-mono">{S.recipient}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-subtle">Network fee</dt>
                    <dd>≈ 0.0021 SUI</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-subtle">Balance after</dt>
                    <dd>{S.suiAfterWithGas} SUI</dd>
                  </div>
                </dl>
                <div className="mt-5 flex h-9 items-center justify-center rounded-md bg-foreground/10 text-[13px] font-medium text-muted-foreground">Confirm</div>
              </div>
              <p className="mt-4 text-[13px] leading-relaxed text-subtle">Accurate, but silent about whether this fits your plan.</p>
            </div>

            {/* Walguardian */}
            <div className="relative rounded-xl border border-brand/25 bg-surface p-5 md:rounded-l-none">
              <span
                className="absolute top-1/2 -left-3.5 z-10 hidden size-7 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-ink text-brand md:flex"
                aria-hidden
              >
                <ArrowRight className="size-3.5" />
              </span>
              <div className="font-mono text-[10.5px] tracking-[0.14em] text-brand uppercase">With Walguardian</div>
              <p className="mt-5 text-[13px] text-muted-foreground">
                Same transfer, <span className="text-foreground">four kinds of context</span>:
              </p>
              <ul className="mt-3 space-y-2.5">
                {CONTEXT.map((c) => (
                  <li key={c.pillar} className="rounded-lg border border-border bg-background/60 px-3.5 py-3 transition-colors hover:border-foreground/15">
                    <div className="flex items-center gap-2 text-[10.5px] font-medium tracking-[0.08em] text-subtle uppercase">
                      <Dot className={cn(c.tone)} />
                      {c.pillar}
                    </div>
                    <p className="mt-1.5 text-[13px] leading-snug">{c.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
