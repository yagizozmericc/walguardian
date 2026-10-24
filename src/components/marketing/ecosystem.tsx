import { Container, Dot, Eyebrow, Heading, Section } from "./primitives";

const STACK = [
  {
    name: "Sui",
    role: "Blockchain network",
    body: "Wallet activity, balances and transactions come from the Sui network. Development and the demo use Sui Testnet.",
    status: "Testnet",
    dot: "bg-positive",
  },
  {
    name: "Tatum",
    role: "Blockchain data access",
    body: "Sui data is read through Tatum's Sui Testnet gRPC gateway and normalized before any analysis runs.",
    status: "Live on Testnet",
    dot: "bg-positive",
  },
  {
    name: "Walrus Memory",
    role: "Financial memory infrastructure",
    body: "The memory layer is integrated with the official Walrus Memory SDK. Live decentralized persistence is not yet verified.",
    status: "Demo runs on a labelled mock",
    dot: "bg-warning",
  },
  {
    name: "Gemini",
    role: "AI explanations",
    body: "Google Gemini writes cited explanations on the server. Without it, the copilot returns deterministic summaries.",
    status: "Optional",
    dot: "bg-subtle",
  },
];

export function Ecosystem() {
  return (
    <Section id="ecosystem" labelledBy="ecosystem-title" className="border-t border-border/60">
      <Container>
        <div className="mk-reveal flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Eyebrow>Technology</Eyebrow>
            <Heading id="ecosystem-title" className="mt-5 max-w-2xl">
              Built on the ecosystem.
            </Heading>
          </div>
          <p className="max-w-md text-[14px] leading-relaxed text-muted-foreground">Each layer is a separate adapter, so the status of every integration is explicit, including the ones still in progress.</p>
        </div>

        <ul className="mk-reveal mt-14 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {STACK.map((s) => (
            <li key={s.name} className="group flex flex-col bg-ink p-6 transition-colors hover:bg-surface/60">
              <div className="text-[22px] font-semibold tracking-[-0.02em]">{s.name}</div>
              <div className="mt-1 text-[13px] text-brand">{s.role}</div>
              <p className="mt-4 flex-1 text-[14px] leading-relaxed text-muted-foreground">{s.body}</p>
              <div className="mt-6 flex items-center gap-2 border-t border-border pt-4 text-[12px] text-subtle">
                <Dot className={s.dot} />
                {s.status}
              </div>
            </li>
          ))}
        </ul>
        <p className="mk-reveal mt-5 text-[12.5px] text-subtle">
          Walguardian is an independent project. Naming these technologies does not imply a partnership, endorsement or certification.
        </p>
      </Container>
    </Section>
  );
}
