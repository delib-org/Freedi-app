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
| `acceptFairEvalAnswer` | HTTP (admin) | Accept answer, deduct payments, recalculate all |
| `completeToGoal` | HTTP (admin) | Add required minutes then accept |

### Key Implementation Notes:
- Use Firestore transactions for atomicity
- Batch operations for >500 updates
- Recalculate ALL answer metrics after acceptance (balances changed)

---

## Part 4: UI Components

### Atomic Design Structure

**Atoms:**
- `StatusIndicator` - Green/Yellow/Red status dots
- `WalletIcon` - Clock-in-wallet icon

**Molecules:**
- `WalletDisplay` - Balance display (compact for header, expanded for detail)
- `AnswerCard` - Answer with metrics, progress bar, status
- `HistoryItem` - Transaction timeline item

**Organisms:**
- `FairEvalSection` - Question wrapper with visual distinction
- `FairEvalAdminPanel` - Add minutes, accept/complete controls

### SCSS Files (BEM naming)

```
src/view/style/
├── atoms/_status-indicator.scss
├── atoms/_wallet-icon.scss
├── molecules/_wallet-display.scss
├── molecules/_answer-card.scss
├── molecules/_history-item.scss
└── organisms/_fair-eval-section.scss
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
  "history": "History",
  "outOfTopics": "Out of {{total}} topics, {{supported}} are ones you support"
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

---

## Part 7: History Page

Per-user, per-group timeline showing:
- Join events (initial 10 min)
- Admin additions
- Payments (supported answers accepted)
- Non-payments (answers accepted user didn't support)

Each event shows: date, description, balance change, new balance.

---

## Critical Files to Create/Modify

### Create:
1. `packages/shared-types/src/models/fairEvaluation/index.ts` - Types
2. `packages/shared-types/src/helpers/fairEvalCalculations.ts` - Algorithms
3. `functions/src/fn_fairEvaluation.ts` - Cloud Functions
4. `src/redux/fairEval/fairEvalSlice.ts` - Redux state
5. `src/view/style/molecules/_answer-card.scss` - Styles
6. `src/view/components/atomic/molecules/AnswerCard/` - React wrapper

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
- [ ] Implement acceptFairEvalAnswer HTTP function
- [ ] Implement completeToGoal HTTP function
- [ ] Add unit tests for calculations

### Phase 3: Frontend - Freedi-Deliberation
- [ ] Create Redux slice and selectors
- [ ] Create SCSS styles (atomic design)
- [ ] Create React components
- [ ] Add translations
- [ ] Integrate with existing question views

### Phase 4: Frontend - Mass Consensus
- [ ] Create React Context
- [ ] Adapt components for Next.js
- [ ] Integrate with survey flow

### Phase 5: Frontend - Freedi Sign
- [ ] Assess if feature applies
- [ ] Integrate if needed

### Phase 6: Testing & Polish
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Edge case handling

---

## Edge Cases to Handle

| Case | Solution |
|------|----------|
| 0 supporters | distancePerSupporter = Infinity, excluded from simulation |
| User has no wallet | Create on first evaluation with 0 balance |
| Concurrent transactions | Firestore transactions ensure atomicity |
| Answer cost = 0 | Immediately at goal |
| All users have 0 balance | Show "waiting for minutes" state |

---

## Estimated Scope

- **New files:** ~15-20
- **Modified files:** ~10-12
- **New translations:** ~20 keys × 6 languages
- **New Cloud Functions:** 5
- **New Redux reducers:** ~5
- **New UI components:** ~8

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
  adminId: optional(string()),
  note: optional(string()),
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

      // Deduct payments
      const wm = metricsCache.get(winner.statementId)!;
      for (const e of winner.evaluations) {
        const pr = getPositiveRating(e.evaluation);
        if (pr > 0) {
          const bal = balances.get(e.userId) ?? 0;
          const pay = calculateUserPayment(winner.cost, wm.totalContribution, bal, pr);
          balances.set(e.userId, bal - pay);
        }
      }
      recalculate();
      continue;
    }

    // Find smallest distance per supporter
    const withSupporters = answers.filter(a => {
      if (acceptedAnswers.includes(a.statementId)) return false;
      const m = metricsCache.get(a.statementId);
      return m && m.weightedSupporters > 0 && isFinite(m.distancePerSupporter);
    });

    if (withSupporters.length === 0) break;

    const nextUp = withSupporters.reduce((best, curr) => {
      const bm = metricsCache.get(best.statementId)!;
      const cm = metricsCache.get(curr.statementId)!;
      return cm.distancePerSupporter < bm.distancePerSupporter ? curr : best;
    });

    const toAdd = metricsCache.get(nextUp.statementId)!.distancePerSupporter;

    // Add minutes to all
    for (const [uid, bal] of balances) {
      balances.set(uid, bal + toAdd);
    }
    recalculate();
  }

  return acceptedAnswers;
}
```

