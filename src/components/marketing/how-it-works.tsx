import { Archive, Database, MessageSquareText, ScanSearch, UserCheck } from "lucide-react";
import { Container, Eyebrow, Heading, Lede, Section } from "./primitives";

const STEPS = [
  { icon: Database, title: "Read", body: "Wallet balances and activity from Sui Testnet, through Tatum.", tags: ["Read-only"] },
  { icon: ScanSearch, title: "Analyze", body: "Deterministic engines score, track and compare in code.", tags: ["Protect", "Save", "Invest"] },
  { icon: Archive, title: "Recall", body: "Relevant preferences, goals and past decisions are retrieved.", tags: ["Memory"] },
  { icon: MessageSquareText, title: "Explain", body: "The AI writes grounded explanations with a citation for every claim.", tags: ["Cited"] },
  { icon: UserCheck, title: "Decide", body: "You evaluate your next move with the full picture.", tags: ["Your call"] },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works" labelledBy="how-title" className="border-t border-border/60 bg-background/40">
      <Container>
        <div className="mk-reveal max-w-3xl">
          <Eyebrow>How it works</Eyebrow>
          <Heading id="how-title" className="mt-5">
            From on-chain activity to informed decisions.
          </Heading>
          <Lede className="mt-6">Five steps, each one inspectable. Calculations happen in code; language models only explain them.</Lede>
        </div>

        <div className="mk-reveal relative mt-16">
          {/* Connector: horizontal through icon centres on desktop, vertical on mobile. */}
          <svg className="absolute top-5 left-[10%] hidden h-px w-[80%] overflow-visible lg:block" aria-hidden>
            <line x1="0" y1="0" x2="100%" y2="0" className="mk-flow stroke-brand/50" strokeWidth="1.25" />
          </svg>
          <svg className="absolute top-5 bottom-5 left-5 w-px overflow-visible lg:hidden" aria-hidden>
            <line x1="0" y1="0" x2="0" y2="100%" className="mk-flow stroke-brand/50" strokeWidth="1.25" />
          </svg>

          <ol className="relative grid gap-8 lg:grid-cols-5 lg:gap-6">
            {STEPS.map(({ icon: Icon, title, body, tags }, i) => (
              <li key={title} className="grid grid-cols-[40px_1fr] gap-4 lg:flex lg:flex-col lg:items-center lg:text-center">
                <span className="relative flex size-10 items-center justify-center rounded-lg border border-border bg-ink text-brand transition-colors hover:border-brand/40">
                  <Icon className="size-[18px]" strokeWidth={1.6} />
                </span>
                <div className="lg:mt-5">
                  <div className="flex items-baseline gap-2 lg:justify-center">
                    <span className="font-mono text-[11px] text-subtle">0{i + 1}</span>
                    <h3 className="text-[16px] font-semibold tracking-tight">{title}</h3>
                  </div>
                  <p className="mt-2 text-[14px] leading-snug text-muted-foreground lg:mx-auto lg:max-w-[210px]">{body}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5 lg:justify-center">
                    {tags.map((t) => (
                      <span key={t} className="rounded-md border border-border bg-surface/70 px-2 py-0.5 text-[11.5px] text-muted-foreground">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </Section>
  );
}
