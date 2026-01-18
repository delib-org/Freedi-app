# Freedi - Open Source Deliberative Democracy Platform

**Freedi** is an open-source platform for scalable deliberative democracy. It implements a novel consensus-building framework that enables meaningful participation at scale through continuous preference expression, open proposal generation, and real-time consensus measurement.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](./LICENSE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb)](https://react.dev/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-orange)](https://firebase.google.com/)

---

## Table of Contents

- [The Problem](#the-problem-scale-vs-participation)
- [The Solution](#the-solution-a-new-deliberative-framework)
- [Consensus Algorithm](#the-consensus-algorithm)
- [Real-World Applications](#proof-of-concept-real-world-applications)
- [Platform Features](#platform-features)
- [Technical Architecture](#technical-architecture)
- [Getting Started](#getting-started)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [For Researchers](#for-researchers-exploring-the-code)
- [License](#license)

---

## The Problem: Scale vs. Participation

As groups grow in size, the complexity of collective decision-making increases exponentially. This forces societies to concentrate authority in small hierarchical subgroups. While this enables coordination at scale, it systematically underrepresents the interests of broader populations and limits collective learning.

Traditional voting mechanisms exacerbate these problems:
- **Binary choices** reduce complex preferences to yes/no
- **Fixed option sets** prevent discovery of better solutions
- **Winner-take-all outcomes** incentivize polarization rather than consensus-seeking

Freedi offers an alternative approach grounded in deliberative democracy research.

## The Solution: A New Deliberative Framework

Freedi combines three core innovations:

### 1. Open and Continuous Proposal Generation
Participants are not limited to a predefined list of alternatives. Anyone may introduce new proposals at any point during the process. When existing options are inadequate, participants can articulate revised or entirely new alternatives, keeping the solution space open and responsive.

### 2. Continuous Expression of Preferences
Rather than binary choices, participants evaluate each proposal using a continuous scale from strong opposition (-1) to strong support (+1). This captures both direction and intensity of preference, distinguishing proposals with mild support and strong opposition from those with moderate but broadly distributed approval.

### 3. Real-Time Aggregation with the Consensus Algorithm
Each proposal receives an aggregate score derived from all evaluations, updated continuously and made visible to participants. This dynamic feedback loop transforms decision-making from a static event into an iterative, adaptive system.

## The Consensus Algorithm

At the core of Freedi lies the **Consensus Algorithm**—a scoring mechanism that provides a statistically principled estimate of collective agreement.

### The Formula

```
Consensus Score = Mean − SEM
```

Where:
- **Mean** = average of all evaluations (range: −1 to +1)
- **SEM** (Standard Error of the Mean) = σ / √n
- **σ** = sample standard deviation
- **n** = number of unique evaluators

### Why This Formula?

The algorithm resolves a fundamental tension in preference aggregation:

| Problem | Simple Mean | Sum/Count | **Mean − SEM** |
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

To prevent manipulation by small unanimous groups (the "Zero Variance Loophole"), an uncertainty floor is applied:

```
σ_adjusted = max(observed standard deviation, 0.5)
```

This ensures that small samples with zero variance are treated as having uncertain consensus, while large samples with genuine agreement naturally exceed the floor.

### One Evaluator, One Vote

Each participant may submit only one evaluation per proposal (though they may update it at any time). This prevents manipulation through repeated voting.

> 📄 **Deep Dive**: See [Consensus Scoring Update](./docs/features/CONSENSUS_SCORING_UPDATE.md) for full implementation details.

## Proof of Concept: Real-World Applications

### Case 1: Rapid Collective Decision (5 minutes)
- **Context**: Selecting a name for a political organization
- **Participants**: 53 active participants from ~70 attendees
- **Proposals**: 26 distinct name proposals generated by participants
- **Outcome**: Clear convergence on "Kol HaAm" ("Voice of the People") within approximately 5 minutes
- **Validation**: Result confirmed through secondary voting mechanism

### Case 2: Complex Normative Deliberation (5 hours)
- **Context**: Developing a social charter on religion-state relations
- **Participants**: 40 participants representing secular and religious perspectives
- **Process**: Two facilitated sessions (2.5 hours each) with structured deliberation phases
- **Method**: Breakout groups (5-6 people), equal speaking time, iterative proposal refinement
- **Outcome**: Proposals achieving >60% consensus threshold were synthesized into a draft charter using AI
- **Reception**: Positive feedback and requests for wider dissemination

These cases demonstrate the system's ability to support both rapid convergence on simple decisions and sustained deliberation on complex, value-laden issues among heterogeneous groups.

## Platform Features

### Unified Statement Model
Everything in Freedi is a "Statement" with semantic types:
- **Groups**: Top-level containers for organizing deliberations
- **Questions**: Discussion topics that prompt proposals and options
- **Options**: Proposed solutions or choices under questions
- **Statements**: Chat messages and discussions within the hierarchy

This hierarchical model enables unlimited nesting depth with full ancestry tracking.

### Core Capabilities

| Category | Features |
|----------|----------|
| **Collaboration** | Real-time WebSocket updates, synchronized voting, instant notifications |
| **Evaluation** | Multi-type evaluations, consensus visualization, polarization tracking |
| **Deliberation** | Multi-stage processes, integrated chat, similar statement detection |
| **AI Integration** | Proposal improvement suggestions, discussion summarization, semantic search |
| **Visualization** | Interactive mind maps, hierarchical views, export (JSON/SVG/PNG) |
| **Accessibility** | WCAG AA compliance, screen reader support, keyboard navigation, RTL support |
| **Platform** | Progressive Web App, offline support, multi-language internationalization |

### Monorepo Applications

| Application | Technology | Description |
|-------------|------------|-------------|
| **Main App** (`/src`) | Vite + React 18 | Core deliberation platform with full feature set |
| **Mass Consensus** (`/apps/mass-consensus`) | Next.js 14 | Fast anonymous consensus voting with SSR/ISR |
| **Freedi Sign** (`/apps/sign`) | Next.js 14 | Document signing with paragraph-level engagement |

#### Mass Consensus
High-performance anonymous participation for crowdsourced evaluation:
- Server-side rendering for near-instant page loads
- No login required—immediate evaluation and submission
- Real-time voting on a 5-point scale
- AI-powered improvement suggestions via Google Gemini
- Performance targets: FCP < 0.8s, LCP < 1.2s, TTI < 2.0s

#### Freedi Sign
Collaborative document review with granular feedback:
- Paragraph-level approve/reject with comment threads
- Heat map visualization of engagement patterns
- Demographic analysis and filtering
- Admin dashboard with real-time statistics
- Google Docs import and configurable branding

### Shared Packages (`/packages`)

| Package | Description |
|---------|-------------|
| `@freedi/shared-types` | TypeScript types for cross-app consistency |
| `@freedi/shared-i18n` | Internationalization utilities |

## Technical Architecture

### Stack Overview

**Frontend**
- React 18 with TypeScript (strict mode, no `any` types)
- Redux Toolkit for state management
- Vite with SWC for fast builds
- SCSS modules with Atomic Design System (BEM methodology)
- Progressive Web App with service workers

**Backend**
- Firebase Firestore (real-time database)
- Firebase Auth (multi-provider authentication)
- Firebase Cloud Functions (50+ serverless functions)
- Firebase Cloud Messaging (push notifications)

**AI/ML**
- OpenAI embeddings for semantic search (text-embedding-3-small)
- Google Gemini for proposal improvements and summarization
- Firestore Vector Search for similarity detection

**Development & Quality**
- TypeScript strict mode throughout
- ESLint + Prettier for code quality
- Jest + React Testing Library for testing
- Sentry for error monitoring

### Code Architecture

```
src/
├── view/          # React components (presentation)
├── controllers/   # Business logic and data operations
├── services/      # External integrations (FCM, analytics)
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
- `common.ts` - Application constants (TIME, FIREBASE, UI, VALIDATION)

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
npm run setup:all
```

This automated script guides you through Firebase project creation and configuration.

### Development

```bash
npm run dev:all    # Start all apps + emulator
```

**Access Points:**
- Main App: http://localhost:5173
- Mass Consensus: http://localhost:3001
- Freedi Sign: http://localhost:3002
- Firebase Emulators: http://localhost:5002

### Commands

```bash
npm run dev           # Start main app
npm run build         # Production build
npm run lint          # ESLint validation
npm run typecheck     # TypeScript checking
npm run test          # Run tests
npm run check-all     # Full validation suite
npm run deploy prod   # Deploy to production
```

## Deployment

Unified deployment with automatic environment management:

```bash
npm run deploy <target> [options]
```

| Target | Description |
|--------|-------------|
| `dev` | Local development with emulator |
| `test` | Testing new features |
| `prod` | Production deployment |

Options: `--hosting`, `--functions`, `--rules`, `--skip-build`, `--dry-run`

## Documentation

All documentation is organized in the [`docs/`](./docs/) folder:

| Folder | Description |
|--------|-------------|
| [`docs/setup/`](./docs/setup/) | Firebase, email, and deployment setup guides |
| [`docs/guides/`](./docs/guides/) | Coding style, contributing, testing, design system |
| [`docs/security/`](./docs/security/) | Security policies and vulnerability tracking |
| [`docs/quality/`](./docs/quality/) | Code quality reviews and improvements |
| [`docs/performance/`](./docs/performance/) | Server optimization guides and results |
| [`docs/features/`](./docs/features/) | Feature implementations and updates |
| [`docs/architecture/`](./docs/architecture/) | System design and recommendations |
| [`docs/bugs/`](./docs/bugs/) | Issue tracking and debugging guides |
| [`docs/plans/`](./docs/plans/) | Feature planning documents |
| [`docs/papers/`](./docs/papers/) | Research and technical papers |

### Quick Links

| Need to... | Document |
|------------|----------|
| Set up Firebase | [docs/setup/FIREBASE_SETUP.md](./docs/setup/FIREBASE_SETUP.md) |
| Understand coding standards | [docs/guides/CODING_STYLE_GUIDE.md](./docs/guides/CODING_STYLE_GUIDE.md) |
| Contribute code | [docs/guides/CONTRIBUTING.md](./docs/guides/CONTRIBUTING.md) |
| Run tests | [docs/guides/TESTING.md](./docs/guides/TESTING.md) |
| Review architecture | [docs/architecture/](./docs/architecture/) |
| Check code quality | [docs/quality/CODE_QUALITY_REVIEW.md](./docs/quality/CODE_QUALITY_REVIEW.md) |

See [docs/INDEX.md](./docs/INDEX.md) for a complete documentation index.

## Contributing

We welcome contributions! Please see our [Contributing Guide](./docs/guides/CONTRIBUTING.md) for details.

### Quick Start for Contributors

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes following the [Coding Style Guide](./docs/guides/CODING_STYLE_GUIDE.md)
4. Run tests: `npm run check-all`
5. Submit a pull request

## Limitations and Future Work

We acknowledge several important limitations:

1. **Manipulation Resistance**: The system is not yet robust against coordinated voting, preference misrepresentation, or fake accounts. Current implementations assume good-faith participation.

2. **Scale Testing**: Empirical evidence is limited to 40-70 active participants. Whether the framework maintains its properties at mass scale remains an open question.

3. **Strategic Behavior**: Research is ongoing into adaptive weighting mechanisms to promote fairness over repeated decision cycles.

4. **Facilitation Dependency**: Current success cases relied on structured facilitation. The system cannot yet substitute for facilitation quality and institutional context.

These limitations position Freedi as a research direction rather than a replacement for existing democratic institutions. Considerable work remains before deployment in contexts with substantial social, political, or economic consequences.

## Research Collaboration

We invite researchers and practitioners to help advance deliberative democracy:

### Contribution Areas
- Test methodologies across contexts and cultures
- Improve consensus algorithms
- Conduct empirical studies on effectiveness
- Develop features for specific deliberative needs
- Explore scaling to thousands of participants

### How to Contribute

1. **Review the codebase** using AI assistants (Claude, GitHub Copilot)
2. **Document findings** covering strengths, concerns, and proposed improvements
3. **Contact maintainers** via [GitHub Issues](https://github.com/delib-org/Freedi-app/issues)
4. **Discuss implementation** before writing code
5. **Submit pull requests** following our [contribution guidelines](./docs/guides/CONTRIBUTING.md)

See the "For Researchers" section below for detailed guidance.

## For Researchers: Exploring the Code

**No programming experience required.** AI assistants can explore the codebase for you.

### Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/delib-org/Freedi-app.git
   ```
   Or use [GitHub Desktop](https://desktop.github.com/) for a visual experience.

2. Use an AI assistant:
   - **Claude.ai** - Upload files and ask questions
   - **Claude Code CLI** - `npm install -g @anthropic-ai/claude-code && claude`

### Questions to Ask

- *"How does the consensus algorithm work? Is it fair to minority opinions?"*
- *"Show me where evaluations are calculated and explain the process"*
- *"How are participants' voices weighted in the final decision?"*
- *"What mechanisms protect minority viewpoints from being drowned out?"*
- *"Where are the consensus scoring functions implemented?"*

### Key Files to Investigate

| Area | Location |
|------|----------|
| Consensus calculation | `functions/src/fn_evaluation.ts` |
| Frontend state | `src/redux/evaluations/` |
| Algorithm helpers | `functions/src/helpers/consensusValidCalculator.ts` |
| Tests | `functions/src/__tests__/consensus-scoring.test.ts` |

## Theoretical Foundation

Freedi draws on research from:
- **Deliberative Democracy**: Habermas, Fishkin, Mansbridge et al.
- **Social Choice Theory**: Arrow, Sen, Moulin
- **Collective Intelligence**: Page, Surowiecki, Malone
- **Computer-Mediated Communication**: Walther, Herring, Sproull & Kiesler

The framework addresses structural limitations identified in political science literature regarding hierarchical decision-making, coordination complexity, and the polarization dynamics of traditional voting systems.

## License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)** with an additional attribution requirement.

**Attribution Requirement:** When creating your own instance of the app, you must include prominent attribution to the [Deliberative Democracy Institute](https://delib.org) on the main page, About page, and any other relevant sections.

See [LICENSE.md](./LICENSE.md) for full details.

## Citation

If you use Freedi in academic research, please cite:

> Yaron, T. (2025). The Consensus Algorithm: A Deliberative Framework for Scalable Collective Decision-Making. *Working Paper*.

---

<div align="center">

**Freedi** - Enabling meaningful democratic participation at scale through open-source deliberative technology.

[Website](https://freedi.tech) · [Documentation](./docs/INDEX.md) · [Issues](https://github.com/delib-org/Freedi-app/issues) · [Discussions](https://github.com/delib-org/Freedi-app/discussions)

</div>