### 3. Cloud Function: Accept Answer (Core Logic)

```typescript
// functions/src/fn_fairEvaluation.ts (partial)

export const acceptFairEvalAnswer = onCall(async (request) => {
  const { answerStatementId, adminId } = request.data;
  const db = admin.firestore();

  return db.runTransaction(async (transaction) => {
    // 1. Get answer and validate
    const answerRef = db.collection('statements').doc(answerStatementId);
    const answerDoc = await transaction.get(answerRef);
    const answer = answerDoc.data();

    if (!answer || answer.fairEvalMetrics?.isAccepted) {
      throw new Error('Invalid or already accepted');
    }

    const { answerCost, totalContribution } = answer.fairEvalMetrics;
    const parentId = answer.parentId;

    // 2. Get all evaluations for this answer
    const evalsSnapshot = await db.collection('evaluations')
      .where('statementId', '==', answerStatementId)
      .get();

    // 3. Process each supporter
    const now = Date.now();
    for (const evalDoc of evalsSnapshot.docs) {
      const eval_ = evalDoc.data();
      const positiveRating = Math.max(0, eval_.evaluation);
      if (positiveRating <= 0) continue;

      const walletId = `${parentId}--${eval_.evaluatorId}`;
      const walletRef = db.collection('fairEvalWallets').doc(walletId);
      const walletDoc = await transaction.get(walletRef);
      const wallet = walletDoc.data();

      const payment = (answerCost / totalContribution) * wallet.balance * positiveRating;

      // Update wallet
      transaction.update(walletRef, {
        balance: wallet.balance - payment,
        totalSpent: wallet.totalSpent + payment,
        lastUpdate: now,
      });

      // Log transaction
      const txRef = db.collection('fairEvalTransactions').doc();
      transaction.set(txRef, {
        transactionId: txRef.id,
        topParentId: parentId,
        userId: eval_.evaluatorId,
        type: 'payment',
        amount: payment,
        balanceBefore: wallet.balance,
        balanceAfter: wallet.balance - payment,
        answerStatementId,
        createdAt: now,
      });
    }

    // 4. Mark accepted
    transaction.update(answerRef, {
      'fairEvalMetrics.isAccepted': true,
      'fairEvalMetrics.acceptedAt': now,
      'fairEvalMetrics.acceptedBy': adminId,
    });

    return { success: true };
  });
});
```

### 4. Redux Slice Structure

```typescript
// src/redux/fairEval/fairEvalSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { FairEvalWallet, FairEvalAnswerMetrics, FairEvalTransaction } from '@freedi/shared-types';

interface FairEvalState {
  wallets: Record<string, FairEvalWallet>;  // walletId -> wallet
  metrics: Record<string, FairEvalAnswerMetrics>;  // answerId -> metrics
  transactions: FairEvalTransaction[];
  isLoading: boolean;
  error: string | null;
}

const initialState: FairEvalState = {
  wallets: {},
  metrics: {},
  transactions: [],
  isLoading: false,
  error: null,
};

const fairEvalSlice = createSlice({
  name: 'fairEval',
  initialState,
  reducers: {
    setWallet(state, action: PayloadAction<FairEvalWallet>) {
      state.wallets[action.payload.walletId] = action.payload;
    },
    setMetrics(state, action: PayloadAction<FairEvalAnswerMetrics>) {
      state.metrics[action.payload.answerStatementId] = action.payload;
    },
    setTransactions(state, action: PayloadAction<FairEvalTransaction[]>) {
      state.transactions = action.payload;
    },
    addTransaction(state, action: PayloadAction<FairEvalTransaction>) {
      state.transactions.unshift(action.payload);
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
  },
});

export const { setWallet, setMetrics, setTransactions, addTransaction, setLoading, setError } = fairEvalSlice.actions;
export default fairEvalSlice.reducer;
```

