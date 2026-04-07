# Freedi Architecture

## 1. What Freedi Is

Freedi (internally: Wizcol) is a platform for structured group deliberation and collaborative decision-making. It transforms a multiplicity of opinions into a systematic process that converges on well-supported, agreed-upon solutions.

What makes Freedi different from forums, polls, or chat tools is that it does not merely collect opinions. It creates a **cumulative process** where misunderstandings become shared knowledge, ideas improve through structured critique, solutions are examined based on real-world consequences, and final choices align with stakeholder values.

The platform is built as a **modular architecture** with multiple applications, each tailored to a different stage of deliberation and a different participant scale — from small groups to thousands of participants.

---

## 2. The Deliberation Process

Every feature in Freedi exists to serve one or more stages of a structured deliberation workflow. Understanding this process is essential to understanding why the architecture is shaped the way it is.

### The Eight Stages

**Stage 1 — Stakeholder Identification.** Map the relevant parties who are affected by or have influence over the issue.

**Stage 2 — Needs Assessment.** Collect and describe stakeholder needs, interests, and challenges.

**Stage 3 — Question Formulation.** Craft a focused question derived from the identified needs, which defines the solution search space.

**Stage 4 — Research & Knowledge Building (SON).** Identify areas of misunderstanding, knowledge gaps, or irrelevance and transform them into shared knowledge among participants. SON stands for Social Object Network — a common knowledge base from which higher-quality solutions can emerge.

**Stage 5 — Solution Generation.** Develop and examine a wide range of possible solutions through brainstorming, identifying existing solutions, and proposing alternatives. This stage is tightly coupled with Stage 4: the solution creation process surfaces new knowledge gaps, which feed back into research.

**Stage 6 — Solution Refinement.** Improve and refine solutions through critical discussion using Popperian-Bayesian methodology — critique, falsification attempts, incorporating new insights, proposing improvements.

**Stage 7 — Evaluation & Comparison.** Evaluate solutions using rating mechanisms, identifying solutions with broad support and high quality.

**Stage 8 — Convergence.** Select the solution (or set of solutions) that provides the optimal response to stakeholder needs.

### The Learning Loop

The process is not linear. At every stage, new gaps may emerge that require returning to earlier stages — particularly to Stages 4 and 5.

```
Stakeholders → Needs → Question → Research/SON
     ↑                                    |
     |                                    v
Convergence ← Evaluation ← Refinement ← Solutions
     |                                    ↑
     +------------ Feedback Loop ---------+
```

### Why This Matters for Architecture

Each application in the Freedi ecosystem is designed for specific stages and specific participant scales. The Main App handles all stages for small groups. Mass Consensus handles large-scale idea collection and evaluation. Sign handles large-scale solution formulation and agreement. This separation is not arbitrary — it reflects the fundamental principle that discussion dynamics, information load, and required algorithms change with group size.

---

## 3. Applications

### Main App (Freedi)

The core application for managing deliberations in small groups (tens of participants). Also provides the shared infrastructure for all other apps.

- **Tech:** React + Vite + TypeScript (SPA)
- **State:** Redux Toolkit
- **Backend:** Firebase (Firestore, Auth, Cloud Functions, FCM)
- **Styling:** SCSS Modules + Atomic Design System (BEM)
- **Path:** Root project (`/`)

The Main App implements the full deliberation flow: groups, questions, options, discussions, and evaluations. It supports recursive Statement hierarchies, real-time collaboration, and multiple evaluation methods.

### Mass Consensus (MC)

For large-scale idea collection and preference gathering (hundreds to thousands of participants).

- **Tech:** Next.js 14 (App Router) + TypeScript
- **State:** Redux Toolkit
- **Backend:** Firebase + Vercel
- **Path:** `apps/mass-consensus/`

MC features a swipe-based evaluation interface, survey flows, and statistical aggregation across large participant pools. Optimized for collecting, filtering, and comparing solutions.

### Sign

For large-scale solution formulation, document-level deliberation, and agreement (hundreds to thousands of participants).

- **Tech:** Next.js 14 (App Router) + TypeScript
- **Backend:** Firebase + Vercel
- **Path:** `apps/sign/`

Sign supports paragraph-level deliberation on documents, suggestion/evaluation workflows, version control with AI-assisted coherence checking, heatmap visualizations of agreement levels, and signature collection.

### Flow

A lightweight, standalone deliberation experience focused on guided step-by-step participation.

