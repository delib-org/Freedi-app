# Migrate All Apps from Description to Paragraphs

> **Status**: Planning
> **Scope**: Main App, Sign App, Mass Consensus App, Cloud Functions, shared-types

---

## Summary

Replace the `description` field with a `paragraphs[]` array across all apps. The first paragraph becomes the title (`statement` field), all subsequent paragraphs are stored in the `paragraphs[]` array.

### Key Decisions
| Decision | Choice |
|----------|--------|
| Description field | Remove completely |
| MC app editor | Rich text (h1-h6, lists) |
| Type location | Add to shared-types (delib-npm) |
| Title format | Always plain text |
| Editor UX | Single editor, auto-extract first line as title |

---

## Data Model

### Before
```typescript
Statement {
  statement: string;      // title
  description?: string;   // plain text content
}
```

### After
```typescript
Statement {
  statement: string;      // title (auto-extracted from first paragraph)
  paragraphs: Paragraph[]; // all content after title
}

Paragraph {
  paragraphId: string;
  type: ParagraphType;    // h1-h6, paragraph, li, table
  content: string;
  order: number;
  listType?: 'ul' | 'ol';
}
```

### Editor Flow
```
User types in single editor:
┌─────────────────────────────────┐
│ My Document Title               │ ← First line → statement field
│                                 │
│ This is the first paragraph...  │ ← paragraphs[0]
│                                 │
│ ## Section Heading              │ ← paragraphs[1] (type: h2)
│                                 │
│ More content here...            │ ← paragraphs[2]
└─────────────────────────────────┘
```

---

## Phase 1: Add Paragraph Types to shared-types

### 1.1 Create Paragraph Model
**File**: `packages/shared-types/src/models/paragraph/paragraphModel.ts`

```typescript
import { object, string, number, optional, enum_, array, InferOutput } from 'valibot';

export enum ParagraphType {
  h1 = 'h1',
  h2 = 'h2',
  h3 = 'h3',
  h4 = 'h4',
  h5 = 'h5',
  h6 = 'h6',
  paragraph = 'paragraph',
  li = 'li',
  table = 'table',
}

export const ParagraphSchema = object({
  paragraphId: string(),
  type: enum_(ParagraphType),
  content: string(),
  order: number(),
  listType: optional(enum_(['ul', 'ol'] as const)),
});

export type Paragraph = InferOutput<typeof ParagraphSchema>;
```

### 1.2 Update Statement Schema
**File**: `packages/shared-types/src/models/statement/StatementTypes.ts`

- Add: `paragraphs: optional(array(ParagraphSchema))`
- Remove: `description: optional(string())`

### 1.3 Export Types
**File**: `packages/shared-types/src/index.ts`

Export: `Paragraph`, `ParagraphType`, `ParagraphSchema`

### 1.4 Publish Package
- Run `npm run build` in shared-types
- Publish new version

---

## Phase 2: Update Main App

### 2.1 Remove Local Paragraph Types
**Delete**: `src/types/paragraph.ts`

**Update imports in**:
- `src/utils/paragraphUtils.ts`
- `src/view/components/richTextEditor/*.tsx`
- `src/view/components/text/Text.tsx`
- `src/view/components/edit/*.tsx`

### 2.2 Update Paragraph Utilities
**File**: `src/utils/paragraphUtils.ts`

Add function to extract title and paragraphs:
```typescript
export function extractTitleAndParagraphs(allParagraphs: Paragraph[]): {
  title: string;
  paragraphs: Paragraph[];
} {
  if (!allParagraphs.length) return { title: '', paragraphs: [] };

  const sorted = sortParagraphs(allParagraphs);
  const title = sorted[0].content;
  const paragraphs = sorted.slice(1).map((p, i) => ({ ...p, order: i }));

  return { title, paragraphs };
}
```

### 2.3 Update Statement Controllers
**File**: `src/controllers/db/statements/setStatements.ts`

Update `createStatement()`:
- Accept `paragraphs` array
- Extract first paragraph as `statement` (title)
- Store remaining as `paragraphs[]`
- Remove `description` field handling

Update `updateStatementParagraphs()`:
- Extract title from first paragraph
- Update both `statement` and `paragraphs` fields

### 2.4 Update RichTextEditor
**File**: `src/view/components/richTextEditor/RichTextEditor.tsx`

- Single editor for title + content
- First paragraph auto-becomes title
- Return full paragraph array (title included as first item)

### 2.5 Update Display Components
**Files**:
- `src/view/components/richTextEditor/ParagraphsDisplay.tsx`
- `src/view/components/text/Text.tsx`
- `src/view/components/edit/EditableDescription.tsx`

- Remove description fallback logic
- Only render from `paragraphs[]` array

### 2.6 Update Forms
**Files**:
- `src/view/pages/statement/components/createStatementModal/CreateStatementModal.tsx`
- `src/view/pages/statement/components/newStatement/*.tsx`
- `src/view/pages/statement/components/settings/components/titleAndDescription/TitleAndDescription.tsx`

- Replace description textarea with RichTextEditor
- Auto-extract title from first paragraph

---

## Phase 3: Update Sign App

### 3.1 Update Types
**File**: `apps/sign/src/types/index.ts`

- Import `Paragraph`, `ParagraphType` from `@freedi/shared-types`
- Remove local definitions
- Keep Sign-specific extensions (`isNonInteractive`)

### 3.2 Update Utilities
**File**: `apps/sign/src/lib/utils/paragraphUtils.ts`

