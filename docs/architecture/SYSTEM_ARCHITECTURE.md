# Wizcol System Architecture

## Abstract

Wizcol (branded as **Freedi**) is a platform for managing group deliberation and collaborative decision-making. It transforms a multiplicity of opinions and positions into a structured process that converges on well-supported, agreed-upon solutions.

The system achieves this through a systematic process:

1. Identifying stakeholder needs
2. Formulating a precise question
3. Building shared knowledge (SON - Social Object Network)
4. Generating solutions
5. Refining solutions through critical discussion (Popperian-Bayesian methodology)
6. Evaluating solutions based on outcomes and stakeholder values
7. Converging on an optimal solution

What makes Wizcol unique is that it does not merely collect opinions. It creates a **cumulative process** where:

- Misunderstandings become shared knowledge
- Ideas improve over time through structured critique
- Solutions are examined based on real-world consequences
- Final choices are aligned with stakeholder values

The system is built as a **modular architecture**, comprising multiple applications tailored to different stages of the process and different participant scales -- from small groups to thousands of participants (via Mass Consensus and Sign).

At the foundation of all applications lies a **shared infrastructure** that includes:

- A **unified data model** built on the Statement entity
- A **Popperian-Bayesian discussion mechanism**
- A **multi-dimensional evaluation system** combining corroboration, probability of success, and outcome analysis

---

## The Structured Deliberation Process

The process begins with identifying a gap: an unmet need among stakeholders. From there, a systematic workflow unfolds:

### 1. Stakeholder Identification

Mapping the relevant parties who are affected by or have influence over the issue at hand.

### 2. Needs Assessment

Systematic collection and description of stakeholder needs, interests, and challenges.

### 3. Central Question Formulation

Crafting a focused question derived from the identified needs, which defines the solution search space.

### 4. Research and SON Expansion (Social Object Network)

Identifying areas of misunderstanding, knowledge gaps, or irrelevance, and transforming them into shared knowledge among stakeholders and participants. This stage establishes a **common knowledge base** from which higher-quality solutions can emerge.

### 5. Solution Generation and Exploration

Developing and examining a wide range of possible solutions through:

- Brainstorming
- Identifying existing solutions
- Proposing alternatives and new directions

> **Important:** This stage is tightly coupled with the SON expansion stage. The solution creation process surfaces new knowledge gaps, which feed back into the research process.

### 6. Solution Refinement

Improving and refining solutions through critical discussion (Popperian-Bayesian), which includes:

- Critique and falsification attempts
- Incorporating new insights
- Proposing improvements and alternatives
- Comparative evaluation

### 7. Evaluation and Comparison

Evaluating solutions using rating mechanisms (such as Bayesian updating and additional metrics), identifying solutions with broad support and high quality.

### 8. Convergence on an Agreed Solution

Selecting the solution (or set of solutions) that provides the optimal response to the full range of stakeholder needs.

### Learning Loop (Feedback Loop)

The process is **not linear**. At every stage, new gaps may emerge that require returning to earlier stages -- particularly to the SON expansion and solution generation stages.

```
  Stakeholder ID --> Needs --> Question --> SON Expansion
       ^                                       |
       |                                       v
  Convergence <-- Evaluation <-- Refinement <-- Solution Generation
       |                                       ^
       +------------- Feedback Loop -----------+
```

---

## Applications and Interfaces

Wizcol's architecture is based on separating the different deliberation stages, with a dedicated application tailored to each stage. This approach optimizes both the user experience and the algorithmic mechanisms for each phase of the process.

Additionally, a distinction exists between applications designed for **small groups** (tens of participants) and those adapted for **large groups** (hundreds or thousands of participants). This adaptation is essential because discussion dynamics, information load, and required algorithms change fundamentally with group size.

### Main Application (Freedi)

The core application serves as the **generic platform for managing deliberations in small groups**, and also provides the **shared infrastructure** for all other applications.

- **Technology:** React + Vite + TypeScript (SPA)
- **State Management:** Redux Toolkit
- **Backend:** Firebase (Firestore, Auth, Cloud Functions, FCM)
- **Styling:** SCSS Modules + Atomic Design System (BEM)
- **Path:** Root project (`/`)

The main app implements the full deliberation flow: groups, questions, options, discussions, and evaluations. It supports recursive Statement hierarchies, real-time collaboration, and multiple evaluation methods.