- **Tech:** Vanilla TypeScript (Lit-style components) + Vite
- **Backend:** Firebase
- **Path:** `apps/flow/`

### Admin

A dashboard for system-wide administration and analytics.

- **Tech:** Vanilla TypeScript + Vite
- **Backend:** Firebase
- **Path:** `apps/admin/`

### Application-to-Stage Mapping

| Deliberation Stage | Small Groups | Large Groups |
|---|---|---|
| Stakeholder & Needs ID | Main App | — |
| Question Formulation | Main App | — |
| Research / SON Expansion | Main App | Mass Consensus |
| Solution Generation | Main App | Mass Consensus / Flow |
| Solution Refinement | Main App | Sign |
| Evaluation & Comparison | Main App | Mass Consensus |
| Convergence & Agreement | Main App | Sign |

---

## 4. The Core Data Model: Statements

The most important architectural decision in Freedi is the **Unified Statement Model**. Every piece of content — questions, solutions, messages, comments, paragraphs — is represented as a Statement. This is a sophisticated implementation of the Composite Pattern combined with the Type Object Pattern.

### Why a Unified Model?

A deliberation platform needs to represent groups, questions, proposed solutions, discussions, and sub-options. One approach would be to create separate data models for each. Freedi instead uses a single `Statement` type with a `statementType` discriminator. This gives us:

- **A single source of truth** for all content types
- **Recursive hierarchical structures** naturally supported (questions contain options, options contain sub-options, etc.)
- **Simplified data synchronization** — one Firestore collection, one Redux slice, one set of listeners
- **Polymorphic behavior** through `statementType` — the same entity renders differently and supports different actions based on its type

### The Statement Entity

```typescript
Statement {
  // Identity
  statementId: string
  statementType: 'group' | 'question' | 'option' | 'statement'

  // Hierarchy
  parentId: string          // Direct parent
  topParentId: string       // Root of tree
  parents: string[]         // Full ancestry chain

  // Content
  statement: string         // Main text
  description?: string      // Additional details

  // Metadata
  creatorId: string
  createdAt: number         // Always milliseconds
  lastUpdate: number        // Always milliseconds

  // Type-specific settings
  questionSettings?: {...}
  groupSettings?: {...}
  optionSettings?: {...}
  questionnaire?: {...}
}
```

All types are defined in the `delib-npm` package, which is shared across all apps and Cloud Functions.

### Hierarchy Rules: What Can Contain What

These rules are not arbitrary — they encode the semantics of deliberation.

**Groups** can contain questions (topics for deliberation), statements (chat/discussions), and other groups (sub-topics). Groups cannot contain options directly, because options need a question context to make sense.

**Questions** can contain options (proposed answers), other questions (follow-ups), statements (discussions), and groups (for organizing complex sub-topics).

**Options** can contain other options (properties/specifications of the parent option — see below), questions (clarifications needed), statements (supporting arguments), and groups.

**Statements** (chat/discussion) can contain any type, providing full flexibility for discussion threads.

### Options Under Options: Properties, Not Alternatives

This is a key concept that is easy to misunderstand. When options appear under other options, they represent **properties, specifications, or components** of the parent option — NOT alternative choices.

```
Question: "Which laptop should our team purchase?"
├── Option: "MacBook Pro 16-inch"          ← This is a CHOICE
│   ├── Option: "Processor: M3 Max"        ← These are PROPERTIES
│   ├── Option: "Memory: 64GB RAM"            of that choice
│   ├── Option: "Storage: 2TB SSD"
│   └── Option: "AppleCare+: 3 years"
├── Option: "Dell XPS 15"                  ← Another CHOICE
│   ├── Option: "Processor: i9-13900H"     ← Properties of this choice
│   └── Option: "Memory: 32GB RAM"
```

Alternative choices are always **siblings** (under the same parent question). Properties are always **children** (under their parent option). This distinction keeps the decision tree semantically clear.

**Anti-pattern to avoid:**
```
Option: "Open new office"
├── Option: "New York"      ← WRONG: these are alternatives, not properties
├── Option: "Los Angeles"      Should be sibling options under the question
```

### Future Direction: Graph Structure

Currently Statements are organized in a parent-child tree. The architecture is designed to evolve toward a more flexible **graph structure**, enabling reuse of the same solution across multiple questions, complex relationships between ideas, and support for converging and multi-directional discussions.

---

## 5. Shared Infrastructure

### Shared Packages

