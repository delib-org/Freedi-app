# Compound Question Wizard

A structured multi-stage deliberation process that guides groups through defining a question, identifying sub-questions, finding solutions, and resolving via the Sign app.

---

## Overview

A compound question is a regular Statement with `questionType: 'compound'`. It adds a `compoundSettings` object that tracks phases, locks, and cross-app links. No new Firestore collections are needed — everything lives on existing Statement documents.

### Why Compound Questions?

Simple questions work well for focused deliberation on a single topic. But complex issues require a structured process:

1. **Define** the core question through discussion
2. **Break it down** into sub-questions
3. **Find solutions** that address the sub-questions
4. **Resolve** by sending top solutions to Sign for formal approval

---

## User Flow

### Creating a Compound Question

1. Navigate to any question page
2. Tap the `+` button at the bottom — it expands to show two options:
   - **Main button** (click again) — creates a simple question
   - **Blue steps button** — creates a compound question
3. Fill in the title and description
4. The compound question is created in Phase 1 (Define Question)

### The 4 Phases

A horizontal stepper at the top of the compound question shows progress through the phases. Admin users control phase advancement.

#### Phase 1: Define Question

- Participants discuss and refine the main question title
- Admin can **lock the title** once consensus is reached
- Locked title shows a yellow banner and cannot be changed

#### Phase 2: Sub-Questions

- Participants add sub-questions that need to be addressed
- Admin can **lock individual sub-questions** when they're finalized
- Locked sub-questions show with a lock indicator
- Unlocked sub-questions remain editable

#### Phase 3: Find Solutions

- Admin creates a **solution question** (auto-titled based on the locked title)
- Participants propose and evaluate solutions
- Optionally link to a Mass Consensus survey for broader input

#### Phase 4: Resolution

- Top solutions are displayed ranked by consensus
- Admin can **send solutions to Sign** for formal approval
- Each sent solution shows a "Sent to Sign" badge with a link

### Admin Controls

Admin users see phase controls throughout:

- **Lock Title** (Phase 1) — freezes the question text
- **Lock** (Phase 2) — locks individual sub-questions
- **Previous Phase** / **Next Phase** — navigate between phases
- **Create Solution Question** (Phase 3) — creates the solution collection
- **Send to Sign** (Phase 4) — creates a Sign document from a solution

Phase transitions are recorded in an audit trail (`phaseHistory`).

---

## Data Model

### CompoundSettings (on QuestionSettings)

```typescript
{
  currentPhase: CompoundPhase;           // 'define-question' | 'sub-questions' | 'find-solutions' | 'resolution'
  lockedTitle?: {                        // Set when admin locks the title in Phase 1
    lockedText: string;
    lockedBy: string;                    // userId
    lockedAt: number;                    // milliseconds
  };
  lockedSubQuestionIds?: string[];       // Statement IDs of locked sub-questions
  solutionQuestionId?: string;           // Statement ID of the Phase 3 solution question
  signDocumentIds?: Array<{              // Solutions sent to Sign
    solutionId: string;
    signDocumentId: string;
    sentAt: number;
    sentBy: string;
  }>;
  mcSurveyId?: string;                  // Mass Consensus survey ID (if linked)
  phaseHistory?: Array<{                 // Audit trail of phase transitions
    from: CompoundPhase;
    to: CompoundPhase;
    changedBy: string;
    changedAt: number;
    reason?: string;
  }>;
}
```

### Statement.locked (generic, reusable)

Any statement can be locked by an admin:

```typescript
{
  isLocked: boolean;
  lockedBy?: string;     // userId
  lockedAt?: number;     // milliseconds
  lockedText?: string;   // frozen text at lock time
}
```

### Statement Hierarchy

```
Compound Question (type=question, questionType=compound)
  +-- Sub-Question 1 (type=question, locked=true)
  +-- Sub-Question 2 (type=question, locked=true)
  +-- Sub-Question 3 (type=question, locked=false)
  +-- Solution Question (type=question, referenced by solutionQuestionId)
       +-- Solution A (type=option)
       +-- Solution B (type=option)
       +-- Solution C (type=option)
```

---

## Architecture

### Shared Types (`packages/shared-types`)