### Mass Consensus (MC)

When deliberation needs to scale to a large number of participants -- particularly in the stages of collecting ideas and preferences -- the **Mass Consensus** application is used.

- **Technology:** Next.js 14 (App Router) + TypeScript
- **State Management:** Redux Toolkit
- **Backend:** Firebase + Vercel deployment
- **Path:** `apps/mass-consensus/`

MC is optimized for collecting, filtering, and comparing solutions in large groups. It features a swipe-based evaluation interface, survey flows, and statistical aggregation across large participant pools.

### Sign

In the more advanced stages of the process -- especially during **solution formulation** -- the **Sign** application is used. It enables precise work on drafting, examining, and reaching consensus around concrete solutions.

- **Technology:** Next.js 14 (App Router) + TypeScript
- **Backend:** Firebase + Vercel deployment
- **Path:** `apps/sign/`

Sign supports paragraph-level deliberation on documents, suggestion/evaluation workflows, version control with AI-assisted coherence checking, heatmap visualizations of agreement levels, and signature collection.

### Flow

A lightweight, standalone deliberation experience focused on guided step-by-step participation.

- **Technology:** Vanilla TypeScript (Lit-style components) + Vite
- **Backend:** Firebase
- **Path:** `apps/flow/`

Flow guides participants through a structured sequence: introduction, writing solutions, evaluating others' solutions, and viewing top results.

### Admin

A dashboard for system-wide administration and analytics.

- **Technology:** Vanilla TypeScript + Vite
- **Backend:** Firebase
- **Path:** `apps/admin/`

### Application-to-Stage Mapping

| Deliberation Stage | Small Groups | Large Groups |
|---|---|---|
| Stakeholder & Needs Identification | Main App | -- |
| Question Formulation | Main App | -- |
| SON Expansion (Shared Knowledge) | Main App | Mass Consensus |
| Solution Generation | Main App | Mass Consensus / Flow |
| Solution Refinement | Main App | Sign |
| Evaluation & Comparison | Main App | Mass Consensus |
| Convergence & Agreement | Main App | Sign |

> This separation is not merely technical -- it reflects a fundamental architectural principle: **match the tool to the nature of the stage and the scale of the discussion**, enabling an efficient, precise, and consensus-based process.

---

## Shared Components

The shared components form the **unified infrastructure** upon which all Wizcol applications rely. They ensure consistency across deliberation stages and enable integration of information and insights between different parts of the system.

### Shared Packages

```
packages/
  shared-types/      # TypeScript types & models (+ delib-npm on npm)
  shared-i18n/       # Internationalization (en, he, ar, es, de, nl)
  shared-utils/      # Common utility functions
  engagement-core/   # Engagement system core logic
  e2e-shared/        # Shared E2E testing infrastructure
```

Additionally, the **`delib-npm`** package (published to npm) provides the canonical type definitions used across all apps and Cloud Functions.

### 1. Data Model (Statement-Based)

The fundamental unit in the system is the **Statement** (Hebrew: "Haged").

All deliberation elements -- questions, solutions, messages, comments, paragraphs -- are represented as Statements. Each Statement has a **Statement Type** that distinguishes between content types:

| Type | Purpose |
|---|---|
| `group` | Organizing container for topics |
| `question` | A decision point requiring options |
| `option` | A proposed solution or choice |
| `statement` | Discussion message, comment, or note |

#### Relationships Between Statements

Currently, Statements are organized in a **parent-child hierarchy**, where each Statement stores:

- **`parentId`** -- Link to the parent Statement
- **`parents[]`** -- Full ancestry chain
- **`topParentId`** -- Root Statement identifier

**Future expansion:** The architecture is designed to evolve toward a more flexible **graph structure**, enabling:

- Reusing the same solution across multiple questions
- Complex relationships between ideas
- Support for converging and multi-directional discussions

> For detailed data model documentation including semantic hierarchy rules, sub-option patterns, and real-world examples, see [FREEDI_ARCHITECTURE.md](./FREEDI_ARCHITECTURE.md).

### 2. Popperian-Bayesian Discussion Mechanism

Discussion in the system is based on a combination of:

- **Popperian principles** (falsification, critique)
- **Bayesian updating** (probability revision based on evidence)

Within this framework, participants can:

- **Propose** Statements (ideas, solutions)
- **Falsify or critique** existing Statements
- **Strengthen** Statements with arguments and evidence
- **Suggest alternatives** and improvements