```
packages/
  shared-types/      # TypeScript types & models
  shared-i18n/       # Internationalization (en, he, ar, es, de, nl)
  shared-utils/      # Common utility functions
  engagement-core/   # Engagement system core logic
  e2e-shared/        # Shared E2E testing infrastructure
```

The `delib-npm` package (published to npm) provides canonical type definitions used across all apps and Cloud Functions. Always import types from `delib-npm` before creating custom ones.

### Backend: Firebase

All applications share a common Firebase project:

- **Firestore** — Primary database (real-time document store)
- **Firebase Auth** — Authentication (Google, anonymous)
- **Cloud Functions** — Server-side logic, triggers, scheduled tasks
- **Firebase Cloud Messaging (FCM)** — Push notifications
- **Firebase Storage** — File uploads

### Cloud Functions

Server-side logic includes Firestore triggers for cascading updates on Statement changes, subscription management for tracking user participation, an engagement system (credits, badges, streaks, notifications), and scheduled tasks (digest emails, cleanup jobs).

For details on Cloud Functions architecture and known scaling issues, see [functions/trigger-cascade-issues.md](./functions/trigger-cascade-issues.md) and [functions/trigger-cascade-solutions.md](./functions/trigger-cascade-solutions.md).

### Deployment

| Application | Platform | Command |
|---|---|---|
| Main App | Firebase Hosting | `npm run deploy:prod` |
| Mass Consensus | Vercel | Vercel CI/CD |
| Sign | Vercel | Vercel CI/CD |
| Flow | Firebase Hosting | — |
| Admin | Firebase Hosting | — |
| Cloud Functions (prod) | Firebase | `npm run deploy:f:prod` |
| Cloud Functions (test) | Firebase | `npm run deploy:f:test` |

---

## 6. The Popperian-Bayesian Discussion Mechanism

This is the intellectual foundation of Freedi's approach to deliberation and a key differentiator from other platforms.

Discussion in the system combines **Popperian principles** (falsification, critique — ideas improve by surviving attempts to disprove them) with **Bayesian updating** (revising the probability that a solution is good based on new evidence).

Within this framework, participants can propose statements (ideas, solutions), falsify or critique existing statements, strengthen statements with arguments and evidence, and suggest alternatives and improvements.

This drives a **cumulative discussion** where statement quality improves over time and credibility increases through scrutiny — rather than the typical online pattern where the loudest or earliest voice dominates.

### Evaluation Dimensions

Each statement can be evaluated along several complementary axes:

**Corroboration level** — Based on Popperian-Bayesian discussion results: how well has this statement withstood critique?

**Probability of success** — Assessment of the solution's likelihood of success, based on knowledge, experience, and context.

**Outcomes assessment** — Evaluating real-world consequences across dimensions like economic cost, social impact, risk level, and environmental impact.

**Alignment with stakeholder values** — Evaluation is not purely objective. It incorporates stakeholder values such as risk tolerance, sensitivity to harm, and relative importance of outcomes.

---

## 7. Client Architecture Patterns

### Project Structure

```
src/
├── controllers/        # Business logic layer
│   ├── db/            # Data access layer (Firebase operations)
│   ├── hooks/         # Custom React hooks
│   └── auth/          # Authentication logic
├── services/          # External service integrations (FCM, analytics, Sentry)
├── redux/             # State management (Redux Toolkit slices)
│   └── utils/         # Selector factories, reusable patterns
├── view/              # Presentation layer
│   ├── components/    # Reusable UI components
│   │   └── atomic/    # Atomic Design System components
│   └── pages/         # Page-level components
├── constants/         # Named constants (no magic numbers)
├── helpers/           # Pure helper functions
├── types/             # TypeScript type definitions
└── utils/             # Utility functions (error handling, Firebase utils)
```

### Key Design Decisions and Their Rationale

**Vertical Slice Architecture.** Each feature contains its own stack from UI to data access, promoting high cohesion and low coupling. A developer working on evaluations touches evaluation components, evaluation controllers, and the evaluation Redux slice — not a shared monolithic service layer.

**Real-Time First.** Firestore listeners provide real-time data synchronization with optimistic updates and eventual consistency. This is core to the collaborative nature of deliberation — participants need to see each other's contributions immediately.

