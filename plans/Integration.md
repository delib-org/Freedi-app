# Integrate Similar Suggestions Feature

## Overview
Allow admins to integrate similar suggestions into a single unified suggestion, combining their evaluations.

## User Flow
1. Admin clicks "Integrate" menu option on a **SuggestionCard** (in SolutionMenu)
2. AI finds suggestions similar to the selected one
3. Modal shows the original suggestion + similar suggestions found
4. Admin selects which similar suggestions to merge with the original
5. AI generates a merged suggestion (weighted by support/evaluations)
6. Admin reviews/edits the proposed suggestion
7. On confirm: create new suggestion, migrate evaluations, hide originals

---

## Implementation Plan

### Phase 1: Backend (Firebase Functions)

#### 1.1 Create Integration AI Service
**File:** `functions/src/services/integration-ai-service.ts`

```typescript
// Functions to implement:
- findSimilarToStatement(targetStatement: Statement, allStatements: Statement[]): Statement[]
- generateIntegratedSuggestion(statements: StatementWithEvaluation[], questionContext: string): { title: string; description: string }
```

Uses Google Gemini to:
- Find statements semantically similar to the selected one
- Generate merged suggestion weighted by `numberOfEvaluators` and `consensus`

#### 1.2 Create Integration HTTP Functions
**File:** `functions/src/fn_integrateSimilarStatements.ts`

Two endpoints:

**`findSimilarForIntegration`** (HTTP callable)
- Input: `{ statementId: string }` (the statement admin clicked "Integrate" on)
- Returns: original statement + array of similar suggestions with evaluation data

**`executeIntegration`** (HTTP callable)
- Input: `{ parentStatementId, selectedStatementIds[], integratedTitle, integratedDescription }`
- Operations:
  1. Create new statement with `StatementType.option`
  2. Call `migrateEvaluationsToNewStatement()`
  3. Mark source statements with `hide: true`
  4. Return new statement ID

#### 1.3 Add Evaluation Migration Function
**File:** `functions/src/fn_evaluation.ts` (add function)

```typescript
async function migrateEvaluationsToNewStatement(
  sourceStatementIds: string[],
  targetStatementId: string,
  parentId: string
): Promise<{ migratedCount: number; evaluation: StatementEvaluation }>
```

Logic:
1. Fetch all evaluations from source statements
2. For users who evaluated multiple sources: use their **highest absolute value** (preserving sign)
3. Create new evaluations pointing to target statement
4. Use `recalculateOptionsEvaluations` pattern from `functions/src/migrations/recalculateEvaluations.ts`

#### 1.4 Export Functions
**File:** `functions/src/index.ts` (modify)
- Export `findSimilarForIntegration` and `executeIntegration`

---

### Phase 2: Frontend Types & Controller

#### 2.1 Create Types
**File:** `src/types/integration.ts`

```typescript
export interface SimilarGroup {
  groupId: string;
  statements: StatementWithEvaluation[];
  totalEvaluators: number;
  suggestedTitle?: string;
  suggestedDescription?: string;
}

export interface StatementWithEvaluation {
  statementId: string;
  statement: string;
  description?: string;
  numberOfEvaluators: number;
  consensus: number;
}

export interface ExecuteIntegrationParams {
  parentStatementId: string;
  selectedStatementIds: string[];
  integratedTitle: string;
  integratedDescription: string;
}

export interface IntegrationResult {
  success: boolean;
  newStatementId?: string;
  migratedEvaluationsCount?: number;
}
```

#### 2.2 Create Controller
**File:** `src/controllers/db/integration/integrationController.ts`

```typescript
export async function findSimilarForIntegration(parentStatementId: string): Promise<SimilarGroup[]>
export async function executeIntegration(params: ExecuteIntegrationParams): Promise<IntegrationResult>
```

Use `httpsCallable` pattern from existing controllers.

---

### Phase 3: Frontend UI Components

#### 3.1 Create Integration Modal Container
**File:** `src/view/components/integrateSuggestions/IntegrateSuggestionsModal.tsx`

Props:
```typescript
interface IntegrateSuggestionsModalProps {
  sourceStatementId: string;      // The statement admin clicked "Integrate" on
  parentStatementId: string;      // Parent question ID
  onClose: () => void;
  onSuccess: (newStatementId: string) => void;
}
```

Multi-step modal:
- **Step 1:** Loading state while finding similar suggestions
- **Step 2:** Selection - show source statement + similar suggestions with checkboxes
- **Step 3:** Preview/Edit - editable title/description before confirm

Use existing `Modal` from `src/view/components/modal/Modal.tsx`

#### 3.2 Create Selection Component
**File:** `src/view/components/integrateSuggestions/SimilarGroupSelector.tsx`

Displays:
- **Source statement** (the one admin clicked) - pre-selected, cannot deselect
- **Similar suggestions found** - each with checkbox
- Shows evaluator count per statement
- Total evaluators across selected statements

#### 3.3 Create Preview/Edit Component
**File:** `src/view/components/integrateSuggestions/IntegrationPreview.tsx`