### 5. Answer Card Component Example

```tsx
// src/view/components/atomic/molecules/FairEvalAnswerCard/FairEvalAnswerCard.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { FairEvalAnswerMetrics } from '@freedi/shared-types';

interface FairEvalAnswerCardProps {
  title: string;
  description?: string;
  metrics: FairEvalAnswerMetrics;
  isAdmin?: boolean;
  onAccept?: () => void;
  onCompleteToGoal?: () => void;
}

type Status = 'reached' | 'progress' | 'none';

function getStatus(metrics: FairEvalAnswerMetrics): Status {
  if (metrics.distanceToGoal === 0) return 'reached';
  if (metrics.weightedSupporters > 0) return 'progress';
  return 'none';
}

export const FairEvalAnswerCard: React.FC<FairEvalAnswerCardProps> = ({
  title,
  description,
  metrics,
  isAdmin,
  onAccept,
  onCompleteToGoal,
}) => {
  const { t } = useTranslation();
  const status = getStatus(metrics);
  const progress = metrics.answerCost > 0
    ? Math.min(100, (metrics.totalContribution / metrics.answerCost) * 100)
    : 0;

  return (
    <div className={clsx('answer-card', `answer-card--${status}`)}>
      <div className="answer-card__header">
        <h3 className="answer-card__title">{title}</h3>
        <span className={clsx('status-indicator', `status-indicator--${status}`)} />
      </div>

      {description && <p className="answer-card__content">{description}</p>}

      <div className="answer-card__metrics">
        <div className="answer-card__metric">
          <span className="answer-card__metric-label">{t('cost')}</span>
          <span className="answer-card__metric-value">{metrics.answerCost} {t('minutes')}</span>
        </div>
        <div className="answer-card__metric">
          <span className="answer-card__metric-label">{t('weightedSupporters')}</span>
          <span className="answer-card__metric-value">{metrics.weightedSupporters.toFixed(1)}</span>
        </div>
        <div className="answer-card__metric">
          <span className="answer-card__metric-label">{t('totalContribution')}</span>
          <span className="answer-card__metric-value">{metrics.totalContribution.toFixed(1)}</span>
        </div>
        <div className="answer-card__metric">
          <span className="answer-card__metric-label">{t('distanceToGoal')}</span>
          <span className="answer-card__metric-value">
            {metrics.distanceToGoal === 0 ? t('goalReached') : metrics.distanceToGoal.toFixed(1)}
          </span>
        </div>
      </div>

      <div className="answer-card__progress">
        <div className="answer-card__progress-bar">
          <div className="answer-card__progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="answer-card__progress-label">
          <span>{metrics.totalContribution.toFixed(0)}</span>
          <span>{metrics.answerCost}</span>
        </div>
      </div>

      {isAdmin && (
        <div className="answer-card__footer">
          {status === 'reached' && !metrics.isAccepted && (
            <button className="btn btn--primary" onClick={onAccept}>
              {t('acceptAnswer')}
            </button>
          )}
          {status === 'progress' && (
            <button className="btn btn--secondary" onClick={onCompleteToGoal}>
              {t('completeToGoal')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
```

---

## Firestore Security Rules

```javascript
// firestore.rules (add to existing)

match /fairEvalWallets/{walletId} {
  function isOwner() {
    return request.auth != null && resource.data.userId == request.auth.uid;
  }

  allow read: if request.auth != null && isOwner();
  allow write: if false; // Only Cloud Functions
}

match /fairEvalTransactions/{transactionId} {
  function isOwner() {
    return request.auth != null && resource.data.userId == request.auth.uid;
  }

  allow read: if request.auth != null && isOwner();
  allow write: if false; // Only Cloud Functions
}
```

---

## Firestore Indexes

```json
// firestore.indexes.json (add)
{
  "indexes": [
    {
      "collectionGroup": "fairEvalWallets",
      "fields": [
        { "fieldPath": "topParentId", "order": "ASCENDING" },
        { "fieldPath": "userId", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "fairEvalTransactions",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "topParentId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```