| File | What |
|------|------|
| `models/TypeEnums.ts` | `compound` added to `QuestionType` enum |
| `models/question/CompoundQuestionTypes.ts` | `CompoundPhase`, `CompoundSettings`, `StatementLocked` types + Valibot schemas |
| `models/question/QuestionType.ts` | `compoundSettings` added to `QuestionSettingsSchema` |
| `models/statement/StatementTypes.ts` | `locked` field added to `StatementSchema` |

### Controllers (`src/controllers/db/compoundQuestion/`)

| File | Purpose |
|------|---------|
| `setCompoundPhase.ts` | Advance/revert phase with audit trail |
| `lockStatement.ts` | Lock statements, lock compound title, unlock |
| `createSolutionQuestion.ts` | Create Phase 3 solution question via `createStatementObject()` |
| `sendToSign.ts` | Create a Sign document from a solution |

### Hooks (`src/controllers/hooks/compoundQuestion/`)

| Hook | Purpose |
|------|---------|
| `useCompoundPhase(statement)` | Returns `currentPhase`, `advancePhase()`, `revertPhase()`, `isAdmin` |
| `useCompoundSubQuestions(statement)` | Returns `subQuestions`, `lockedSubQuestions`, `unlockedSubQuestions` |
| `useCompoundSolutions(statement)` | Returns `solutionQuestion`, `solutions`, `hasSolutionQuestion` |

No new Redux slices — all data derived from existing `state.statements.statements` via `useMemo`.

### UI Components (`src/view/pages/statement/.../compound/`)

```
compound/
+-- CompoundQuestion.tsx              # Orchestrator: stepper + phase router
+-- CompoundQuestion.module.scss
+-- index.ts
+-- components/
|   +-- CompoundPhaseStepper.tsx       # 4-step progress bar (BEM classes from global SCSS)
|   +-- PhaseAdminControls.tsx         # Lock/advance buttons (admin only)
|   +-- LockedBanner.tsx              # Yellow banner for locked content
+-- phases/
    +-- DefineQuestionPhase.tsx        # Phase 1: title deliberation
    +-- SubQuestionsPhase.tsx          # Phase 2: sub-question management
    +-- FindSolutionsPhase.tsx         # Phase 3: solution collection
    +-- ResolutionPhase.tsx           # Phase 4: Sign integration
```

### SCSS Molecules (`src/view/style/molecules/`)

- `_compound-question.scss` — layout wrapper
- `_compound-stepper.scss` — 4-step progress indicator (BEM)
- `_phase-admin-controls.scss` — admin action buttons
- `_locked-banner.scss` — lock notification banner

### Entry Points

| Location | What happens |
|----------|-------------|
| `SwitchScreen.tsx` → `ViewByActiveTab` | If statement is compound, renders `<CompoundQuestion />` instead of tabs |
| `StatementBottomNav.tsx` | `+` button expands with compound question option |
| `QuestionSettings.tsx` | Question type dropdown includes "Compound Question" |
| `createStatementWithSubscription.ts` | Carries over `compoundSettings` when creating compound questions |

---

## Design Decisions

- **No new Firestore collections** — all data on existing Statement documents
- **Generic locking** — `locked` field reusable beyond compound questions
- **Admin-controlled phases** — participants discuss, admin advances phases
- **Backward compatible** — all new fields optional, existing questions unaffected
- **No new Redux slices** — derived from existing statement state via hooks + useMemo
- **No new routes** — existing `/statement/:statementId` routing handles everything

---

## Translations

28 translation keys added to all 7 language files (en, he, ar, es, de, nl, fa). Key prefix pattern: plain English keys like `"Define Question"`, `"Lock Title"`, `"Compound Question"`, etc.

---

## Future Enhancements

- **MC Integration (Phase 3)** — Create Mass Consensus survey linked to the solution question
- **Sign deep links (Phase 4)** — Direct links to Sign documents for each solution
- **Phase-specific permissions** — Allow participants to only interact with the active phase
- **Phase auto-advance** — Automatically advance when conditions are met (e.g., all sub-questions locked)
- **Compound question templates** — Pre-configured phase settings for common deliberation patterns
