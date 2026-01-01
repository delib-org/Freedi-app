# Fair Evaluation Voting System - Implementation Plan

## Overview

A time-based voting system where users invest "minutes" from their wallet to support answers. Answers are accepted when total contributions reach the answer's cost, with payments deducted proportionally from supporters.

**Target:** All 3 apps (Freedi-Deliberation, Mass Consensus, Freedi Sign)
**Integration:** Uses existing -1 to +1 evaluation system (positive ratings = support)
**Scope:** Full implementation (all 7 parts from spec)

---

## Mathematical Formulas

### Definitions

| Symbol | Description |
|--------|-------------|
| `eᵢ` | User i's evaluation of an answer (-1 to +1) |
| `rᵢ` | User i's positive rating = max(0, eᵢ) |
| `mᵢ` | User i's minutes balance in wallet |
| `C` | Cost of the answer (in minutes) |
| `N` | Total number of users in the group |

### Core Calculations

**1. Positive Rating (per user)**
```
rᵢ = max(0, eᵢ)

Where:
  eᵢ ∈ [-1, +1]  (user's evaluation)
  rᵢ ∈ [0, +1]   (only positive support counts)
```

**2. Weighted Number of Supporters**
```
W = Σ rᵢ  (for all users i)

Example: 5 users rate +1, 3 users rate +0.5
W = 5(1) + 3(0.5) = 6.5
```

**3. Contribution (per user)**
```
cᵢ = rᵢ × mᵢ

Where:
  rᵢ = positive rating
  mᵢ = minutes in user's wallet
```

**4. Total Contribution**
```
T = Σ cᵢ = Σ (rᵢ × mᵢ)  (for all users i)

Example: User A has 10 min, rates +1; User B has 8 min, rates +0.5
T = (1 × 10) + (0.5 × 8) = 14
```

**5. Distance to Goal**
```
D = max(0, C - T)

Where:
  C = answer cost
  T = total contribution

If T ≥ C, then D = 0 (goal reached)
```

**6. Distance to Goal per Supporter**
```
        ⎧ D / W    if W > 0
d =     ⎨
        ⎩ ∞        if W = 0 (no supporters)

This represents: minutes each user needs to receive
for the answer to reach its goal.
```

### Payment Calculation (When Answer is Accepted)

**7. Payment per User**
```
pᵢ = (C / T) × mᵢ × rᵢ

Where:
  C = answer cost
  T = total contribution
  mᵢ = user's minutes balance
  rᵢ = user's positive rating

Note: Only users with rᵢ > 0 pay anything.
```

**Verification: Total payments equal cost**
```
Σ pᵢ = Σ [(C/T) × mᵢ × rᵢ]
     = (C/T) × Σ (mᵢ × rᵢ)
     = (C/T) × T
     = C ✓
```

### Adding Minutes (Admin Action)

**8. Minutes Distribution**
```
When admin adds X total minutes to group:

Δmᵢ = X / N  (for each user i)

Where N = total number of users in the group
Each user receives equal share.
```

### Complete to Goal Calculation

**9. Minutes Needed to Complete**
```
Per user:   x = d = D / W
Total:      Y = x × N = (D / W) × N

Where:
  D = distance to goal
  W = weighted supporters
  N = total users in group
```

### Worked Example