**Redux Toolkit for State.** Slice-based organization with normalized state and memoized selectors. Redux was chosen over lighter alternatives because the app has complex cross-cutting state (a statement's display depends on its parent's settings, user's role, evaluation results, etc.).

**Hook-Based Logic.** Custom hooks like `useAuthorization`, `useStatementData`, and `useNotifications` abstract complex logic, making it reusable and testable independently of UI.

**Progressive Authorization.** Access control uses a Chain of Responsibility pattern — if a statement doesn't have explicit membership settings, it inherits from its parent, going up the hierarchy until it finds a rule.

**Atomic Design System with SCSS.** All styling lives in SCSS files using BEM naming. React components are TypeScript wrappers only — they apply CSS classes, not inline styles or CSS-in-JS. This keeps styling concerns separate and makes the design system auditable.

### Dependency Direction

```
View → Controllers → Services
  ↓         ↓
Redux    Utils/Helpers
```

View components import from controllers, never the reverse. Controllers use services and utilities. This prevents circular dependencies and keeps the codebase navigable.

---

## 8. Notification System

The notification system is a significant subsystem documented separately. See [IN_APP_NOTIFICATIONS_ARCHITECTURE.md](./IN_APP_NOTIFICATIONS_ARCHITECTURE.md) for the full technical reference.

In summary: when a user creates a statement, Cloud Functions create in-app notifications for all subscribed users and dispatch push notifications via FCM. The client maintains a real-time Firestore listener for the current user's notifications. The system supports browser push notifications with a service worker, handles multi-environment Firebase configs, and manages FCM token lifecycle (generation, refresh, cleanup).

Key architectural concern: the notification system has scaling issues when statements have many subscribers. See Section 9.

---

## 9. Subscription Scaling & the Snapshot + Overlay Pattern

The original architecture embedded a full `SimpleStatement` in each subscription document, and Cloud Functions rewrote ALL subscription docs whenever a statement was edited. This caused O(N) Firestore writes per edit — at 10,000 users, an estimated $25,000+/month in unnecessary costs.

### What Was Fixed

**Snapshot + Overlay pattern.** Subscription documents now store a frozen "snapshot" of the statement from creation time. The Cloud Function `updateSubscriptionsSimpleStatement` has been **removed entirely** — zero fan-out writes on statement edits. The client overlays fresh data from Redux via `useHomeStatementOverlay`, so the home screen renders instantly from snapshots and titles update seamlessly once fresh data loads.

**Top-level query fields.** Immutable fields (`parentId`, `statementType`, `topParentId`) have been promoted to top-level fields on subscription documents. Firestore queries now use these directly instead of nested `statement.parentId` paths. This decouples queries from the embedded statement data.

**Lightweight parent subscription updates.** The `updateParentSubscriptions` function now writes only a `lastUpdate` timestamp instead of the full `lastSubStatements` array, reducing payload from ~2KB to ~50 bytes per write.

**Admin inheritance cap.** `setupAdminsForStatement()` now limits inherited admins to 20 per statement, preventing exponential growth in deep hierarchies.

**Notification subscriber cap.** `updateInAppNotifications()` now caps subscribers at 500 per notification batch, with `.limit()` on all parent subscriber queries.

### Remaining Architectural Debt

**Full normalization.** The `statement` field still exists on subscription documents (as a frozen snapshot). A future optimization could remove it entirely, reducing document size by ~1-2KB. This would save storage costs but requires all clients to handle the case where `subscription.statement` is undefined.

**Parent subscription fan-out.** The `updateParentSubscriptions` function still does O(M) writes (one per subscriber) to update `lastUpdate` timestamps. This is lightweight but could be replaced by a dirty-flag pattern if subscriber counts grow very large.

**Evaluation trigger chains.** Evaluation triggers still create chains (evaluation → statement update → parent update). These are less costly now that subscription fan-out is removed, but could still be optimized with debouncing.

For historical analysis and original proposals, see [functions/trigger-cascade-issues.md](./functions/trigger-cascade-issues.md) and [functions/trigger-cascade-solutions.md](./functions/trigger-cascade-solutions.md).

---

## 10. Error Handling & Monitoring

### What's in Place

- **Sentry** integration for production error monitoring (initialized before anything else in `main.tsx`)
- **Root error boundary** with user-friendly fallback UI
- **Structured logger service** replacing raw `console.log`/`console.error`
- **Firebase Analytics** with custom event tracking
- **Microsoft Clarity** for session analytics
- **Structured error types**: `DatabaseError`, `ValidationError`, `AuthenticationError`, `AuthorizationError`, `NetworkError`
- **Utility functions**: `logError()`, `withErrorHandling()`, `withRetry()`

### What's Still Needed

- Feature-specific error boundaries (AsyncBoundary component)
- `useAsyncOperation` hook for consistent async error handling
- Centralized Firebase error code → user-friendly message mapping
- ESLint rule to prevent `console.log` usage
- Migration of remaining raw `console.error` calls to structured logger
- Performance metrics tracking (page load, API response times)
- Statement engagement scoring system

For the full task breakdown, see [ERROR_HANDLING_ROADMAP.md](./ERROR_HANDLING_ROADMAP.md).

---

## 11. Improvement Roadmap

This section consolidates the previously separate improvement documents (01 through 07) into a single prioritized view.

### Critical: Must Fix for Scale

**TypeScript strict mode.** Currently not enabled. Enabling it will surface hidden bugs, especially around null/undefined handling. The codebase has some remaining `any` types that need proper typing.

**Cloud Functions scaling** (see Section 9). The trigger cascade issues are the single biggest blocker to growing the user base beyond ~1,000 concurrent users.

**Bundle size.** The statement-related code chunk is ~1.4MB (386KB gzipped). Route-based code splitting and lazy loading of heavy components (TipTap editor, ReactFlow, etc.) would significantly improve initial load times.

### High Priority: Developer Experience & Code Quality

**Redux optimization.** Large slices should be split. Entity Adapters would simplify normalized state management. Memoized selectors should use the factory patterns in `src/redux/utils/selectorFactories.ts` rather than being re-created in each component.

**Component architecture.** The codebase has a mix of old component patterns and the newer Atomic Design System. New features should use the atomic system; migration of old components should happen opportunistically during refactors, not as a standalone effort.

**Import organization.** A standard 10-group import order is defined in [IMPORT_ORGANIZATION.md](./IMPORT_ORGANIZATION.md). ESLint should enforce this automatically.

### Medium Priority: Robustness

**Testing.** Infrastructure exists (Jest + Playwright) but coverage is minimal. Priority should be: utility functions (80%+ coverage), Redux slices, controllers, then components. The testing pyramid target is 60% unit, 30% integration, 10% E2E.

**Security hardening.** Firestore rules need review for overly permissive patterns. Input validation (Valibot) should be applied consistently at all data boundaries. Rate limiting should be added to Cloud Functions.

**Performance monitoring.** Implement performance budgets, track page load and API response times, alert on regressions.

---

## 12. Architecture Principles (Summary)

These are the principles that guided the architecture and should guide future decisions:

1. **Separation by stage and scale.** Each app addresses a specific deliberation stage and participant scale, avoiding one-size-fits-all compromises.

2. **Unified data model.** All apps share the Statement-based model via `delib-npm`, ensuring interoperability and a single source of truth.

3. **Semantic clarity.** The hierarchy rules make logical sense: questions present decisions, options provide choices, sub-options define properties. Groups organize, statements discuss.

4. **Cumulative process.** The architecture supports iterative refinement — discussions build on each other, knowledge accumulates, solutions improve over time.

5. **Real-time collaboration.** Firebase's real-time capabilities are central, not bolted on. The entire data flow is designed around live updates.

6. **Value-aligned decision making.** Evaluation is not purely objective; it incorporates stakeholder values, making the system suitable for complex, multi-stakeholder scenarios.

7. **Progressive detail.** High-level decision → specific choice → detailed specifications. The recursive Statement model supports natural drill-down.

---

## Related Documents

- [IN_APP_NOTIFICATIONS_ARCHITECTURE.md](./IN_APP_NOTIFICATIONS_ARCHITECTURE.md) — Full technical reference for the notification system
- [ERROR_HANDLING_ROADMAP.md](./ERROR_HANDLING_ROADMAP.md) — Remaining error handling tasks with implementation phases
- [IMPORT_ORGANIZATION.md](./IMPORT_ORGANIZATION.md) — Standard import order for TSX files
- [functions/trigger-cascade-issues.md](./functions/trigger-cascade-issues.md) — Detailed analysis of Cloud Functions scaling problems
- [functions/trigger-cascade-solutions.md](./functions/trigger-cascade-solutions.md) — Proposed solutions with code examples
- [functions/new-subscription-architecture.md](./functions/new-subscription-architecture.md) — Redesigned subscription system
- [functions/implementation-guide-new-subscriptions.md](./functions/implementation-guide-new-subscriptions.md) — Step-by-step implementation guide