Displays:
- Read-only list of selected statements being merged
- Editable title input
- Editable description textarea
- Summary: "Integrating X suggestions with Y evaluators"
- Warning: "Original suggestions will be hidden"
- Buttons: Back, Cancel, Confirm

#### 3.4 Create Styles
**File:** `src/view/components/integrateSuggestions/IntegrateSuggestions.module.scss`

Use BEM naming and design tokens from `docs/design-guide.md`

---

### Phase 4: Add Menu Option to SolutionMenu

**File:** `src/view/pages/statement/components/evaluations/components/solutionMenu/SolutionMenu.tsx`

Add new menu option for admins (after "Hide" option, around line 133):

```tsx
// Add import
import IntegrateIcon from '@/assets/icons/integrateIcon.svg?react'; // or use existing merge/combine icon

// Add props
interface Props {
  // ... existing props
  onIntegrate?: () => void;  // callback to open integration modal
}

// Add menu option (admin only)
{isAdmin && (
  <MenuOption
    label={t('Integrate Similar')}
    icon={<IntegrateIcon />}
    onOptionClick={() => {
      onIntegrate?.();
      setIsCardMenuOpen(false);
    }}
  />
)}
```

**File:** `src/view/pages/statement/components/evaluations/components/suggestionCards/suggestionCard/SuggestionCard.tsx`

Add state and modal:

```tsx
const [showIntegrationModal, setShowIntegrationModal] = useState(false);

// Pass callback to SolutionMenu
<SolutionMenu
  // ... existing props
  onIntegrate={() => setShowIntegrationModal(true)}
/>

// Render modal when open
{showIntegrationModal && (
  <IntegrateSuggestionsModal
    sourceStatementId={statement.statementId}
    parentStatementId={parentStatement?.statementId}
    onClose={() => setShowIntegrationModal(false)}
    onSuccess={() => {
      // Show success toast
      setShowIntegrationModal(false);
    }}
  />
)}
```

---

### Phase 5: Translations

**Package:** `packages/shared-i18n/src/languages/`

Add to en.json, he.json, ar.json, and other language files:

```json
{
  "Suggestion Management": "Suggestion Management",
  "Integrate Similar Suggestions": "Integrate Similar Suggestions",
  "Combine similar suggestions into a single unified suggestion": "Combine similar suggestions into a single unified suggestion",
  "Finding similar suggestions...": "Finding similar suggestions...",
  "Select suggestions to integrate": "Select suggestions to integrate",
  "No similar suggestions found": "No similar suggestions found",
  "evaluators": "evaluators",
  "Preview Integration": "Preview Integration",
  "Integrated Suggestion Title": "Integrated Suggestion Title",
  "Integrated Suggestion Description": "Integrated Suggestion Description",
  "Integrating X suggestions with Y total evaluators": "Integrating {count} suggestions with {evaluators} total evaluators",
  "Original suggestions will be hidden": "Original suggestions will be hidden",
  "Confirm Integration": "Confirm Integration",
  "Integration successful": "Integration successful"
}
```

---

## Files Summary

### Files to Create
| File | Purpose |
|------|---------|
| `functions/src/services/integration-ai-service.ts` | AI logic for grouping & generating |
| `functions/src/fn_integrateSimilarStatements.ts` | HTTP endpoints |
| `src/types/integration.ts` | TypeScript types |
| `src/controllers/db/integration/integrationController.ts` | API calls |
| `src/view/components/integrateSuggestions/IntegrateSuggestionsModal.tsx` | Main modal |
| `src/view/components/integrateSuggestions/SimilarGroupSelector.tsx` | Selection UI |
| `src/view/components/integrateSuggestions/IntegrationPreview.tsx` | Preview/Edit UI |
| `src/view/components/integrateSuggestions/IntegrateSuggestions.module.scss` | Styles |

### Files to Modify
| File | Changes |
|------|---------|
| `functions/src/fn_evaluation.ts` | Add `migrateEvaluationsToNewStatement()` |
| `functions/src/index.ts` | Export new functions |
| `src/view/pages/statement/components/evaluations/components/solutionMenu/SolutionMenu.tsx` | Add "Integrate Similar" menu option |
| `src/view/pages/statement/components/evaluations/components/suggestionCards/suggestionCard/SuggestionCard.tsx` | Add modal state and render |
| `packages/shared-i18n/src/languages/*.json` | Add translations |

---

## Implementation Order

1. **Backend first** - Create functions, test with manual API calls
2. **Types & Controller** - Enable frontend to call backend
3. **UI Components** - Build modal flow
4. **Integration** - Add menu option to SolutionMenu & modal to SuggestionCard
5. **Translations** - Add all language strings
6. **Testing** - Full flow, edge cases, evaluation verification

---

## Edge Cases to Handle

- **User evaluated multiple source statements**: Use highest absolute value
- **No similar suggestions found**: Show message, close modal
- **AI service failure**: Show error with retry option
- **Empty selection**: Disable confirm button
- **Single statement selected**: Allow (just creates copy and hides original)
- **Concurrent modifications**: Use Firestore transactions