**Setup:**
- Answer cost: C = 80 minutes
- 5 users rate +1.0, each has 10 minutes
- 2 users rate +0.5, each has 6 minutes
- 3 users rate 0 or negative, each has 10 minutes (don't count)

**Calculations:**
```
1. Weighted supporters:
   W = 5(1.0) + 2(0.5) = 6.0

2. Total contribution:
   T = 5(1.0 × 10) + 2(0.5 × 6) = 50 + 6 = 56

3. Distance to goal:
   D = max(0, 80 - 56) = 24

4. Distance per supporter:
   d = 24 / 6.0 = 4 minutes

5. To complete to goal (10 total users):
   Y = 4 × 10 = 40 minutes to add

6. After adding 40 minutes (4 per user):
   - Each user now has +4 minutes
   - New T = 5(1.0 × 14) + 2(0.5 × 10) = 70 + 10 = 80
   - New D = max(0, 80 - 80) = 0 ✓ Goal reached!

7. Payment when accepted (original balances):
   - Each +1.0 supporter pays: (80/56) × 10 × 1.0 = 14.29 min
   - Each +0.5 supporter pays: (80/56) × 6 × 0.5 = 4.29 min
   - Total: 5(14.29) + 2(4.29) = 71.45 + 8.58 ≈ 80 ✓
```

### Fair Acceptance Process (Display Ordering Algorithm)

```
function simulateFairAcceptance(answers, balances, maxRounds):
  accepted = []

  for round = 1 to maxRounds:

    // Step 1: Accept any answer at goal (D = 0)
    atGoal = answers where D = 0 and not accepted
    if atGoal is not empty:
      winner = atGoal with highest T
      accepted.append(winner)
      deductPayments(winner, balances)
      recalculateAll(answers, balances)
      continue

    // Step 2: Find answer closest to goal
    withSupport = answers where W > 0 and not accepted
    if withSupport is empty:
      break

    nextUp = withSupport with smallest d
    minutesToAdd = nextUp.d

    // Step 3: Add minutes to bring nextUp to goal
    for each user:
      balances[user] += minutesToAdd

    recalculateAll(answers, balances)
    // Loop continues, nextUp will now be at goal

  return accepted  // Ordered list for display
```

---

## Part 1: Data Models (packages/shared-types)

### New File: `packages/shared-types/src/models/fairEvaluation/index.ts`

```typescript
// User Wallet per Group
FairEvalWalletSchema = {
  walletId: string,           // ${topParentId}--${userId}
  userId: string,
  topParentId: string,        // Group scope
  balance: number,            // Current minutes
  totalReceived: number,
  totalSpent: number,
  createdAt: number,
  lastUpdate: number,
}

// Transaction History
FairEvalTransactionSchema = {
  transactionId: string,
  topParentId: string,
  userId: string,
  type: 'join' | 'admin_add' | 'payment' | 'refund',
  amount: number,
  balanceBefore: number,
  balanceAfter: number,
  answerStatementId?: string,  // For payments
  adminId?: string,            // For admin_add
  note?: string,
  createdAt: number,
}

// Answer Metrics (cached on statement)
FairEvalAnswerMetricsSchema = {
  answerStatementId: string,
  parentStatementId: string,
  answerCost: number,
  weightedSupporters: number,      // Σ max(0, evaluation)
  totalContribution: number,       // Σ (positive_rating × wallet_balance)
  distanceToGoal: number,          // max(0, cost - totalContribution)
  distancePerSupporter: number,    // distance / weighted (Infinity if 0)
  isAccepted: boolean,
  acceptedAt?: number,
  acceptedBy?: string,
  lastCalculation: number,
}

// Question Settings (add to Statement)
FairEvalQuestionSettingsSchema = {
  isFairEvalQuestion: boolean,
  walletLevel: 'topParent' | 'parent' | 'self',
  defaultAnswerCost: number,       // Default: 1000
}
```

### Extend Statement Model

Add to `StatementTypes.ts`:
- `fairEvalSettings?: FairEvalQuestionSettings` (for questions)
- `fairEvalMetrics?: FairEvalAnswerMetrics` (for answers)
- `answerCost?: number` (for answers, defaults to parent's defaultAnswerCost)

**Note on Answer Cost:**
- Answer cost is set by **admin only**, not by answer creator
- This prevents manipulation (creator setting very low cost to force quick acceptance)
- Admin can modify answer cost at any time before acceptance

### New Collections

Add to `collectionsModel.ts`:
- `fairEvalWallets`
- `fairEvalTransactions`

---

## Part 2: Core Algorithms

### File: `packages/shared-types/src/helpers/fairEvalCalculations.ts`

```typescript
// Pure functions (shared client/server)

getPositiveRating(evaluation: number): number
  → Math.max(0, evaluation)

calculateAnswerMetrics(cost, userEvaluations[]): AnswerMetrics
  → { weightedSupporters, totalContribution, distanceToGoal, distancePerSupporter }

calculateUserPayment(cost, totalContribution, userMinutes, positiveRating): number
  → (cost / totalContribution) × userMinutes × positiveRating

calculateCompleteToGoal(distancePerSupporter, totalUsers): { perUser, total }

simulateFairAcceptance(answers[], balances, maxRounds=10): orderedStatementIds[]
  → Fair acceptance process simulation for display ordering
```

---

## Part 3: Cloud Functions

### File: `functions/src/fn_fairEvaluation.ts`

| Function | Trigger | Purpose |
|----------|---------|---------|
| `initializeWallet` | `onDocumentCreated(statementsSubscribe)` | Create wallet with 10 min when user joins group |
| `onFairEvalEvaluationChange` | `onDocumentWritten(evaluations)` | Recalculate single answer metrics |
| `addMinutesToGroup` | HTTP (admin) | Distribute minutes equally to all members |
| `setAnswerCost` | HTTP (admin) | Update answer cost, recalculate metrics |
| `acceptFairEvalAnswer` | HTTP (admin) | Accept answer, deduct payments, recalculate all |
| `completeToGoal` | HTTP (admin) | Add required minutes then accept |

### Key Implementation Notes:
- Use Firestore transactions for atomicity
- Batch operations for >500 updates
- Recalculate ALL answer metrics after acceptance (balances changed)
- `setAnswerCost` validates admin permission and answer not yet accepted

---

## Part 4: UI Components

### Atomic Design Structure

**Atoms:**
- `StatusIndicator` - Color-coded status indicator
  - 🟢 **GREEN:** Answer reached goal (distanceToGoal = 0)
  - 🟡 **YELLOW:** Has supporters but not at goal (distanceToGoal > 0, weightedSupporters > 0)
  - 🔴 **RED:** No supporters (weightedSupporters = 0, distanceToGoal = Infinity)
- `WalletIcon` - Clock-in-wallet icon
  - **Usage:** Displayed on EVERY page within the group
  - **Location:** Header or persistent UI element
  - **Format:** [Icon] XX minutes
  - **Updates:** Real-time as balance changes

**Molecules:**
- `WalletDisplay` - Balance display (compact for header, expanded for detail)
- `AnswerCard` - Answer with metrics, progress bar, status, answer cost, admin controls
  - **Must display:** answerCost field prominently
  - **Admin controls:** "Accept" or "Complete to Goal" buttons ON the card (not in separate panel)
- `HistoryItem` - Transaction timeline item with color-coding and icons
- `SupportedTopicsSummary` - Shows user how many topics they support on main page

**Organisms:**
- `FairEvalSection` - Question wrapper with visual distinction
- `CompleteToGoalDialog` - Modal showing calculation and confirmation
  - Message: "To bring this answer to goal, you need to add X minutes per user, totaling Y minutes"
  - X = distancePerSupporter, Y = distancePerSupporter × totalUsers
  - "Add Minutes" button triggers addMinutesToGroup(Y)

### SCSS Files (BEM naming)

```
src/view/style/
├── atoms/_status-indicator.scss
├── atoms/_wallet-icon.scss
├── molecules/_wallet-display.scss
├── molecules/_answer-card.scss
├── molecules/_history-item.scss
├── molecules/_supported-topics-summary.scss
├── organisms/_fair-eval-section.scss
└── organisms/_complete-to-goal-dialog.scss
```

### Translation Keys (add to all 6 languages)

```json
{
  "fairEvaluation": "Fair Evaluation",
  "walletBalance": "Balance",
  "minutes": "minutes",
  "cost": "Cost",
  "weightedSupporters": "Weighted Supporters",
  "totalContribution": "Total Contribution",
  "distanceToGoal": "Distance to Goal",
  "distancePerSupporter": "Distance per Supporter",
  "goalReached": "Goal Reached",
  "hasSupport": "Has Support",
  "noSupport": "No Support",
  "addMinutes": "Add Minutes",
  "acceptAnswer": "Accept Answer",
  "completeToGoal": "Complete to Goal",
  "completeToGoalDialog": {
    "title": "Complete Answer to Goal",
    "message": "To bring this answer to goal, you need to add {{perUser}} minutes per user, totaling {{total}} minutes",
    "addButton": "Add Minutes",
    "cancel": "Cancel"
  },
  "history": {
    "pageTitle": "History",
    "join": "You joined the group, received {{amount}} minutes",
    "adminAdd": "Admin gave you {{amount}} minutes",
    "payment": "Admin accepted {{answerTitle}}, which costs {{cost}} minutes. Total weighted supporters: {{supporters}}. Each supporter at level 1.0 paid {{perSupporter}} minutes. You supported at level {{level}}, so you paid {{paid}} minutes",
    "nonPayment": "Admin accepted {{answerTitle}}, which costs {{cost}} minutes. Total weighted supporters: {{supporters}}. Each supporter at level 1.0 paid {{perSupporter}} minutes. You did not support this answer, so you paid nothing. As compensation, you can use your minutes to support other answers in the future",
    "newBalance": "New balance: {{balance}} minutes",
    "eventTypes": {
      "join": "Joined Group",
      "adminAdd": "Minutes Added",
      "payment": "Answer Accepted (Paid)",
      "nonPayment": "Answer Accepted (No Payment)"
    }
  },
  "outOfTopics": "Out of {{total}} topics on the main page, {{supported}} are ones you support",
  "supportedTopicsExplanation": "Your opinion matters and influences which topics appear on the main page"
}
```

---

## Part 5: State Management

### Freedi-Deliberation (Redux)

New slice: `src/redux/fairEval/fairEvalSlice.ts`
- State: `{ wallets, metrics, transactions, isLoading }`
- Selectors with simulation for ordering

### Mass Consensus (React Context)

New context: `apps/mass-consensus/src/context/FairEvalContext.tsx`
- Server components for initial data
- Client components for interactions

---

## Part 6: Display Ordering

Default order = simulation result of "fair acceptance process":
1. Accept answers at goal (highest contribution first)
2. Find smallest distance-per-supporter, simulate adding minutes
3. Repeat for `pageSize` rounds (default 10)

This runs client-side (read-only) using cached metrics.

**Supported Topics Summary:**
- Display near top of main page: "Out of 10 topics on the main page, 4 are ones you support"
- Purpose: Show user their opinion matters and influences which topics appear
- Location: Main page header or user dashboard area

---

## Part 7: History Page - Complete Specification

### Overview
Per-user, per-group timeline showing all wallet activity. Each user sees different history per group (no connection between groups).

### Structure
- **Chronological list:** Earliest at bottom, latest at top
- **Each event shows:**
  - Timestamp (date and time)
  - Event-specific text (detailed below)
  - Balance change (+/- minutes)
  - New balance (after event)
  - Unique color/icon per event type

### Event Types

#### 1. Join Event (First Event Only)
- **Text:** "You joined the group, received 10 minutes"
- **Icon:** 🎉 or welcome icon
- **Color:** Blue
- **Balance Change:** +10

#### 2. Admin Add Minutes
- **Text:** "Admin gave you X minutes"
- **Icon:** ➕ or gift icon
- **Color:** Green
- **Balance Change:** +X

#### 3. Payment (Supported Answer Accepted)
- **Text:** "Admin accepted [Answer Title] (link), which costs X minutes. Total weighted supporters: Y. Each supporter at level 1.0 paid Z minutes. You supported at level R, so you paid R×Z minutes"
- **Icon:** ✅ or payment icon
- **Color:** Orange/amber
- **Balance Change:** -(R×Z)
- **Components:**
  - Clickable link to answer statement
  - Formula shown: Z = answerCost / totalContribution
  - User's support level (R) highlighted
  - Calculation transparency: "You paid (your level) × (base payment)"

#### 4. Non-Payment (Unsupported Answer Accepted)
- **Text:** "Admin accepted [Answer Title] (link), which costs X minutes. Total weighted supporters: Y. Each supporter at level 1.0 paid Z minutes. You did not support this answer, so you paid nothing. As compensation, you can use your minutes to support other answers in the future"
- **Icon:** ℹ️ or info icon
- **Color:** Gray/neutral
- **Balance Change:** 0
- **Purpose:** 
  - Reassure user they didn't lose minutes
  - Encourage future participation
  - Transparency about what happened in the group

### Implementation Details

```typescript
interface HistoryItemProps {
  type: 'join' | 'admin_add' | 'payment' | 'non_payment';
  timestamp: number;
  amount: number;  // Can be negative for payments
  newBalance: number;
  answerLink?: string;  // For payment/non_payment events
  answerTitle?: string;
  metadata?: {
    answerCost?: number;
    weightedSupporters?: number;
    paymentPerFullSupporter?: number;  // Z in formula
    userSupportLevel?: number;  // R in formula
    userPayment?: number;  // Final amount user paid
  };
}
```

### Visual Design
- **Layout:** Timeline/vertical layout
- **Event Distinction:** Color-coded left border OR background per event type
- **Icon Placement:** Left side of each event
- **Details:** Collapsible sections for complex events (payment explanations)
- **Links:** Answer links are clickable, open in new context
- **Mobile:** Stack information vertically, maintain color coding

### Scope
- **Per Group:** Each group has separate history
- **No Cross-Group Data:** Balances and events are isolated
- **User-Specific:** Only shows events relevant to current user

### Edge Cases
- Empty history (new user): Show welcome message
- Many events: Pagination or infinite scroll
- Long answer titles: Truncate with ellipsis, full title on hover
- Failed transactions: Show with error icon, allow retry if applicable

---

## Critical Files to Create/Modify

### Create:
1. `packages/shared-types/src/models/fairEvaluation/index.ts` - Types
2. `packages/shared-types/src/helpers/fairEvalCalculations.ts` - Algorithms
3. `functions/src/fn_fairEvaluation.ts` - Cloud Functions
4. `src/redux/fairEval/fairEvalSlice.ts` - Redux state
5. `src/view/style/molecules/_answer-card.scss` - Styles
6. `src/view/style/molecules/_history-item.scss` - History styles
7. `src/view/style/molecules/_supported-topics-summary.scss` - Summary styles
8. `src/view/style/organisms/_complete-to-goal-dialog.scss` - Dialog styles
9. `src/view/components/atomic/molecules/AnswerCard/` - React wrapper
10. `src/view/components/atomic/molecules/HistoryItem/` - History component
11. `src/view/components/atomic/molecules/SupportedTopicsSummary/` - Summary component
12. `src/view/components/atomic/organisms/CompleteToGoalDialog/` - Dialog component
13. `src/view/pages/HistoryPage/` - Full history page

### Modify:
1. `packages/shared-types/src/models/statement/StatementTypes.ts` - Add fairEval fields
2. `packages/shared-types/src/models/collections/collectionsModel.ts` - Add collections
3. `packages/shared-types/src/index.ts` - Export new types
4. `packages/shared-i18n/src/languages/*.json` - Add translations (6 files)
5. `functions/src/index.ts` - Register new functions
6. `firestore.rules` - Add rules for new collections

---

## Implementation Phases

### Phase 1: Foundation (Types & Collections)
- [ ] Create FairEvaluation types in shared-types
- [ ] Add collections to collectionsModel
- [ ] Add Firestore indexes
- [ ] Add security rules

### Phase 2: Backend (Cloud Functions)
- [ ] Implement wallet initialization on join
- [ ] Implement evaluation change trigger
- [ ] Implement addMinutesToGroup HTTP function
- [ ] Implement setAnswerCost HTTP function
- [ ] Implement acceptFairEvalAnswer HTTP function
- [ ] Implement completeToGoal HTTP function
- [ ] Add unit tests for calculations

### Phase 3: Frontend Core - Freedi-Deliberation
- [ ] Create Redux slice and selectors
- [ ] Create SCSS styles (atomic design)
- [ ] Create basic React components (atoms & molecules)
- [ ] Add translations
- [ ] Implement WalletIcon in header (persistent display)

### Phase 4: Frontend Advanced - Freedi-Deliberation
- [ ] Complete AnswerCard with admin controls on card
- [ ] Implement CompleteToGoalDialog
- [ ] Implement SupportedTopicsSummary on main page
- [ ] Complete History page with all event types
- [ ] Integrate with existing question views

### Phase 5: Frontend - Mass Consensus
- [ ] Create React Context
- [ ] Adapt components for Next.js
- [ ] Integrate with survey flow

### Phase 6: Frontend - Freedi Sign
- [ ] Assess if feature applies
- [ ] Integrate if needed

### Phase 7: Testing & Polish
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Edge case handling
- [ ] User acceptance testing

---

## Edge Cases to Handle

| Case | Solution |
|------|----------|
| 0 supporters | distancePerSupporter = Infinity, excluded from simulation |
| User has no wallet | Create on first evaluation with 0 balance |
| Concurrent transactions | Firestore transactions ensure atomicity |
| Answer cost = 0 | Immediately at goal |
| All users have 0 balance | Show "waiting for minutes" state |
| Admin changes cost after votes | Recalculate all metrics, notify users if significant change |
| User leaves group | Wallet remains (historical record), no future updates |
| Very long answer titles | Truncate in history with ellipsis, full title on hover/expand |
| Network failure during payment | Transaction rollback, show retry option |

---

## Estimated Scope

- **New files:** ~20-25
- **Modified files:** ~12-15
- **New translations:** ~35 keys × 6 languages
- **New Cloud Functions:** 6
- **New Redux reducers:** ~5
- **New UI components:** ~12

---

## Detailed Implementation Code

### 1. Valibot Schemas (Complete)

```typescript
// packages/shared-types/src/models/fairEvaluation/index.ts
import { object, string, number, boolean, optional, enum_, InferOutput } from 'valibot';

export enum FairEvalTransactionType {
  join = 'join',
  admin_add = 'admin_add',
  payment = 'payment',
  refund = 'refund',
}

export enum WalletLevel {
  topParent = 'topParent',
  parent = 'parent',
  self = 'self',
}

export const FairEvalWalletSchema = object({
  walletId: string(),
  userId: string(),
  topParentId: string(),
  balance: number(),
  totalReceived: number(),
  totalSpent: number(),
  createdAt: number(),
  lastUpdate: number(),
});

export const FairEvalTransactionSchema = object({
  transactionId: string(),
  topParentId: string(),
  userId: string(),
  type: enum_(FairEvalTransactionType),
  amount: number(),
  balanceBefore: number(),
  balanceAfter: number(),
  answerStatementId: optional(string()),
  answerTitle: optional(string()),
  adminId: optional(string()),
  note: optional(string()),
  metadata: optional(object({
    answerCost: optional(number()),
    weightedSupporters: optional(number()),
    paymentPerFullSupporter: optional(number()),
    userSupportLevel: optional(number()),
    userPayment: optional(number()),
  })),
  createdAt: number(),
});

export const FairEvalAnswerMetricsSchema = object({
  answerStatementId: string(),
  parentStatementId: string(),
  answerCost: number(),
  weightedSupporters: number(),
  totalContribution: number(),
  distanceToGoal: number(),
  distancePerSupporter: number(),
  isAccepted: boolean(),
  acceptedAt: optional(number()),
  acceptedBy: optional(string()),
  lastCalculation: number(),
});

export const FairEvalQuestionSettingsSchema = object({
  isFairEvalQuestion: boolean(),
  walletLevel: optional(enum_(WalletLevel)),
  defaultAnswerCost: optional(number()),
});

export type FairEvalWallet = InferOutput<typeof FairEvalWalletSchema>;
export type FairEvalTransaction = InferOutput<typeof FairEvalTransactionSchema>;
export type FairEvalAnswerMetrics = InferOutput<typeof FairEvalAnswerMetricsSchema>;
export type FairEvalQuestionSettings = InferOutput<typeof FairEvalQuestionSettingsSchema>;
```

### 2. Core Calculation Functions (Complete)

```typescript
// packages/shared-types/src/helpers/fairEvalCalculations.ts

export interface UserEvaluationData {
  userId: string;
  evaluation: number;  // -1 to +1
  walletBalance: number;
}

export interface AnswerMetricsResult {
  weightedSupporters: number;
  totalContribution: number;
  distanceToGoal: number;
  distancePerSupporter: number;
}

export function getPositiveRating(evaluation: number): number {
  return Math.max(0, evaluation);
}

export function calculateAnswerMetrics(
  answerCost: number,
  userEvaluations: UserEvaluationData[]
): AnswerMetricsResult {
  let weightedSupporters = 0;
  let totalContribution = 0;

  for (const user of userEvaluations) {
    const positiveRating = getPositiveRating(user.evaluation);
    weightedSupporters += positiveRating;
    totalContribution += positiveRating * user.walletBalance;
  }

  const distanceToGoal = Math.max(0, answerCost - totalContribution);
  const distancePerSupporter = weightedSupporters > 0
    ? distanceToGoal / weightedSupporters
    : Infinity;

  return {
    weightedSupporters,
    totalContribution,
    distanceToGoal,
    distancePerSupporter,
  };
}

export function calculateUserPayment(
  answerCost: number,
  totalContribution: number,
  userMinutes: number,
  positiveRating: number
): number {
  if (totalContribution === 0) return 0;
  return (answerCost / totalContribution) * userMinutes * positiveRating;
}

export function calculateCompleteToGoal(
  distancePerSupporter: number,
  totalUsers: number
): { perUser: number; total: number } {
  if (!isFinite(distancePerSupporter) || distancePerSupporter <= 0) {
    return { perUser: 0, total: 0 };
  }
  return {
    perUser: distancePerSupporter,
    total: distancePerSupporter * totalUsers,
  };
}

// Fair Acceptance Process Simulation
export function simulateFairAcceptance(
  answers: Array<{
    statementId: string;
    cost: number;
    evaluations: UserEvaluationData[];
  }>,
  userBalances: Map<string, number>,
  maxRounds: number = 10
): string[] {
  const balances = new Map(userBalances);
  const acceptedAnswers: string[] = [];
  const metricsCache = new Map<string, AnswerMetricsResult>();

  // Initial calculation
  const recalculate = () => {
    for (const answer of answers) {
      if (acceptedAnswers.includes(answer.statementId)) continue;
      const evals = answer.evaluations.map(e => ({
        ...e,
        walletBalance: balances.get(e.userId) ?? 0,
      }));
      metricsCache.set(answer.statementId, calculateAnswerMetrics(answer.cost, evals));
    }
  };

  recalculate();

  for (let round = 0; round < maxRounds; round++) {
    // Find answers at goal
    const atGoal = answers.filter(a => {
      if (acceptedAnswers.includes(a.statementId)) return false;
      const m = metricsCache.get(a.statementId);
      return m && m.distanceToGoal === 0;
    });

    if (atGoal.length > 0) {
      // Accept highest contribution
      const winner = atGoal.reduce((best, curr) => {
        const bm = metricsCache.get(best.statementId)!;
        const cm = metricsCache.get(curr.statementId)!;
        return cm.totalContribution > bm.totalContribution ? curr : best;
      });

      acceptedAnswers.push(winner.statementId);