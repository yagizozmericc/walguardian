# Guardian AI — Claude Code Instructions

## Project Overview

Guardian AI is a memory-powered onchain finance and security copilot built for the Tatum Total Recall Hackathon.

The product combines three core capabilities:

- **Protect:** Behavioral anomaly detection, transaction risk assessment, and security alerts.
- **Save:** Savings goals, progress tracking, and adaptive financial planning.
- **Invest:** Portfolio allocation analysis, investment strategy guidance, and rebalancing recommendations.

**Tatum** provides Sui blockchain data. **Walrus Memory** stores persistent user preferences, financial goals, decisions, and security feedback. The AI agent combines both to deliver personalized, explainable recommendations.

Guardian AI is a standalone web application, not a wallet. Do not build or fork a wallet.

## Source of Truth

Read these documents before implementing features:

- `docs/PRD.md` — Product requirements, feature priorities, user flows, and acceptance criteria.
- `docs/DESIGN.md` — Visual direction, design system, and UI/UX requirements.
- `docs/ARCHITECTURE.md` — Technical architecture and integration decisions.

If `ARCHITECTURE.md` does not exist, create it after inspecting the repository and verifying the required integrations.

When requirements conflict, prioritize explicit user instructions, then `PRD.md`, then `ARCHITECTURE.md`, then `DESIGN.md`. Ask for clarification when a conflict materially changes product behavior.

## Technology Stack

Preferred stack:

- Next.js App Router
- TypeScript with strict mode
- Tailwind CSS
- shadcn/ui
- Lucide icons
- Zod
- Tatum Sui RPC
- Walrus Memory
- Server-side LLM integration
- PostgreSQL and Drizzle ORM only when needed

Follow existing repository conventions where possible. Do not introduce unnecessary dependencies or infrastructure.

## Engineering Principles

1. **Real integrations first.** Use actual Tatum and Walrus APIs. Never silently substitute mocked responses.
2. **Verify before implementing.** Check current official documentation and installed SDK interfaces before writing integration code. Never invent methods, endpoints, or capabilities.
3. **Separate responsibilities.** Keep blockchain data retrieval, memory operations, AI orchestration, anomaly scoring, and financial calculations in separate modules.
4. **Deterministic calculations.** Calculate balances, allocation percentages, savings progress, and anomaly scores in code. Use the LLM for contextual reasoning and explanations.
5. **Explainability.** Every security alert and financial recommendation must have traceable supporting evidence.
6. **Type safety.** Use strict TypeScript, Zod validation, and explicit data contracts.
7. **Security by default.** Keep secrets server-side, validate external inputs, and never log sensitive credentials.
8. **Incremental delivery.** Implement and verify one functional vertical slice at a time.
9. **No unnecessary complexity.** Prefer straightforward, maintainable implementations suitable for a working hackathon MVP.

## Walrus Memory Rules

Walrus Memory is a first-class product dependency, not an optional logging system.

- Persist meaningful user preferences, goals, decisions, and feedback.
- Retrieve relevant memories before generating personalized assessments.
- Demonstrate that retrieved memories materially influence subsequent outputs.
- Preserve memory provenance and timestamps.
- Distinguish user-provided facts from AI-generated interpretations.
- Never assume Walrus-stored information is private by default.
- Protect sensitive user information and document storage, encryption, and deletion limitations.
- Do not claim successful persistence or retrieval without verifying the operation.

## Tatum Integration Rules

- Use Tatum Sui RPC for supported blockchain queries.
- Normalize blockchain responses into internal domain models.
- Handle pagination, rate limits, empty histories, and provider failures.
- Never invent balances, token prices, transaction histories, or contract risk information.
- Distinguish historical anomalies from real-time monitoring.
- Do not assume unsupported Tatum Wallet SDK features are available on Sui.

## Security & Financial Safety

- Behavioral anomalies are not proof of malicious activity.
- Keep anomaly scores explainable and deterministic.
- User feedback may personalize future assessments but must not automatically disable critical warnings.
- Treat public-address onboarding as watch-only; it does not establish wallet ownership.
- Do not execute transactions without explicit user authorization.
- Do not claim the application can block transactions initiated in external wallets.
- Do not promise investment returns or present speculative recommendations as guaranteed outcomes.
- Show data freshness, missing information, and calculation assumptions when relevant.

## Frontend Design

Use Anthropic's official `frontend-design` skill when available. Follow `docs/DESIGN.md` for detailed visual requirements.

The application should resemble a premium, institutional-grade fintech product.

Design references: Linear, Stripe Dashboard, Mercury, and Vercel.

Avoid generic AI-generated aesthetics, including purple gradients, excessive glassmorphism, glowing effects, oversized cards, decorative AI icons, and chatbot-dominated layouts.

Prioritize clear typography, professional tables, restrained colors, information density, consistent spacing, and purposeful interactions.

## Development Workflow

Before implementing a feature:

1. Read the relevant requirements and existing code.
2. Verify any external API or SDK assumptions.
3. Identify the smallest functional implementation.
4. Implement with appropriate validation and error handling.
5. Run type checks, linting, and relevant tests.
6. Verify the feature against its acceptance criteria.
7. Update documentation when architecture or behavior changes.

Do not rewrite unrelated code or introduce major architectural changes without a clear reason.

## Testing & Demo

Maintain tests for:

- Behavioral anomaly scoring
- Savings and allocation calculations
- Memory persistence and retrieval
- Recommendation personalization
- Provider error handling

Provide a reproducible demo demonstrating:

1. Real Sui blockchain data retrieved through Tatum.
2. A behavioral anomaly detected and explained.
3. Savings and investment goals created.
4. User feedback persisted through Walrus Memory.
5. A subsequent recommendation changed by retrieved memory.

Demo fixtures must be clearly labeled and separated from live integrations.

## Definition of Done

A feature is complete only when:

- Its primary user flow works.
- Real integrations have been verified where required.
- Loading, empty, and error states are handled.
- Relevant tests pass.
- The UI follows the design system.
- No unsupported functionality is presented as working.

## Communication

- Be concise and technically precise.
- State assumptions and blockers explicitly.
- Explain important architecture decisions and trade-offs.
- Report completed work and verification results after each implementation phase.
- Do not claim a feature is complete without testing it.

**Primary objective:** Deliver a polished, working MVP where Tatum provides onchain intelligence, Walrus provides persistent financial memory, and Guardian AI combines them into personalized security, savings, and investment guidance.