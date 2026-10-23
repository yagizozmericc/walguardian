# Build an MVP: Guardian AI — Memory-Powered Onchain Finance & Security Copilot

You are a senior full-stack Web3 engineer and AI systems architect. Build a working, demo-ready MVP for a hackathon.

## 1. Product Overview

**Product name:** Guardian AI

**Tagline:** Protect your assets. Grow your savings. Remember your goals.

Guardian AI is a personalized onchain finance and security copilot built around three pillars:

- **Protect:** Detect suspicious onchain activity and behavioral anomalies.
- **Save:** Help users set and track savings goals.
- **Invest:** Analyze portfolio allocations and provide personalized strategy guidance.

The product's main differentiator is **persistent financial memory**. It remembers users' financial goals, preferences, past decisions, security feedback, and the reasons behind those decisions.

The AI agent uses this memory to improve future security assessments and financial recommendations.

### Core Integrations

- **Tatum Sui RPC:** Blockchain data, wallet balances, transaction history, and onchain activity.
- **Walrus Memory:** Persistent storage and retrieval of user-specific financial and security memories.
- **AI LLM:** Personalized recommendations, anomaly explanations, and financial reasoning.
- **Sui Wallet:** Optional wallet connection and user-authorized transaction signing.

Do not build or fork a wallet. Guardian AI is a standalone web application.

## 2. Technology Stack

Use:

- Next.js with App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Lucide icons
- Node.js server-side services
- Zod for validation
- Tatum Sui RPC
- Walrus Memory integration
- An LLM provider through environment variables
- PostgreSQL with Drizzle ORM if persistent application data is necessary

Use a clean, modular architecture. Separate blockchain integrations, memory services, AI logic, risk scoring, and financial calculations.

Prioritize working integrations over mocked behavior.

## 3. User Onboarding

Users should be able to enter a public Sui wallet address and begin using the application without connecting or signing with their wallet.

Validate the address and retrieve its onchain data through Tatum.

After loading the wallet, collect:

- Primary financial goal: Saving, Investing, or Capital Preservation
- Risk preference: Conservative, Balanced, or Growth
- Target stablecoin allocation
- Monthly savings target
- Savings goal amount and target date
- Liquidity preferences

Store these preferences as structured memory records using Walrus Memory.

Support updating preferences and retaining relevant history.

Do not assume that entering a public address proves wallet ownership. For the MVP, distinguish watch-only sessions from verified wallet ownership. Sensitive preferences and memories must not be exposed merely because someone knows an address.

## 4. Protect — Security & Anomaly Detection

Implement a behavioral anomaly detection engine.

### Historical Behavioral Profile

Analyze available historical onchain activity and calculate:

- Typical transfer amounts
- Median and percentile transfer values
- Frequently used recipient addresses
- Transaction frequency
- Previously interacted Move packages
- Unusual activity patterns
- Recent changes in wallet behavior

Handle sparse or unavailable history gracefully.

### Anomaly Detection

Detect:

1. Transfers significantly larger than the user's historical baseline.
2. Transfers to previously unseen recipients.
3. Unusual transaction frequency.
4. First-time interactions with Move packages.
5. Sudden significant portfolio outflows.
6. Transactions that deviate from known behavioral patterns.

Generate an explainable anomaly score from 0 to 100.

Use deterministic, configurable scoring rules for the initial MVP. The LLM should explain the findings, not invent numerical risk scores.

Distinguish behavioral anomalies from confirmed malicious activity. Do not claim an address or contract is malicious without supporting evidence.

### Security Center

Build a Security Center displaying:

- Overall security status
- Recent anomalies
- Severity levels
- Affected transactions
- Reasons for each alert
- Relevant transaction hashes
- User feedback controls

Users can mark alerts as:

- Expected activity
- Suspicious activity
- Not sure

Allow users to explain their decisions.

Store feedback through Walrus Memory and use it in subsequent assessments.

Never allow feedback alone to suppress critical security warnings.

### Monitoring Scope

For MVP, implement historical analysis and manual refresh.

If feasible, implement periodic backend polling for new transactions.

Do not claim real-time monitoring unless it is implemented.

## 5. Save — Savings Intelligence

Implement a savings management module.

### Savings Goals

Users can create goals with:

- Goal name
- Target amount
- Asset denomination
- Target date
- Monthly contribution target
- Optional notes

Examples:

- Save 2,000 USDC in six months.
- Maintain a 1,000 USDC emergency reserve.
- Keep at least 40% of the portfolio in stablecoins.

### Goal Tracking

Display:

- Current progress
- Remaining amount
- Required monthly contribution
- Target date
- Progress percentage
- Estimated completion based on explicitly defined assumptions

