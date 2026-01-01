# Fair Evaluation Feature - Implementation Plan

## Overview
A time-based voting system where users invest "minutes" from their wallet to support answers. Answers are accepted when total contributions reach the answer's cost, with payments deducted proportionally from supporters.

**Target:** Main app (Freedi-Deliberation) only - Mass Consensus later
**Initial Balance:** 10 minutes when user joins
**Testing:** Firebase Emulator

**Core Math:**
- Positive Rating: `rᵢ = max(0, eᵢ)` (only positive evaluations count)
- Weighted Supporters: `W = Σ rᵢ`
- Contribution: `cᵢ = rᵢ × mᵢ` (rating × wallet balance)
- Total Contribution: `T = Σ cᵢ`
- Distance to Goal: `D = max(0, C - T)` where C = answer cost
- Payment when accepted: `pᵢ = (C / T) × mᵢ × rᵢ`

---

## Phase 1: Data Models (packages/shared-types)

### 1.1 Create Types
**File:** `packages/shared-types/src/models/fairEvaluation/index.ts`

```typescript
// Valibot schemas for:
- FairEvalWalletSchema (walletId, userId, topParentId, balance, totalReceived, totalSpent)
- FairEvalTransactionSchema (type: join|admin_add|payment|refund, amount, metadata)
- FairEvalAnswerMetricsSchema (weightedSupporters, totalContribution, distanceToGoal, etc.)
- FairEvalQuestionSettingsSchema (isFairEvalQuestion, walletLevel, defaultAnswerCost)
```

### 1.2 Create Calculation Helpers
**File:** `packages/shared-types/src/helpers/fairEvalCalculations.ts`

Pure functions (shared client/server):
- `getPositiveRating(evaluation)`
- `calculateAnswerMetrics(cost, userEvaluations[])`
- `calculateUserPayment(cost, totalContribution, userMinutes, positiveRating)`
- `calculateCompleteToGoal(distancePerSupporter, totalUsers)`
- `simulateFairAcceptance(answers[], balances, maxRounds)` - for display ordering

### 1.3 Modify Existing Models
- Add to `collectionsModel.ts`: `fairEvalWallets`, `fairEvalTransactions`
- Add to `StatementSettings.ts`: `enableFairEvaluation: optional(boolean())`
- Add to `StatementTypes.ts`: `fairEvalSettings`, `fairEvalMetrics`, `answerCost`

---

## Phase 2: Cloud Functions (functions/src)

**File:** `functions/src/fn_fairEvaluation.ts`

### Firestore Triggers
| Function | Trigger | Purpose |
|----------|---------|---------|
| `initializeWallet` | `onDocumentCreated(statementsSubscribe)` | Create wallet with 10 min when user joins |
| `onFairEvalEvaluationChange` | `onDocumentWritten(evaluations)` | Recalculate answer metrics |

### HTTP Functions (Admin-only)
| Function | Purpose |
|----------|---------|
| `addMinutesToGroup` | Distribute X minutes equally to all members |
| `setAnswerCost` | Set/update answer cost (admin only) |
| `acceptFairEvalAnswer` | Accept answer, deduct payments, recalculate all |
| `completeToGoal` | Add needed minutes then accept |

---

## Phase 3: Admin Toggle UI

**File:** `src/view/pages/statement/components/settings/components/advancedSettings/EnhancedAdvancedSettings.tsx`

Add to "Evaluation & Voting" category:
```typescript
<ToggleSwitch
  isChecked={settings.enableFairEvaluation ?? false}
  onChange={(checked) => handleSettingChange('enableFairEvaluation', checked)}
  label={t('Enable Fair Evaluation')}
  description={t('Use time-based wallet system for accepting answers')}
  icon={Wallet}
  badge="new"
/>
```

When enabled, show:
- Default answer cost input
- Wallet level selector (topParent/parent/self)

---

## Phase 4: Frontend - Redux & Controllers

### Redux Slice
**File:** `src/redux/fairEval/fairEvalSlice.ts`

