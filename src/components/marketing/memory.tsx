import { Bookmark, Check } from "lucide-react";
import { Container, Dot, Eyebrow, Heading, Lede, Section } from "./primitives";
import { Cite } from "./previews/app-preview";
import { SCENARIO as S } from "./scenario";

const REMEMBERS = [
  ["Preferences", "Reserves, risk comfort, target allocations and notes in your own words."],
  ["Savings goals", "Targets, minimums and the funds you earmarked for them."],
  ["Security reviews", "Activity you marked as expected, suspicious or unsure."],
  ["Investment decisions", "Scenarios you accepted or rejected, and why."],
];

const STATUS = [
  { label: "Integration", value: "Built on the official Walrus Memory SDK behind a provider-neutral memory layer.", dot: "bg-positive" },
  { label: "This demo", value: "No memories are stored in the public demo yet. Local development uses a clearly labelled mock, which is not Walrus.", dot: "bg-warning" },
  { label: "Live persistence", value: "Read access to Walrus Mainnet is verified in development. Writing memories is not enabled yet.", dot: "bg-subtle" },
];

function Moment({ label, date, children }: { label: string; date: string; children: React.ReactNode }) {
  return (
    <div className="relative rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[11px] tracking-[0.14em] text-brand uppercase">{label}</span>
        <span className="num text-[11.5px] text-subtle">{date}</span>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function Memory() {
  return (
    <Section id="memory" labelledBy="memory-title" className="overflow-hidden border-t border-border/60">
      <div className="mk-glow pointer-events-none absolute inset-0 opacity-70" aria-hidden />
      <Container className="relative">
        <div className="mk-reveal mx-auto max-w-3xl text-center">
          <Eyebrow className="justify-center">Financial memory</Eyebrow>
          <Heading id="memory-title" className="mt-5">
            A financial copilot that remembers what matters.
          </Heading>
          <p className="mt-5 text-[clamp(1.1rem,2vw,1.3rem)] font-medium tracking-tight text-foreground/90">
            Your decisions shouldn&apos;t disappear after every session.
          </p>
          <Lede className="mx-auto mt-4 max-w-2xl">
            Walguardian keeps the preferences, goals, reviews and decisions you choose to save. It brings back the relevant ones the next time they matter, with their source and date.
          </Lede>
        </div>

        {/* Day 1 → later: one saved preference shaping a future assessment. */}
        <figure className="mk-reveal relative mx-auto mt-16 max-w-[1080px] sm:mt-20" aria-label="A preference saved on day one changes a later assessment">
          <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)] lg:gap-0">
            <Moment label="Day 1 · You decide" date={S.day1}>
              <div className="ml-auto max-w-[92%] rounded-lg bg-muted px-3.5 py-2.5 text-[14px]">I prefer to keep a minimum SUI reserve.</div>
              <div className="mt-1.5 flex justify-end">
                <span className="inline-flex items-center gap-1 text-[11.5px] text-brand">
                  <Check className="size-3" /> Remembered
                </span>
              </div>
              <div className="mt-4 rounded-lg border border-border bg-background/70">
                <div className="flex items-center gap-2 border-b border-border px-3.5 py-2 text-[11px] text-subtle">
                  <Bookmark className="size-3 text-brand" />
                  Memory record
                </div>
                <dl className="num grid grid-cols-[88px_1fr] gap-y-1.5 px-3.5 py-3 text-[12px]">
                  <dt className="text-subtle">Type</dt>
                  <dd>Savings goal · Reserve</dd>
                  <dt className="text-subtle">Memory</dt>
                  <dd>
                    {S.reserve.name}: keep at least {S.reserve.minimum} SUI
                  </dd>
                  <dt className="text-subtle">Source</dt>
                  <dd>You</dd>
                  <dt className="text-subtle">Saved</dt>
                  <dd>{S.day1Iso}</dd>
                </dl>
              </div>
            </Moment>

            {/* Connector: horizontal on desktop, vertical on mobile. */}
            <div className="relative flex items-center justify-center py-2 lg:py-0" aria-hidden>
              <svg className="absolute inset-0 hidden h-full w-full lg:block" preserveAspectRatio="none" viewBox="0 0 140 100">
                <path d="M0 50 H140" className="mk-flow stroke-brand/70" strokeWidth="1.25" fill="none" vectorEffect="non-scaling-stroke" />
              </svg>
              <svg className="absolute inset-0 h-full w-full lg:hidden" preserveAspectRatio="none" viewBox="0 0 100 100">
                <path d="M50 0 V100" className="mk-flow stroke-brand/70" strokeWidth="1.25" fill="none" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="relative rounded-full border border-brand/30 bg-ink px-3 py-1.5 text-center">
                <div className="text-[11px] font-medium text-brand">Recalled</div>
                <div className="text-[10px] whitespace-nowrap text-subtle">18 days later</div>
              </div>
            </div>

            <Moment label="Later · Transfer check" date={S.later}>
              <div className="text-[13px] text-muted-foreground">
                Simulated: send <span className="num text-foreground">{S.transfer} SUI</span> to <span className="font-mono text-foreground">{S.recipient}</span>
              </div>
              <div className="mt-4 rounded-lg border border-warning/30 bg-warning-muted px-3.5 py-3">
                <div className="flex items-center gap-2 text-[13px] font-medium">
                  <Dot className="bg-warning" />
                  Reserve &ldquo;{S.reserve.name}&rdquo; would fall below its minimum
                </div>
                <p className="num mt-1 text-[12.5px] text-muted-foreground">
                  Backed funds would go from {S.reserve.minimum}.00 to {S.reserve.fundedAfter} SUI (100% → {S.reserve.pctAfter}%).
                </p>
              </div>
              <div className="mt-3 rounded-lg border border-brand/25 bg-brand-muted px-3.5 py-3">
                <div className="text-[10px] font-medium tracking-[0.08em] text-brand uppercase">Explanation · cites your memory</div>
                <p className="mt-1 text-[14px] leading-snug">
                  This transfer would reduce the reserve you previously chose to maintain. <Cite id="M1" />
                </p>
                <p className="mt-1.5 text-[11.5px] text-subtle">Your own preference, saved {S.day1Iso}. Not verified evidence.</p>
              </div>
            </Moment>
          </div>
          <figcaption className="mt-4 text-center text-[12px] text-subtle">Illustrative example. Dates and amounts are synthetic.</figcaption>
        </figure>

        <div className="mt-20 grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="mk-reveal">
            <h3 className="text-[18px] font-semibold tracking-tight">What it remembers</h3>
            <dl className="mt-5 divide-y divide-border border-y border-border">
              {REMEMBERS.map(([t, d]) => (
                <div key={t} className="grid gap-1 py-3.5 sm:grid-cols-[11rem_1fr] sm:gap-6">
                  <dt className="text-[14px] font-medium">{t}</dt>
                  <dd className="text-[14px] leading-snug text-muted-foreground">{d}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[13px] leading-relaxed text-subtle">
              Every record keeps its source and timestamp. Things you said are kept separate from what the AI inferred, and memories personalize assessments without silencing critical warnings.
            </p>
          </div>

          <div className="mk-reveal">
            <h3 className="text-[18px] font-semibold tracking-tight">Built for Walrus Memory</h3>
            <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
              Walrus Memory is the intended persistence layer: decentralized storage for the context your copilot relies on. Here is where it stands today.
            </p>
            <ul className="mt-5 space-y-2.5">
              {STATUS.map((s) => (
                <li key={s.label} className="grid grid-cols-[auto_1fr] gap-3 rounded-lg border border-border bg-surface/70 px-4 py-3">
                  <Dot className={`mt-1.5 ${s.dot}`} />
                  <div>
                    <div className="text-[13px] font-medium">{s.label}</div>
                    <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{s.value}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[12.5px] leading-relaxed text-subtle">
              Memories are scoped to your browser session, not to a wallet. Store only non-sensitive information.
            </p>
          </div>
        </div>
      </Container>
    </Section>
  );
}