Be careful with goal accounting. A wallet balance does not automatically represent funds allocated to a savings goal. Let users explicitly associate eligible assets or balances with a goal.

### Adaptive Savings Recommendations

Generate recommendations when:

- Savings progress falls behind schedule.
- Portfolio changes threaten an emergency reserve.
- The user's liquidity preferences change.
- The user provides new financial context.

Save important user decisions and explanations as memories.

## 6. Invest — Portfolio Strategy Guidance

Implement a portfolio analytics and strategy module.

### Portfolio Overview

Retrieve balances through Tatum Sui RPC.

Display:

- Token balances
- Asset symbols
- Portfolio composition
- Stablecoin allocation
- SUI allocation
- Other token allocations

Use a documented price source for fiat valuations. If prices are unavailable, show token-denominated balances and explicitly label valuations as unavailable.

Do not invent prices or APYs.

### Investment Preferences

Users can define:

- Target asset allocation
- Risk tolerance
- Investment horizon
- Minimum stablecoin reserve
- Liquidity constraints

### Strategy Guidance

Generate:

- Target allocation comparisons
- Allocation drift alerts
- Rebalancing scenarios
- Liquidity-related warnings
- Goal-aware transaction suggestions

For the MVP, prioritize transparent allocation mathematics and user-defined constraints rather than speculative asset recommendations.

The agent should explain why a proposed action aligns or conflicts with the user's preferences.

Do not automatically execute trades or promise returns.

## 7. Walrus Memory — Core Differentiator

This is the most important part of the project.

Implement a real Walrus Memory integration. Before coding, inspect the current official Walrus Memory SDK/API documentation and follow the supported integration approach.

Do not replace Walrus Memory with a local database while claiming successful integration.

Create a memory service with clear interfaces for:

- Writing memories
- Retrieving relevant memories
- Listing memory history
- Linking memories to the correct user
- Handling memory updates or supersession
- Handling integration failures

### Memory Categories

**Profile Memory**
Risk preferences, liquidity requirements, and investment horizon.

**Goal Memory**
Savings goals, allocation targets, and changes to those goals.

**Behavioral Memory**
Important observations about historical wallet activity.

**Security Decision Memory**
User feedback about unusual or suspicious transactions.

**Investment Decision Memory**
Accepted or rejected strategy recommendations.

**Reasoning Memory**
User-provided explanations for financial decisions.

### Memory Structure

Use structured records with fields such as:

- Memory ID
- User or session identifier
- Wallet address
- Memory category
- Content
- Source
- Timestamp
- Related transaction or recommendation ID
- Relevant metadata
- Superseded status, if supported

Follow the actual Walrus Memory API schema rather than assuming these fields are native.

### Memory-Aware Agent

Before generating a recommendation:

1. Retrieve current onchain information from Tatum.
2. Retrieve relevant user memories from Walrus.
3. Calculate objective financial and security signals.
4. Combine these signals into structured agent context.
5. Generate a recommendation and explanation.
6. Allow the user to provide feedback.
7. Persist meaningful feedback through Walrus.

Memory must materially affect the output.

A critical demo requirement is to show the same or similar situation evaluated differently after the user provides new context that is saved and retrieved from Walrus.

Do not treat AI-generated inferences as verified user preferences.

### Privacy

Financial preferences and user explanations may be sensitive.

Investigate Walrus Memory's actual storage and access-control model. Do not assume stored records are private. Encrypt sensitive content before persistence when necessary, manage keys securely, and document the limitations of deletion and retention.

For the demo, use test wallets and non-sensitive sample data.

## 8. AI Copilot

Build a conversational AI interface that can answer questions such as:

- Why was this transaction flagged?
- Is this transfer unusual for my wallet?
- How close am I to my savings goal?
- How much should I save monthly to reach my target?
- How far is my portfolio from my target allocation?
- Why did I reject a similar strategy previously?
- How would this transfer affect my savings and liquidity goals?

The AI must use real data from Tatum and retrieved memories from Walrus.

It must clearly distinguish:

- Verified onchain facts
- Calculated metrics
- User-provided preferences
- Historical memories
- AI-generated suggestions

Avoid hallucinating balances, transactions, financial performance, or remembered decisions.

## 9. Unified Transaction Intelligence

Implement a transaction assessment feature that combines all three product pillars.

A user can enter a hypothetical transfer:

- Asset
- Amount
- Recipient

The system evaluates:

**Protect:** Is this unusual relative to historical behavior?

**Save:** Would the transfer negatively affect an existing savings goal or emergency reserve?

**Invest:** Would the transfer violate the user's allocation or liquidity preferences?

**Memory:** Has the user previously made or rejected similar decisions, and why?

Display a unified assessment with individual findings and an overall recommendation.

For the MVP, this can be a transaction planning and simulation interface. Do not imply that it can block transactions initiated in external wallets.