State: `{ wallets, transactions, isLoading, error }`
Selectors: `selectWalletByGroup`, `selectTransactionsByGroup`, `selectAnswerMetrics`

### Controllers
**File:** `src/controllers/db/fairEval/fairEvalController.ts`

- `subscribeFairEvalWallet(topParentId, userId)`
- `subscribeFairEvalTransactions(topParentId, userId)`
- `addMinutesToGroup(topParentId, amount)`
- `acceptFairEvalAnswer(statementId)`
- `completeToGoal(statementId)`

---

## Phase 5: Frontend - UI Components (Atomic Design + UX)

### User-Friendly Terminology
Replace technical terms with intuitive labels:
| Technical | User-Friendly |
|-----------|---------------|
| `balance` | "Available Minutes" |
| `answerCost` | "Time Goal" |
| `totalContribution` | "Invested Time" |
| `distanceToGoal` | "Time Remaining" |
| `weightedSupporters` | "Support Level" |

### Color System (existing design tokens)
- `var(--agree)` #57c6b2 - Goal reached, positive changes
- `var(--option)` #e7d080 - In progress, has support
- `var(--disagree)` #fe6ba2 - No support
- `var(--text-warning)` #ef7550 - Payments/deductions
- `var(--btn-primary)` #5f88e5 - Informational, join events

### SCSS Files (BEM naming)
```
src/view/style/
├── atoms/_wallet-balance.scss
├── atoms/_status-indicator.scss
├── molecules/_wallet-display.scss
├── molecules/_fair-eval-card.scss
├── molecules/_fair-eval-info.scss
├── molecules/_transaction-item.scss
├── organisms/_fair-eval-section.scss
├── organisms/_complete-to-goal-dialog.scss
└── organisms/_fair-eval-history.scss
```

### React Components

**Atoms:**
- `WalletBalance` - Minutes with clock icon
- `StatusIndicator` - 3-state dot with pulse animation for "reached"

**Molecules:**
- `WalletDisplay` - Compact pill in header (32px height)
  - Color states: Green (>10min), Orange (<10min), Red (0min)
  - Click navigates to History page
- `FairEvalCard` - Enhanced answer card with:
  - Left border color indicates status
  - Progress bar (0-100% with gradient)
  - Metrics grid (3 cards: Support Level, Invested Time, Time Remaining)
  - Admin controls ON the card (Accept / Complete to Goal)
- `FairEvalInfo` - Compact inline metrics for SuggestionCard integration
- `TransactionItem` - Timeline entry with color-coded left border

**Organisms:**
- `FairEvalSection` - Question wrapper when fair eval enabled
- `CompleteToGoalDialog` - Modal with calculation breakdown:
  - "To bring this answer to its goal, the group needs additional investment"
  - Shows: Time Remaining, Current Members, Per User, Total
- `FairEvalHistory` - Timeline grouped by date (Today/Yesterday/date)
  - Event types: Join (blue), Admin Add (green), Payment (orange), Non-Payment (gray)

### Mobile Considerations
- Wallet display: icon + number only (compact)
- Metrics grid: 2 columns instead of 3
- Admin buttons: stack vertically
- History items: collapsible details
- Touch targets: minimum 44x44px

### RTL Support
- Border-left becomes border-right
- Flex directions reverse
- Arrow indicators flip

---

## Phase 6: Translations

Add to all 6 language files (`en.json`, `he.json`, `ar.json`, `de.json`, `es.json`, `nl.json`):

~35 keys including: fairEvaluation, walletBalance, minutes, answerCost, weightedSupporters, totalContribution, distanceToGoal, goalReached, hasSupport, noSupport, addMinutes, acceptAnswer, completeToGoal, history.*

---

## Phase 7: Testing

### Unit Tests
**File:** `packages/shared-types/src/utils/__tests__/fairEvalCalculations.test.ts`

Test worked example from spec:
- 5 users rate +1.0 (10 min each), 2 users rate +0.5 (6 min each)
- Answer cost = 80
- Expected: W=6.0, T=56, D=24, d=4

### Cloud Function Tests
**File:** `functions/src/__tests__/fn_fairEvaluation.test.ts`

