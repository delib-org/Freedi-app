# Sign App Demographics Feature - Implementation Plan

## Overview
Add demographic survey functionality to the Sign app, allowing admins to either inherit demographics from the main app or create custom surveys. Users must complete mandatory surveys before interacting with documents.

## User Requirements (Confirmed)
- **Inheritance**: Merge both group-level AND statement-level questions from main app
- **Blocked actions**: ALL interactions blocked (view-only) until survey complete
- **Storage**: Same `userDemographicQuestions` collection with `scope='sign'`
- **Admin control**: Full control to create/edit custom questions in Sign

---

## Phase 1: Types & Data Layer

### 1.1 Extend DocumentSettings
**File**: `apps/sign/src/types/index.ts`

Add to `DocumentSettings` interface:
```typescript
export type DemographicMode = 'disabled' | 'inherit' | 'custom';

export interface DocumentSettings {
  // ... existing fields ...
  demographicMode: DemographicMode;
  demographicRequired: boolean;
}
```

Update `DEFAULT_DOCUMENT_SETTINGS` with:
```typescript
demographicMode: 'disabled',
demographicRequired: false,
```

### 1.2 Create Demographics Types
**New File**: `apps/sign/src/types/demographics.ts`

```typescript
import { UserDemographicQuestion, DemographicOption, UserDemographicQuestionType } from 'delib-npm';

export type { UserDemographicQuestion, DemographicOption, UserDemographicQuestionType };
export type DemographicMode = 'disabled' | 'inherit' | 'custom';

export interface SurveyCompletionStatus {
  isComplete: boolean;
  totalQuestions: number;
  answeredQuestions: number;
  isRequired: boolean;
  missingQuestionIds: string[];
}

export interface DemographicAnswer {
  userQuestionId: string;
  answer?: string;
  answerOptions?: string[];
}
```

### 1.3 Create Firebase Queries
**New File**: `apps/sign/src/lib/firebase/demographicQueries.ts`

Functions needed:
- `getDemographicQuestions(docId, mode, topParentId)` - Get merged questions
- `getUserDemographicAnswers(docId, userId, topParentId)` - Get user's answers
- `checkSurveyCompletion(docId, userId, mode, topParentId)` - Check completion status
- `saveDemographicQuestion(docId, question)` - Admin: save question (scope='sign')
- `deleteDemographicQuestion(questionId)` - Admin: delete question
- `saveUserDemographicAnswers(docId, userId, answers)` - Save user answers

---

## Phase 2: API Routes

### 2.1 Update Settings API
**File**: `apps/sign/app/api/admin/settings/[docId]/route.ts`

Add `demographicMode` and `demographicRequired` fields to GET/PUT handlers.

### 2.2 Demographics Questions API
**New File**: `apps/sign/app/api/demographics/questions/[docId]/route.ts`

- **GET**: Return questions based on mode (inherit: merge group+statement, custom: sign-specific)
- **POST**: Create new sign-specific question (admin only)

### 2.3 Delete Question API
**New File**: `apps/sign/app/api/demographics/questions/[docId]/[questionId]/route.ts`

- **DELETE**: Remove sign-specific question (admin only)

### 2.4 Demographics Answers API
**New File**: `apps/sign/app/api/demographics/answers/[docId]/route.ts`

- **GET**: Return user's answers for document
- **POST**: Save user's survey answers

### 2.5 Survey Status API
**New File**: `apps/sign/app/api/demographics/status/[docId]/route.ts`

- **GET**: Return completion status (isComplete, counts, missing question IDs)

---

## Phase 3: State Management

### 3.1 Create Demographics Store
**New File**: `apps/sign/src/store/demographicStore.ts`

Zustand store with:
- `status`: DemographicStatus (mode, isRequired, isComplete, etc.)
- `questions`: Array of questions
- `currentAnswers`: Form state for answers
- `submittedAnswers`: Saved answers from DB
- `isSurveyModalOpen`: Modal visibility
- Actions: `setStatus`, `setQuestions`, `setAnswer`, `openSurveyModal`, `closeSurveyModal`
- Selector: `selectIsInteractionBlocked`