This mechanism drives a **cumulative discussion** where Statement quality improves over time and their credibility level increases through scrutiny.

### 3. Outcomes

Each Statement (or group of Statements) can have associated **outcomes** representing the real-world consequences of that solution.

Outcomes can be measured across multiple dimensions:

- Economic cost
- Social impact
- Risk level
- Environmental impact
- And more domain-specific dimensions

This representation enables a transition from purely ideational discussion to **practical analysis of consequences**.

### 4. Evaluation Engine

The system allows evaluating each Statement along several complementary axes:

#### Corroboration Level
Based on Popperian-Bayesian discussion results -- how well the Statement has withstood critique.

#### Probability of Success
Assessment of the solution's likelihood of success, based on knowledge, experience, and performance context.

#### Outcomes Assessment
Evaluating outcome quality across the defined dimensions.

#### Alignment with Stakeholder Values
Evaluation is not purely objective -- it is **adapted to stakeholder values**, such as:

- Risk tolerance
- Sensitivity to harm to others
- Relative importance of certain outcomes over others

### 5. Solution Selection and Optimization

The system integrates all evaluations and outcomes to identify the solutions best suited to stakeholder needs and values.

From a broad space of possibilities, the system surfaces:

- **Optimal solutions**, or
- **A leading set of solutions**

At this stage, stakeholders can select their preferred solution, which then moves to the execution phase.

### 6. Transition to Execution

After a solution is selected, the process does not end. Additional systems (existing or planned) support implementing the solution in practice, bridging the gap between the decision-making process and real-world action.

---

## Technical Infrastructure

### Backend: Firebase

All applications share a common Firebase project:

- **Firestore** -- Primary database (real-time document store)
- **Firebase Auth** -- Authentication (Google, anonymous)
- **Cloud Functions** -- Server-side logic, triggers, scheduled tasks
- **Firebase Cloud Messaging (FCM)** -- Push notifications
- **Firebase Storage** -- File uploads (logos, images)

### Cloud Functions (`functions/`)

Server-side logic includes:

- **Firestore triggers** -- Cascading updates on Statement changes
- **Subscription management** -- Tracking user participation
- **Engagement system** -- Credits, badges, streaks, notifications
- **Scheduled tasks** -- Digest emails, cleanup jobs

### Deployment

| Application | Platform | Command |
|---|---|---|
| Main App | Firebase Hosting | `npm run deploy:prod` |
| Mass Consensus | Vercel | Vercel CI/CD |
| Sign | Vercel | Vercel CI/CD |
| Flow | Firebase Hosting | -- |
| Admin | Firebase Hosting | -- |
| Cloud Functions (prod) | Firebase | `npm run deploy:f:prod` |
| Cloud Functions (test) | Firebase | `npm run deploy:f:test` |

---

## Architecture Principles

### 1. Separation of Concerns
Each application addresses a specific deliberation stage and participant scale, avoiding one-size-fits-all compromises.

### 2. Unified Data Model
All apps share the Statement-based data model via `delib-npm` and `shared-types`, ensuring interoperability.

### 3. Scale-Appropriate Design
Small-group tools (Main App) differ fundamentally from large-group tools (MC, Sign) in UX patterns, algorithms, and data access strategies.

### 4. Cumulative Process
The architecture supports iterative refinement -- discussions build on each other, knowledge accumulates, and solutions improve over time.

### 5. Value-Aligned Decision Making
Evaluation is not purely objective; it incorporates stakeholder values, making the system suitable for complex, multi-stakeholder scenarios.

---

## Related Documentation

- **[FREEDI_ARCHITECTURE.md](./FREEDI_ARCHITECTURE.md)** -- Unified Statement model, semantic hierarchy, and data patterns
- **[ARCHITECTURE_PHILOSOPHY.md](./ARCHITECTURE_PHILOSOPHY.md)** -- Design patterns and improvement recommendations
- **[01-critical-issues.md](./01-critical-issues.md)** through **[07-developer-experience.md](./07-developer-experience.md)** -- Technical improvement roadmap
- **[IN_APP_NOTIFICATIONS_ARCHITECTURE.md](./IN_APP_NOTIFICATIONS_ARCHITECTURE.md)** -- Notification system design
- **[functions/](./functions/)** -- Cloud Functions architecture documents