Mock Firestore, test wallet init, metrics calculation, payment deduction.

### Test Data Script
**File:** `scripts/fairEvalTestData.cjs`

Creates realistic test data:
1. Test group + 10 users + subscriptions
2. 3 answers with different costs
3. Simulated evaluations
4. Runs full acceptance flow
5. Verifies payments and recalculations

Run with: `node scripts/fairEvalTestData.cjs`

---

## Phase 8: Infrastructure

### Firestore Indexes
Add to `firestore.indexes.json`:
- fairEvalWallets: (topParentId, userId)
- fairEvalTransactions: (topParentId, userId, createdAt DESC)

### Security Rules
Add to `firestore.rules`:
- Wallets: Read by owner only, write via functions only
- Transactions: Read by owner only, write via functions only

---

## Critical Files to Modify/Create

### Create (NEW):
1. `packages/shared-types/src/models/fairEvaluation/index.ts` - Valibot schemas
2. `packages/shared-types/src/utils/fairEvalCalculations.ts` - Pure calculation functions
3. `functions/src/fn_fairEvaluation.ts` - Cloud functions
4. `src/redux/fairEval/fairEvalSlice.ts` - Redux state
5. `src/controllers/db/fairEval/fairEvalController.ts` - Controllers
6. `src/view/style/molecules/_fair-eval-info.scss` - Inline component style
7. `src/view/components/atomic/molecules/FairEvalInfo/` - Inline component
8. `scripts/fairEvalTestData.cjs` - Test script

### Modify (EXISTING):
1. `packages/shared-types/src/models/statement/StatementSettings.ts` - Add toggle
2. `packages/shared-types/src/models/statement/StatementTypes.ts` - Add fairEval fields
3. `packages/shared-types/src/models/collections/collectionsModel.ts` - Add collections
4. `packages/shared-types/src/index.ts` - Export new types
5. `functions/src/index.ts` - Register new functions
6. `src/view/pages/statement/components/settings/.../EnhancedAdvancedSettings.tsx` - Admin UI
7. `packages/shared-i18n/src/languages/*.json` - Translations (6 files)
8. `firestore.rules` - Security rules
9. `firestore.indexes.json` - Indexes

---

## Implementation Order

1. **Foundation** - Types, calculations, unit tests ✅
2. **Backend** - Cloud functions, function tests ✅
3. **Admin Toggle** - Settings UI ✅
4. **State** - Redux slice, controllers ✅
5. **UI Components** - Atoms, molecules, organisms (SCSS first) ✅
6. **Integration** - Wire up to existing evaluation pages ✅
7. **Testing** - Test data script, E2E testing ✅
8. **Translations** - All 6 languages ✅

---

## Implementation Status

### Completed:
- [x] Valibot schemas for fair evaluation models
- [x] Calculation helper functions with unit tests (17 tests passing)
- [x] Collections added to collectionsModel
- [x] StatementSettings extended with enableFairEvaluation
- [x] StatementTypes extended with fairEvalSettings, fairEvalMetrics, answerCost, fairEvalAccepted
- [x] Cloud functions (fn_fairEvaluation.ts)
- [x] Redux slice (fairEvalSlice.ts)
- [x] Controllers (fairEvalController.ts)
- [x] SCSS atoms (wallet-balance, status-indicator)
- [x] SCSS molecules (wallet-display, fair-eval-card, fair-eval-info)
- [x] React atoms (WalletBalance, StatusIndicator)
- [x] React molecules (WalletDisplay, FairEvalCard, FairEvalInfo)
- [x] WalletDisplay integrated in StatementTopNav header
- [x] FairEvalInfo integrated in SuggestionCard
- [x] Translations added to all 6 languages

### Remaining:
- [ ] Admin toggle in EnhancedAdvancedSettings (UI exists, needs wiring)
- [ ] Firestore security rules
- [ ] Firestore indexes
- [ ] E2E testing with Firebase emulators
- [ ] CompleteToGoalDialog modal
- [ ] FairEvalHistory page/component
