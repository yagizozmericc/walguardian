## Mandatory UI/UX Design Skill and Visual Direction

Use Anthropic's official `frontend-design` skill throughout the implementation. If the skill is not installed, install or enable it before beginning frontend development.

**Design objective:** Build Guardian AI as a premium, institutional-grade financial intelligence platform. The interface must look like a product designed by an experienced fintech product design team, not a generic AI-generated dashboard.

### Visual references

Take inspiration from the design quality, information hierarchy, typography, and interaction patterns of:

- Linear — precision, navigation, and restrained interface design.
- Stripe Dashboard — financial data presentation and professional visual hierarchy.
- Mercury — modern banking experience and clarity.
- Vercel — refined components and minimal visual noise.

Do not directly copy these products.

### Design direction

- Use a sophisticated, neutral palette with a restrained accent color.
- Prefer an off-white or carefully balanced dark interface rather than a generic neon-dark AI aesthetic.
- Use professional typography with excellent readability and tabular numbers for financial metrics.
- Prioritize whitespace, alignment, and clear information hierarchy.
- Use subtle borders and minimal shadows.
- Design compact, information-rich portfolio tables and security activity feeds.
- Use charts only when they communicate meaningful financial information.
- Treat security alerts as serious financial events, not decorative notifications.
- Keep AI assistance embedded naturally in the product rather than making everything look like a chatbot.

### Avoid generic AI aesthetics

Strictly avoid:

- Purple/pink gradients and glowing backgrounds.
- Excessive glassmorphism.
- Oversized rounded cards everywhere.
- Repetitive grids of identical KPI cards.
- Decorative AI sparkles and robot illustrations.
- Unnecessary animations.
- Emoji-heavy interfaces.
- Generic dashboard templates.
- Excessive badges and colored status indicators.
- Large amounts of filler text.

### Product-specific UI requirements

**Overview:** A professional financial command center with portfolio valuation, savings progress, recent security activity, and prioritized insights.

**Security Center:** An investigation-oriented interface with anomaly severity, transaction details, historical behavioral context, and clear feedback actions.

**Savings:** A focused goal-planning experience with progress visualization, contribution schedules, and projected outcomes.

**Investment Strategy:** Portfolio allocation, target comparisons, and rebalancing scenarios presented like a serious investment analytics product.

**AI Copilot:** A contextual assistant integrated into the dashboard. Prefer an expandable side panel over a full-screen generic chat interface.

**Financial Memory:** A clean, auditable history of remembered goals, user decisions, and feedback, including the source and timestamp of each memory.

### Design workflow

Before implementing the frontend:

1. Use the `frontend-design` skill to define the design direction.
2. Establish a consistent design system: typography, colors, spacing, borders, tables, and charts.
3. Create the application shell and primary navigation.
4. Implement the Overview and Security Center first.
5. Apply the same design system consistently across all remaining screens.
6. Review the rendered UI at desktop and mobile sizes and refine it before completion.

Make deliberate design decisions. Prioritize credibility, usability, visual restraint, and financial information density.

**Final quality bar:** Guardian AI should feel like a production-ready fintech SaaS application that a bank, investment platform, or professional crypto user could trust visually. It should not look like a hackathon prototype or an AI-generated landing page.