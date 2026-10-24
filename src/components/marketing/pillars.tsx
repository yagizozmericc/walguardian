import { cn } from "@/lib/utils";
import { Container, Eyebrow, Heading, Lede, Section } from "./primitives";
import { SavingsPreview, SecurityPreview, StrategyPreview } from "./previews/pillar-previews";

const PILLARS = [
  {
    id: "protect",
    index: "01",
    name: "Protect",
    title: "Understand the risks",
    body: "Each outgoing transaction is scored against your wallet's own history. Every signal says what was unusual and why, so you can judge it yourself.",
    points: [
      ["Transaction history analysis", "A behavioral baseline built from your past Sui activity."],
      ["Explainable anomaly signals", "Deterministic rules with the evidence behind every score."],
      ["Security reviews and feedback", "Mark activity as expected or suspicious. Critical signals are never cleared automatically."],
      ["Recipient and transaction context", "First-time recipients, new packages and outflow size in context."],
    ],
    note: "Anomalies are deviations from your history, not proof of fraud. Analysis is historical, not real-time monitoring.",
    Preview: SecurityPreview,
  },
  {
    id: "save",
    index: "02",
    name: "Save",
    title: "Give every asset a purpose",
    body: "Set aside funds for a target or keep a minimum reserve. Walguardian tracks progress against your live balance, not a separate account.",
    points: [
      ["Savings goals", "Targets with a date, or reserves you never want to go below."],
      ["Earmarked balances", "Funds you explicitly assign to a goal, checked against what you hold."],
      ["Reserve tracking", "See when spending would take a reserve below its minimum."],
      ["Progress and contribution planning", "Monthly contributions needed and an estimated completion date."],
    ],
    note: "Earmarks are a planning layer. Funds stay in your wallet and are never moved.",
    Preview: SavingsPreview,
  },
  {
    id: "invest",
    index: "03",
    name: "Invest",
    title: "See the bigger picture",
    body: "Compare what you hold with the allocation you want. Values use reference prices you set, so the assumptions are always visible.",
    points: [
      ["Portfolio allocation", "SUI, stablecoins and other assets as a share of the whole."],
      ["Target strategies", "Your target mix and the drift band you are comfortable with."],
      ["Allocation drift", "How far each asset class has moved from its target."],
      ["Illustrative rebalancing scenarios", "What it would take to return to target. Never executed."],
    ],
    note: "Testnet assets have no market price. Scenarios are illustrations, not investment advice.",
    Preview: StrategyPreview,
  },
] as const;

export function Pillars() {
  return (
    <Section id="pillars" labelledBy="pillars-title" className="border-t border-border/60 bg-background/40">
      <Container>
        <div className="mk-reveal max-w-3xl">
          <Eyebrow>Protect · Save · Invest</Eyebrow>
          <Heading id="pillars-title" className="mt-5">
            One wallet. Three layers of intelligence.
          </Heading>
          <Lede className="mt-6">
            Security, savings and investing usually live in different tools. Walguardian analyzes them together, from the same on-chain data.
          </Lede>
        </div>

        <div className="mt-20 space-y-24 sm:mt-24 sm:space-y-32">
          {PILLARS.map((p, i) => (
            <article key={p.id} id={p.id} aria-labelledby={`${p.id}-title`} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <div className={cn("mk-reveal", i % 2 === 1 && "lg:order-2")}>
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[12px] text-subtle">{p.index}</span>
                  <span className="text-[13px] font-medium tracking-wide text-brand">{p.name}</span>
                </div>
                <h3 id={`${p.id}-title`} className="mk-heading mt-3 text-[clamp(1.75rem,3.2vw,2.5rem)] leading-[1.08] font-semibold tracking-[-0.03em]">
                  {p.title}
                </h3>
                <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-muted-foreground">{p.body}</p>
                <dl className="mt-8 max-w-lg divide-y divide-border border-y border-border">
                  {p.points.map(([term, desc]) => (
                    <div key={term} className="grid gap-1 py-3.5 sm:grid-cols-[minmax(0,13rem)_1fr] sm:gap-6">
                      <dt className="text-[14px] font-medium">{term}</dt>
                      <dd className="text-[14px] leading-snug text-muted-foreground">{desc}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 max-w-lg text-[12.5px] leading-relaxed text-subtle">{p.note}</p>
              </div>
              <div className={cn("mk-reveal", i % 2 === 1 && "lg:order-1")}>
                <p.Preview />
              </div>
            </article>
          ))}
        </div>
      </Container>
    </Section>
  );
}
