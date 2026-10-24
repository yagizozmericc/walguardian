import { Container, Eyebrow, Heading, Lede, Section } from "./primitives";

const PRINCIPLES = [
  ["Read-only blockchain analysis", "Walguardian reads public on-chain data. Entering an address is watch-only and does not prove ownership."],
  ["Simulation-only transfer assessments", "Transfer check evaluates hypothetical transfers. It never executes them."],
  ["No signing or broadcasting", "No private keys, no wallet connection and no transactions sent on your behalf."],
  ["Deterministic financial calculations", "Balances, progress, allocation and anomaly scores are computed in code, not by a language model."],
  ["Evidence-backed AI explanations", "Every AI claim cites its source. Unsupported claims and unknown figures are flagged."],
  ["Explicit unknowns and limitations", "Missing data, estimates and assumptions are shown, never filled in."],
  ["Session-based memory isolation", "Memories are scoped to a signed browser session, not shared across users."],
];

export function Trust() {
  return (
    <Section id="security" labelledBy="trust-title" className="border-t border-border/60 bg-background/40">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div className="mk-reveal lg:sticky lg:top-28 lg:self-start">
            <Eyebrow>Security and transparency</Eyebrow>
            <Heading id="trust-title" className="mt-5">
              Intelligence without surrendering control.
            </Heading>
            <Lede className="mt-6">Walguardian helps you decide. It never acts for you, and it tells you what it doesn&apos;t know.</Lede>
          </div>

          <ol className="mk-reveal divide-y divide-border border-y border-border">
            {PRINCIPLES.map(([title, body], i) => (
              <li key={title} className="group grid grid-cols-[2.5rem_1fr] gap-4 py-5 transition-colors">
                <span className="font-mono text-[12px] text-subtle transition-colors group-hover:text-brand">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="text-[15.5px] font-medium">{title}</h3>
                  <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </Section>
  );
}
