import { ShieldAlert } from "lucide-react";
import { Container, Eyebrow, Heading, Lede, Section } from "./primitives";
import { TransferPreview } from "./previews/transfer-preview";

const PILLARS = [
  ["Protect", "Transaction and recipient risk signals from on-chain history."],
  ["Save", "What happens to your balance, earmarks and reserves."],
  ["Invest", "How your allocation moves against your targets."],
  ["Memory", "Relevant notes, reviews and decisions you saved earlier."],
];

/** Category names and hints are the ones the Transfer check page uses. */
const CATEGORIES = [
  ["Confirmed facts", "Deterministic from balances and your saved goals"],
  ["Historical patterns", "Deviations from this wallet's on-chain history"],
  ["Your preferences and decisions", "From your settings and memory; not verified evidence"],
  ["Unknowns", "What could not be checked"],
];

export function TransferCheck() {
  return (
    <Section id="transfer-check" labelledBy="transfer-title" className="border-t border-border/60 bg-background/40">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-end lg:gap-16">
          <div className="mk-reveal">
            <Eyebrow>Pre-transaction intelligence</Eyebrow>
            <Heading id="transfer-title" className="mt-5">
              Think before you transfer.
            </Heading>
            <Lede className="mt-6">
              Enter a hypothetical transfer and Walguardian evaluates it across all four layers before you go anywhere near a signature.
            </Lede>
          </div>
          <ol className="mk-reveal grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
            {PILLARS.map(([name, text], i) => (
              <li key={name} className="bg-ink p-4">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[10.5px] text-subtle">0{i + 1}</span>
                  <span className="text-[14px] font-medium">{name}</span>
                </div>
                <p className="mt-1.5 text-[12.5px] leading-snug text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="mk-reveal mt-14">
          <TransferPreview />
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
          <div className="mk-reveal">
            <h3 className="text-[18px] font-semibold tracking-tight">An explainable verdict</h3>
            <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
              Deterministic rules set the verdict. Each finding is labelled by how much weight it can bear, so a preference is never presented as evidence. The AI explains the result but never decides it.
            </p>
            <dl className="mt-6 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
              {CATEGORIES.map(([t, d]) => (
                <div key={t} className="bg-ink px-4 py-3.5">
                  <dt className="text-[13.5px] font-medium">{t}</dt>
                  <dd className="mt-0.5 text-[12.5px] text-subtle">{d}</dd>
                </div>
              ))}
            </dl>
          </div>

          <aside className="mk-reveal self-start rounded-xl border border-border bg-surface/70 p-5" aria-label="Simulation notice">
            <div className="flex items-center gap-2 text-[14px] font-medium">
              <ShieldAlert className="size-4 text-brand" strokeWidth={1.75} />
              A simulation, not a transaction
            </div>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
              Transfer check never signs, sends or broadcasts anything. Gas is a historical estimate, and a &ldquo;no issues found&rdquo; result never means a transfer or recipient is safe. You make the final call in your own wallet.
            </p>
          </aside>
        </div>
      </Container>
    </Section>
  );
}