### 3.2 Update UI Store
**File**: `apps/sign/src/store/uiStore.ts`

Add `'demographics'` to `ModalType`:
```typescript
export type ModalType = 'comments' | 'signature' | 'settings' | 'login' | 'demographics' | null;
```

---

## Phase 4: Admin UI Components

### 4.1 Demographics Settings Section
**New File**: `apps/sign/src/components/admin/demographics/DemographicSettings.tsx`

Features:
- Mode selector (disabled/inherit/custom) - segmented control or radio
- Mandatory toggle
- Link to question editor (when custom mode)

### 4.2 Question Editor (Custom Mode)
**New File**: `apps/sign/src/components/admin/demographics/QuestionEditor.tsx`

Features:
- Question text input
- Question type dropdown (text, textarea, radio, checkbox)
- Options editor for radio/checkbox (with color picker)
- Save/Cancel buttons

### 4.3 Question List
**New File**: `apps/sign/src/components/admin/demographics/QuestionList.tsx`

Features:
- Display existing questions
- Edit/Delete buttons per question
- Reorder capability (drag or arrows)

### 4.4 Integrate into Admin Settings Page
**File**: `apps/sign/app/doc/[statementId]/admin/settings/page.tsx`

Add DemographicSettings component section.

---

## Phase 5: User Survey Modal

### 5.1 Survey Modal Component
**New File**: `apps/sign/src/components/demographics/DemographicSurveyModal.tsx`

Features:
- Full-screen modal (cannot close if mandatory)
- Progress bar (X of Y completed)
- Questions grouped by source (inherited vs custom)
- Form validation (all required fields)
- Submit button (disabled until complete)

### 5.2 Question Input Component
**New File**: `apps/sign/src/components/demographics/DemographicQuestionInput.tsx`

Renders appropriate input based on question type:
- Text: `<input type="text">`
- Textarea: `<textarea>`
- Radio: Radio button group with colors
- Checkbox: Checkbox group with multi-select

### 5.3 Progress Bar Component
**New File**: `apps/sign/src/components/demographics/SurveyProgressBar.tsx`

Visual progress indicator showing completion percentage.

---

## Phase 6: Interaction Blocking

### 6.1 Update DocumentClient
**File**: `apps/sign/src/components/document/DocumentClient.tsx`

Add:
1. Fetch demographic status on mount
2. Render `DemographicSurveyModal` when incomplete
3. Pass `isInteractionBlocked` to child components

### 6.2 Update InteractionBar
**File**: `apps/sign/src/components/paragraph/InteractionBar.tsx`

- Check `isInteractionBlocked` prop
- Disable all buttons when blocked
- Show tooltip: "Complete survey to interact"

### 6.3 Update SignButton
**File**: `apps/sign/src/components/document/SignButton.tsx`

- Disable when survey incomplete
- Show message explaining why

### 6.4 Blocked State Banner
**New File**: `apps/sign/src/components/demographics/SurveyRequiredBanner.tsx`

Persistent banner at top of document:
- "Please complete the survey to interact with this document"
- Button to open survey modal

---

## Phase 7: Document Page Integration

### 7.1 Update Document Page
**File**: `apps/sign/app/doc/[statementId]/page.tsx`

Add server-side logic to:
1. Fetch document settings (including demographic settings)
2. Check if demographics enabled
3. Pass settings to DocumentView

### 7.2 Initialize Demographics State
In `DocumentClient.tsx`:
1. Call `/api/demographics/status/[docId]` on mount
2. Initialize store with status
3. If mandatory + incomplete: auto-open survey modal

---

## SCSS Files Needed

