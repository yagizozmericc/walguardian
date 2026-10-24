import { Container, Eyebrow, Heading, Lede, Section } from "./primitives";
import { CopilotDemo } from "./copilot-demo";

const SOURCES = [
  ["Onchain", "Verified Sui data retrieved through Tatum"],
  ["Calculated", "Results from deterministic Protect, Save and Invest engines"],
  ["Your setting", "Goals, targets and preferences you configured"],
  ["Memory", "Notes, reviews and decisions you chose to save"],
];

export function Copilot() {
  return (
    <Section id="copilot" labelledBy="copilot-title" className="border-t border-border/60">
      <Container>
        <div className="mk-reveal grid gap-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-end lg:gap-16">
          <div>
            <Eyebrow>AI copilot</Eyebrow>
            <Heading id="copilot-title" className="mt-5">
              Ask better questions about your money.
            </Heading>
          </div>
          <Lede>
            The copilot sits beside your data, not in place of it. Every claim in an answer cites where it came from, so you can check it before you act.
          </Lede>
        </div>

        <div className="mk-reveal mt-14">
          <CopilotDemo />
        </div>

        <div className="mk-reveal mt-14 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {SOURCES.map(([label, text]) => (
            <div key={label} className="bg-ink px-5 py-4">
              <div className="text-[10.5px] font-medium tracking-[0.08em] text-brand uppercase">{label}</div>
              <p className="mt-1.5 text-[13.5px] leading-snug text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
        <p className="mk-reveal mt-5 max-w-3xl text-[13px] leading-relaxed text-subtle">
          The AI explains; it does not verify facts on its own or predict outcomes. Claims without a valid citation are flagged, figures not found in the data are marked, and the copilot falls back to a deterministic summary when the model is unavailable. Nothing it says is financial advice.
        </p>
      </Container>
    </Section>
  );
}