- Import from shared-types
- Remove `descriptionToParagraphs` fallback (no more description)

### 3.3 Update Queries
**File**: `apps/sign/src/lib/firebase/queries.ts`

- Remove description fallback in `getParagraphsFromStatement()`
- Only read from `paragraphs[]` array

---

## Phase 4: Update Mass Consensus App

### 4.1 Add Dependencies
**File**: `apps/mass-consensus/package.json`

```json
{
  "dependencies": {
    "@tiptap/react": "^2.x",
    "@tiptap/starter-kit": "^2.x",
    "@tiptap/extension-placeholder": "^2.x"
  }
}
```

### 4.2 Create Utilities
**File**: `apps/mass-consensus/src/lib/utils/paragraphUtils.ts`

Copy from main app:
- `generateParagraphId()`
- `sortParagraphs()`
- `extractTitleAndParagraphs()`

### 4.3 Create RichTextEditor
**Files**:
- `apps/mass-consensus/src/components/admin/RichTextEditor/RichTextEditor.tsx`
- `apps/mass-consensus/src/components/admin/RichTextEditor/EditorToolbar.tsx`
- `apps/mass-consensus/src/components/admin/RichTextEditor/RichTextEditor.module.scss`

Port from main app's `src/view/components/richTextEditor/`

### 4.4 Create ParagraphsDisplay
**File**: `apps/mass-consensus/src/components/shared/ParagraphsDisplay.tsx`

Port from main app's `src/view/components/richTextEditor/ParagraphsDisplay.tsx`

### 4.5 Update API Routes
**Files**:
- `apps/mass-consensus/app/api/surveys/route.ts`
- `apps/mass-consensus/app/api/surveys/[id]/questions/route.ts`
- `apps/mass-consensus/app/api/statements/[id]/submit/route.ts`

- Accept `paragraphs[]` in request body
- Extract title from first paragraph
- Remove `description` handling

### 4.6 Update Components
**Files**:
- `apps/mass-consensus/src/components/admin/SurveyForm.tsx` → RichTextEditor
- `apps/mass-consensus/src/components/question/QuestionHeader.tsx` → ParagraphsDisplay
- `apps/mass-consensus/src/components/survey/SurveyWelcome.tsx` → ParagraphsDisplay
- `apps/mass-consensus/src/components/admin/SurveyCard.tsx` → ParagraphsDisplay
- `apps/mass-consensus/src/components/q-results/ResultCard.tsx` → ParagraphsDisplay
- `apps/mass-consensus/src/components/question/SolutionCard.tsx` → ParagraphsDisplay

---

## Phase 5: Update Cloud Functions

### 5.1 Update OG Tags
**File**: `functions/src/fn_dynamicOgTags.ts`

```typescript
// Generate meta description from paragraphs
let metaDescription = 'Freedi';
if (statement.paragraphs?.length > 0) {
  metaDescription = statement.paragraphs
    .map(p => p.content)
    .join(' ')
    .substring(0, 160);
}
```

### 5.2 Update AI Service
**File**: `functions/src/services/ai-service.ts`

- Rename `generateTitleAndDescription` → `generateTitleAndParagraphs`
- Return `{ title: string, paragraphs: Paragraph[] }`

### 5.3 Update Similar Statements
**File**: `functions/src/fn_findSimilarStatements.ts`

- Return `generatedParagraphs` instead of `generatedDescription`

### 5.4 Update Integration Service
**File**: `functions/src/services/integration-ai-service.ts`

- Update to work with paragraphs array

### 5.5 Update Subscription Notifications
**File**: `functions/src/fn_subscriptions.ts`

- Compare paragraphs instead of description for change detection

---

## Phase 6: Data Migration

### 6.1 Create Migration Script
**File**: `scripts/migrateDescriptionToParagraphs.ts`

```typescript
// For each document with description but no paragraphs:
// 1. Split description by newlines
// 2. First line → statement (title) if empty
// 3. Remaining lines → paragraphs[]
// 4. Remove description field
```

### 6.2 Run Migration
- Backup Firestore before running
- Process in batches of 500
- Log progress and errors
- Verify migration success

---

## Critical Files Summary

| Category | Files |
|----------|-------|
| **shared-types** | `packages/shared-types/src/models/paragraph/paragraphModel.ts`, `packages/shared-types/src/models/statement/StatementTypes.ts` |
| **Main App** | `src/controllers/db/statements/setStatements.ts`, `src/utils/paragraphUtils.ts`, `src/view/components/richTextEditor/RichTextEditor.tsx` |
| **Sign App** | `apps/sign/src/types/index.ts`, `apps/sign/src/lib/firebase/queries.ts` |
| **MC App** | `apps/mass-consensus/src/components/admin/SurveyForm.tsx`, `apps/mass-consensus/app/api/surveys/route.ts` |
| **Functions** | `functions/src/fn_dynamicOgTags.ts`, `functions/src/services/ai-service.ts` |

---

## Implementation Order

1. **Phase 1**: shared-types (foundation)
2. **Phase 6**: Data migration script (prepare but don't run)
3. **Phase 2**: Main App
4. **Phase 3**: Sign App
5. **Phase 4**: Mass Consensus App
6. **Phase 5**: Cloud Functions
7. **Run migration script**
8. **Remove description field from schema**

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Data loss | Backup Firestore before migration |
| Breaking changes | Deploy all apps together |
| AI service disruption | Keep fallback generation temporarily |
| External integrations | Document breaking changes |