## 10. Application Pages

Build five primary pages:

### Overview

- Portfolio summary
- Savings progress
- Security status
- Recent alerts
- Personalized AI insights

### Security Center

- Behavioral profile
- Anomaly history
- Risk explanations
- User feedback

### Savings

- Savings goals
- Goal progress
- Monthly contribution planning
- Adaptive recommendations

### Investment Strategy

- Portfolio allocation
- Target allocation
- Allocation drift
- Rebalancing scenarios

### AI Copilot

- Conversational interface
- Personalized financial guidance
- Memory-aware responses
- Transaction assessment

Add a Financial Memory section or panel where users can inspect the memories used by the agent.

## 11. UI/UX Requirements

Create a polished fintech dashboard suitable for a hackathon demo.

Design direction:

- Modern, minimal, premium fintech aesthetic
- Dark mode
- Clear typography
- Responsive layouts
- Professional data visualizations
- High-quality loading, empty, and error states
- Distinct visual treatments for security warnings and financial insights

Do not create a generic chatbot-only application. The main product should feel like a real financial dashboard with an embedded intelligent assistant.

Avoid cluttered layouts and unnecessary decorative elements.

## 12. Hackathon Demo Requirements

The MVP must support the following end-to-end scenario:

**Step 1 — Wallet Analysis**

Enter a Sui address and retrieve actual blockchain data through Tatum.

**Step 2 — Financial Onboarding**

Create savings goals and portfolio preferences.

Persist them using Walrus Memory.

**Step 3 — Security Detection**

Analyze transaction history and identify an explainable behavioral anomaly.

**Step 4 — User Feedback**

Mark an anomaly as expected and provide an explanation.

Persist the feedback in Walrus.

**Step 5 — Personalized Transaction Assessment**

Evaluate a hypothetical transaction against security behavior, savings goals, and investment preferences.

**Step 6 — Memory Demonstration**

Retrieve previously saved feedback and show how it changes a subsequent assessment or recommendation.

Demonstrate at least 10 meaningful memory records written and retrieved through the real integration, if this remains a requirement in the current hackathon rules.

## 13. Engineering Requirements

- Strong TypeScript typing
- Modular services
- Secure environment-variable management
- No API keys in client-side code
- Zod request validation
- Error handling and structured logging
- Rate limiting for expensive AI endpoints
- Clear separation between real integrations and demo fixtures
- Unit tests for anomaly scoring and financial calculations
- Integration tests for Tatum and Walrus adapters where feasible
- README with setup and deployment instructions
- `.env.example`
- Demo seed scripts for reproducible scenarios

Never silently fall back to mock blockchain or memory data. If a provider is unavailable, show an explicit integration error or clearly labeled demo mode.

## 14. Implementation Order

Build incrementally in this order:

**Phase 1 — Foundation**
Set up the application, architecture, environment configuration, and UI design system.

**Phase 2 — Tatum Integration**
Implement Sui address validation, balances, transaction retrieval, and portfolio normalization.

**Phase 3 — Security Engine**
Implement behavioral profiling, anomaly scoring, and Security Center.

**Phase 4 — Financial Planning**
Implement onboarding, savings goals, allocation analysis, and deterministic financial calculations.

**Phase 5 — Walrus Memory**
Implement real memory persistence and retrieval for goals, preferences, and user feedback.

**Phase 6 — AI Copilot**
Connect the LLM to verified blockchain data, calculations, and retrieved memories.

**Phase 7 — Unified Intelligence**
Build transaction assessment across Protect, Save, Invest, and Memory.

**Phase 8 — Demo and Testing**
Create reproducible demo scenarios, verify integrations, and polish the user experience.

## 15. Definition of Done

The MVP is complete when:

- A real Sui address can be analyzed through Tatum.
- Portfolio and transaction information is displayed accurately.
- The security engine can explain unusual activity.
- Users can create savings and allocation goals.
- Users can provide security and investment feedback.
- Walrus Memory actually persists and retrieves meaningful records.
- Retrieved memories change subsequent agent assessments.
- The AI can explain findings using verified context.
- The unified transaction assessment works.
- The application is demo-ready with a documented setup.

## Final Instructions

Start by inspecting the existing repository and the current official Tatum, Sui, and Walrus Memory documentation.

Identify API capabilities and limitations before implementing integrations.

Do not invent SDK methods, endpoints, or unsupported blockchain features.

Create a concise implementation plan and project structure, then begin coding.

Make pragmatic MVP decisions without overengineering.

**Most importantly: Build a working product, not just a visually impressive mockup. The central innovation must be demonstrable: Tatum provides onchain intelligence, Walrus provides persistent memory, and Guardian AI combines them to deliver personalized security and financial guidance.**