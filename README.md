# Freedi: Scalable Deliberative Democracy Platform

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](./LICENSE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb)](https://react.dev/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-orange)](https://firebase.google.com/)
[![GitHub stars](https://img.shields.io/github/stars/delib-org/Freedi-app)](https://github.com/delib-org/Freedi-app/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/delib-org/Freedi-app)](https://github.com/delib-org/Freedi-app/network)

Freedi is an open-source platform revolutionizing collective decision-making. It enables groups of any size to collaborate, evaluate ideas, and build consensus through continuous feedback—without the pitfalls of traditional voting. Powered by a novel algorithm and real-time tools, Freedi turns chaotic discussions into structured, inclusive deliberations.

Whether you're drafting policies, brainstorming in teams, or running public consultations, Freedi helps discover better solutions faster. Built for scalability and accessibility, it's already proven in real-world scenarios from quick naming decisions to complex social charters.

**[Try the Demo](https://freedi.tech/demo)** | **[Live App](https://freedi.tech)** | **[Join the Community](https://github.com/delib-org/Freedi-app/discussions)**

---

## Table of Contents

- [Why Freedi?](#why-freedi)
- [How It Works](#how-it-works)
- [The Consensus Algorithm](#the-consensus-algorithm)
- [Key Features](#key-features)
- [Sub-Apps](#sub-apps)
- [Real-World Impact](#real-world-impact)
- [Technical Overview](#technical-overview)
- [Getting Started](#getting-started)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Limitations and Future Work](#limitations-and-future-work)
- [For Researchers](#for-researchers)
- [License](#license)

---

## Why Freedi?

In large groups, decision-making often favors hierarchies or simple votes, leading to underrepresented voices, polarization, and suboptimal outcomes. Traditional voting mechanisms exacerbate these problems:

- **Binary choices** reduce complex preferences to yes/no
- **Fixed option sets** prevent discovery of better solutions
- **Winner-take-all outcomes** incentivize polarization rather than consensus-seeking

Freedi addresses this by drawing from deliberative democracy principles:

| Principle | Traditional Voting | Freedi Approach |
|-----------|-------------------|-----------------|
| **Participation** | Fixed options only | Anyone can propose ideas anytime |
| **Expression** | Binary yes/no | Continuous scale capturing intensity |
| **Feedback** | Results after voting closes | Real-time consensus guides iteration |
| **Outcome** | Winner takes all | Broad agreement emerges naturally |

This creates adaptive, inclusive processes that scale from 10 to 10,000+ participants, reducing bias and fostering collective wisdom.

## How It Works

Freedi's core is a unified "statement" model for hierarchical discussions (groups > questions > options > details). The process:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   PROPOSE   │ --> │  EVALUATE   │ --> │  AGGREGATE  │ --> │   ITERATE   │
│             │     │             │     │             │     │             │
│ Create open │     │ Rate -1 to  │     │  Algorithm  │     │ Rankings    │
│ statements  │     │ +1 scale    │     │  computes   │     │ inspire new │
│ or refine   │     │ (updatable) │     │  consensus  │     │ proposals   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

1. **Propose**: Create open statements or refinements—no fixed options
2. **Evaluate**: Rate each proposal on a -1 (oppose) to +1 (support) scale—one vote per person, updateable anytime
3. **Aggregate**: The consensus algorithm computes a score visible to all participants in real-time
4. **Iterate**: Live rankings inspire better proposals until consensus emerges

## The Consensus Algorithm

At the core of Freedi lies the **Consensus Algorithm**—a scoring mechanism that provides a statistically principled estimate of collective agreement.

### The Formula

```
Consensus Score = Mean - SEM
```

Where:
- **Mean** = average of all evaluations (range: -1 to +1)
- **SEM** (Standard Error of the Mean) = σ_adjusted / √n
- **σ_adjusted** = max(observed standard deviation, 0.5) — the uncertainty floor
- **n** = number of unique evaluators

### Why This Formula?

The algorithm resolves a fundamental tension in preference aggregation:

| Problem | Simple Mean | Sum/Count | **Mean - SEM** |
|---------|-------------|-----------|----------------|
| Small group with perfect agreement | Overvalued | Invisible | Appropriately uncertain |
| Large group with moderate agreement | Undervalued | Dominates | Fairly weighted |
| New proposals | Equal to established | Cannot compete | Can grow naturally |
| High variance (polarization) | Hidden | Hidden | Penalized appropriately |

**Key properties:**
- **Penalizes small samples**: With few evaluations, SEM is large, reducing the score
- **Rewards consistency**: High variance increases SEM, lowering scores even with high mean support
- **Allows new proposals to compete**: As evaluations accumulate, SEM decreases naturally
- **Clear statistical interpretation**: The score represents a conservative estimate of true population support

### The Uncertainty Floor

To prevent manipulation by small unanimous groups (the "Zero Variance Loophole"):

```
σ_adjusted = max(observed standard deviation, 0.5)
```

This ensures small samples with zero variance are treated as uncertain, while large samples with genuine agreement naturally exceed the floor.

> **Deep Dive**: See [Consensus Scoring Details](./docs/features/CONSENSUS_SCORING_UPDATE.md) for full implementation.

## Key Features

### Core Deliberation Tools

| Feature | Description |
|---------|-------------|
| **Real-time collaboration** | WebSocket updates for synced voting and edits |
| **AI assistance** | Gemini/OpenAI for proposal refinement and summaries |
| **Hierarchical nesting** | Unlimited depth with full ancestry tracking |
| **Multi-stage processes** | Structured deliberation phases with chat integration |
| **Similar idea detection** | Vector search prevents duplicate proposals |

### Visualization & Insights

| Feature | Description |
|---------|-------------|
| **Interactive mind maps** | Visual hierarchy of discussions |
| **Consensus charts** | Real-time trend visualization |
| **Polarization tracking** | Identify divisive proposals |
| **Demographic filters** | Analyze consensus across groups |
| **Export options** | JSON, SVG, PNG for reports |

### Platform-Wide

| Feature | Description |
|---------|-------------|
| **Progressive Web App** | Install on any device with offline support |
| **Accessibility** | WCAG AA, screen readers, keyboard nav |
| **RTL Support** | Full Hebrew and Arabic support |
| **Notifications** | Grouped, customizable, with quiet hours |
| **Security** | Role-based access, anti-spam tools |

## Sub-Apps

Freedi is a monorepo with specialized sub-apps that extend the main deliberation platform. These build on shared components while addressing specific use cases.

### Mass Consensus (`/apps/mass-consensus`)

A Next.js-based sub-app for quick, anonymous consensus gathering at scale.

**How it fits**: Simplifies the core deliberation process using a 5-point scale (instead of continuous -1 to +1) with AI-generated suggestions for rapid input. Ideal when deep hierarchy is overkill—like public polls or event feedback.

| Feature | Description |
|---------|-------------|
| Server-side rendering | Near-instant page loads (FCP < 0.8s) |
| No login required | Immediate anonymous participation |
| AI suggestions | Gemini-powered proposal improvements |
| Results integration | Feed back into main app discussions |

**Use Case**: A community uses the main app for in-depth policy drafting, then deploys Mass Consensus for a quick vote on final options.

### Freedi Sign (`/apps/sign`)

A Next.js-based sub-app for collaborative document signing with paragraph-level feedback.

**How it fits**: Applies the statement model to documents, treating paragraphs as evaluable "statements" for suggestions, votes, and consensus-driven revisions. Turns deliberations into actionable outputs.

| Feature | Description |
|---------|-------------|
| Paragraph-level feedback | Approve/reject with comment threads |
| Version control | Manual, auto, or timer-based modes |
| Heat maps | Visualize engagement patterns |
| Google Docs import | Bring existing documents easily |

**Use Case**: After consensus in the main app, export to Sign for public endorsement with crowd-sourced improvements.

### Shared Packages (`/packages`)

| Package | Description |
|---------|-------------|
| `@freedi/shared-types` | TypeScript types for cross-app consistency |
| `@freedi/shared-i18n` | Internationalization utilities |

## Real-World Impact

### Case 1: Rapid Decision (5 minutes)
- **Context**: Naming a political organization
- **Scale**: 53 participants, 26 proposals
- **Outcome**: Clear convergence on "Kol HaAm" ("Voice of the People")
- **Validation**: Confirmed through secondary voting mechanism

### Case 2: Complex Deliberation (5 hours)
- **Context**: Religion-state charter development
- **Scale**: 40 participants (secular and religious representatives)
- **Process**: Two 2.5-hour facilitated sessions with breakout groups
- **Outcome**: Proposals achieving >60% consensus synthesized into draft charter
- **Reception**: Positive feedback, requests for wider dissemination

These cases demonstrate versatility for both fast/simple and complex/value-driven decisions.

## Technical Overview

### Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18 + TypeScript (strict), Redux Toolkit, Vite/SWC, SCSS (BEM/Atomic) |
| **Backend** | Firebase (Firestore, Auth, Functions, Messaging) |
| **AI/ML** | OpenAI embeddings, Google Gemini, Firestore Vector Search |
| **Quality** | ESLint/Prettier, Jest/RTL, Sentry, Playwright E2E |

### Code Architecture

```
src/
├── view/          # React components (presentation)
├── controllers/   # Business logic and data operations
├── services/      # External integrations (AI, Firebase)
├── redux/         # State management (15+ slices)
├── utils/         # Utility functions
├── helpers/       # Pure helper functions
├── constants/     # Named constants (no magic numbers)
└── types/         # TypeScript definitions
```

**Key Utilities:**
- `errorHandling.ts` - Structured error logging with custom types
- `firebaseUtils.ts` - Reference factories and batch operations
- `selectorFactories.ts` - Reusable Redux selector patterns

See [CLAUDE.md](./CLAUDE.md) for comprehensive development guidelines.

## Getting Started

### Prerequisites

- Node.js 18+
- Java JDK 17+ (for Firebase emulator)
- Firebase CLI: `npm install -g firebase-tools`

### Quick Setup

```bash
git clone https://github.com/delib-org/Freedi-app.git
cd Freedi-app
npm run setup:all  # Guides through Firebase config
```

### Development

```bash
npm run dev:all    # Launches main app (5173), sub-apps (3001/3002), emulator
```

### Key Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start main app only |
| `npm run build` | Production build |
| `npm run test` | Run tests |
| `npm run lint` | Code quality check |
| `npm run check-all` | Full validation suite |
| `npm run deploy prod` | Deploy to production |

For detailed setup: [Firebase Guide](./docs/setup/FIREBASE_SETUP.md)

## Documentation

Comprehensive docs in [`/docs/`](./docs/):

| Folder | Description |
|--------|-------------|
| [`setup/`](./docs/setup/) | Firebase, email, deployment guides |
| [`guides/`](./docs/guides/) | Coding style, contributing, testing |
| [`features/`](./docs/features/) | Feature implementations (consensus, etc.) |
| [`architecture/`](./docs/architecture/) | System design documents |

**Quick Links:**
- [Firebase Setup](./docs/setup/FIREBASE_SETUP.md)
- [Coding Style Guide](./docs/guides/CODING_STYLE_GUIDE.md)
- [Contributing Guide](./docs/guides/CONTRIBUTING.md)
- [Full Documentation Index](./docs/INDEX.md)

## Contributing

We welcome contributions! From bug fixes to new features:

1. **Fork** and branch: `git checkout -b feat/my-feature`
2. **Follow** [Coding Style Guide](./docs/guides/CODING_STYLE_GUIDE.md)
3. **Test**: `npm run check-all`
4. **PR** with clear description

See [Contributing Guide](./docs/guides/CONTRIBUTING.md) for details. Join [discussions](https://github.com/delib-org/Freedi-app/discussions) or [report issues](https://github.com/delib-org/Freedi-app/issues)!

## Limitations and Future Work

We acknowledge several important limitations:

1. **Manipulation Resistance**: Not yet robust against coordinated voting, preference misrepresentation, or fake accounts. Current implementations assume good-faith participation.

2. **Scale Testing**: Empirical evidence is limited to 40-70 active participants. Whether the framework maintains its properties at mass scale remains an open question.

3. **Strategic Behavior**: Research is ongoing into adaptive weighting mechanisms to promote fairness over repeated decision cycles.

4. **Facilitation Dependency**: Current success cases relied on structured facilitation. The system cannot yet substitute for facilitation quality and institutional context.

These limitations position Freedi as a research direction rather than a replacement for existing democratic institutions. Considerable work remains before deployment in contexts with substantial consequences.

## For Researchers

Explore the code for deliberative tech insights. We're open to collaborations on scaling consensus algorithms.

### Getting Started (No Programming Required)

AI assistants can explore the codebase for you:

```bash
git clone https://github.com/delib-org/Freedi-app.git
```

Use **Claude.ai** (upload files) or **Claude Code CLI** (`npm install -g @anthropic-ai/claude-code && claude`).

### Questions to Ask

- *"How does the consensus algorithm work? Is it fair to minority opinions?"*
- *"Where are evaluations calculated and what's the process?"*
- *"What mechanisms protect minority viewpoints?"*

### Key Files

| Area | Location |
|------|----------|
| Consensus calculation | `functions/src/fn_evaluation.ts` |
| Algorithm helpers | `functions/src/helpers/consensusValidCalculator.ts` |
| Tests | `functions/src/__tests__/consensus-scoring.test.ts` |

### Research Collaboration Areas

- Test methodologies across contexts and cultures
- Improve consensus algorithms
- Conduct empirical studies on effectiveness
- Explore scaling to thousands of participants

## License

**GPL-3.0** with attribution requirement. When creating your own instance, include prominent attribution to the [Deliberative Democracy Institute](https://delib.org).

See [LICENSE.md](./LICENSE.md) for full details.

### Citation

If you use Freedi in academic research:

> Yaron, T. (2026). A Confidence-Adjusted Consensus Mechanism for Scalable Deliberative Decision-Making. *SocArXiv*. https://doi.org/10.31235/osf.io/u4phy_v1

---

<div align="center">

**Freedi** - Enabling meaningful democratic participation at scale through open-source deliberative technology.

Built by the [Deliberative Democracy Institute](https://delib.org)

[Website](https://freedi.tech) | [Documentation](./docs/INDEX.md) | [Issues](https://github.com/delib-org/Freedi-app/issues) | [Discussions](https://github.com/delib-org/Freedi-app/discussions) | [Twitter/X](https://twitter.com/delib_org)

</div>