All following SCSS module pattern (`*.module.scss`):
- `apps/sign/src/components/admin/demographics/DemographicSettings.module.scss`
- `apps/sign/src/components/admin/demographics/QuestionEditor.module.scss`
- `apps/sign/src/components/admin/demographics/QuestionList.module.scss`
- `apps/sign/src/components/demographics/DemographicSurveyModal.module.scss`
- `apps/sign/src/components/demographics/DemographicQuestionInput.module.scss`
- `apps/sign/src/components/demographics/SurveyProgressBar.module.scss`
- `apps/sign/src/components/demographics/SurveyRequiredBanner.module.scss`

---

## Translations

Add to `@freedi/shared-i18n` (all available languages):
- "Demographics Survey"
- "Disabled" / "Use Main App Demographics" / "Custom Demographics"
- "Require survey completion"
- "Complete Your Profile"
- "Please complete this survey to access the document"
- "X of Y completed"
- "Submit Survey"
- "Complete survey to interact"
- Question type labels (Text Input, Text Area, Single Choice, Multiple Choice)
- "Add Question" / "Delete Question" / "Add Option"

---

## Critical Files Summary

### Files to Modify
| File | Changes |
|------|---------|
| `apps/sign/src/types/index.ts` | Add demographic fields to DocumentSettings |
| `apps/sign/app/api/admin/settings/[docId]/route.ts` | Handle demographic settings |
| `apps/sign/src/store/uiStore.ts` | Add 'demographics' modal type |
| `apps/sign/src/components/document/DocumentClient.tsx` | Add survey modal + blocking logic |
| `apps/sign/src/components/paragraph/InteractionBar.tsx` | Check blocked state |
| `apps/sign/src/components/document/SignButton.tsx` | Check blocked state |
| `apps/sign/app/doc/[statementId]/admin/settings/page.tsx` | Add demographics section |
| `apps/sign/app/doc/[statementId]/page.tsx` | Pass demographic settings |

### New Files to Create
| File | Purpose |
|------|---------|
| `apps/sign/src/types/demographics.ts` | Demographics type definitions |
| `apps/sign/src/lib/firebase/demographicQueries.ts` | Firebase query functions |
| `apps/sign/src/store/demographicStore.ts` | Zustand demographics store |
| `apps/sign/app/api/demographics/questions/[docId]/route.ts` | Questions CRUD API |
| `apps/sign/app/api/demographics/questions/[docId]/[questionId]/route.ts` | Delete question API |
| `apps/sign/app/api/demographics/answers/[docId]/route.ts` | Answers API |
| `apps/sign/app/api/demographics/status/[docId]/route.ts` | Status API |
| `apps/sign/src/components/admin/demographics/DemographicSettings.tsx` | Admin settings UI |
| `apps/sign/src/components/admin/demographics/QuestionEditor.tsx` | Question creation form |
| `apps/sign/src/components/admin/demographics/QuestionList.tsx` | Question list display |
| `apps/sign/src/components/demographics/DemographicSurveyModal.tsx` | User survey modal |
| `apps/sign/src/components/demographics/DemographicQuestionInput.tsx` | Question input renderer |
| `apps/sign/src/components/demographics/SurveyProgressBar.tsx` | Progress indicator |
| `apps/sign/src/components/demographics/SurveyRequiredBanner.tsx` | Blocked state banner |

---

## Implementation Order

1. **Types & Data Layer** (Phase 1) - Foundation
2. **API Routes** (Phase 2) - Backend ready
3. **State Management** (Phase 3) - Frontend state ready
4. **Admin UI** (Phase 4) - Admins can configure
5. **User Survey Modal** (Phase 5) - Users can respond
6. **Interaction Blocking** (Phase 6) - Enforcement
7. **Document Integration** (Phase 7) - Wire it all together

---

## Notes

- Sign-specific questions use `scope='sign'` in `userDemographicQuestions` collection
- User answers stored in `usersData` collection with key `{userQuestionId}--{userId}`
- When `mode='inherit'`: Query questions where `topParentId` matches AND scope is `'group'` OR `'statement'`
- When `mode='custom'`: Query questions where `statementId` matches AND scope is `'sign'`
