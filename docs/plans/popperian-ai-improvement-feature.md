# Plan: Improve Popperian Discussion with AI Enhancement Feature

## Overview

This plan implements improvements to the Popperian Discussion system:

1. **"Improve with AI" Feature**: A button on Option detail pages that synthesizes all discussion evidence using Gemini AI to generate an improved proposal
2. **Version Control**: Track proposal versions so users can revert to previous versions
3. **Enhanced Existing System**: Make the EvolutionPrompt's "Create Improved Version" button functional

## Requirements Summary

- **Location**: Button on Option detail page (PopperHebbianDiscussion component)
- **Behavior**: Show preview modal with side-by-side diff before applying
- **Update**: Update proposal in-place with version history
- **Permissions**: Only proposal creator + group admins can use the feature
- **Languages**: Support all existing languages (he, ar, en, es, fr, de, nl)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Frontend (React)                           │
├─────────────────────────────────────────────────────────────────┤
│  PopperHebbianDiscussion.tsx                                    │
│  └── "Improve with AI" button (visible to creator/admins)       │
│       └── ImproveProposalModal.tsx (NEW)                        │
│            ├── Loading state with progress messages             │
│            ├── Side-by-side diff preview                        │
│            ├── Version history display                          │
│            └── Accept/Reject/Revert actions                     │
├─────────────────────────────────────────────────────────────────┤
│  improveProposalController.ts (NEW)                             │
│  └── httpsCallable('improveProposalWithAI')                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Backend (Firebase Functions)                  │
├─────────────────────────────────────────────────────────────────┤
│  fn_popperHebbian_improveProposal.ts (NEW)                      │
│  ├── Validate user permissions (creator or admin)              │
│  ├── Fetch all evidence posts for the Option                   │
│  ├── Build synthesis prompt with evidence context              │
│  ├── Call Gemini AI (gemini-2.0-flash-exp)                     │
│  └── Return improved proposal + reasoning                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Changes

### New Files to Create

| File | Purpose |
|------|---------|
| `functions/src/fn_popperHebbian_improveProposal.ts` | Firebase callable function for AI synthesis |
| `src/controllers/db/popperHebbian/improveProposalController.ts` | Frontend controller for API calls |
| `src/models/popperHebbian/ImproveProposalModels.ts` | Types and Valibot schemas |
| `src/view/pages/statement/components/popperHebbian/components/ImproveProposalModal/ImproveProposalModal.tsx` | Main preview modal |
| `src/view/pages/statement/components/popperHebbian/components/ImproveProposalModal/ImproveProposalModal.module.scss` | Modal styles |
| `src/view/pages/statement/components/popperHebbian/components/ImproveProposalModal/DiffView.tsx` | Side-by-side diff component |
| `src/view/pages/statement/components/popperHebbian/components/ImproveProposalModal/VersionHistory.tsx` | Version history display |

### Files to Modify

| File | Changes |
|------|---------|
| `functions/src/index.ts` | Export new `improveProposalWithAI` function |
| `src/view/pages/statement/components/popperHebbian/PopperHebbianDiscussion.tsx` | Add "Improve with AI" button and modal integration |
| `src/view/pages/statement/components/popperHebbian/PopperHebbianDiscussion.module.scss` | Button styles |
| `src/view/pages/statement/components/popperHebbian/components/EvolutionPrompt/EvolutionPrompt.tsx` | Wire up existing button to use AI improvement |
| `src/assets/Languages/*.json` | Add translation keys |

---

## Implementation Details

### 1. Version Control Data Model

Add to Statement type (extend locally or in delib-npm):

```typescript
interface StatementVersion {
  version: number;
  text: string;
  timestamp: number;
  changedBy: string;  // userId
  changeType: 'manual' | 'ai-improved';
  improvementSummary?: string;  // For AI changes
}

// Add to Statement
interface Statement {
  // ... existing fields
  versions?: StatementVersion[];  // Version history
  currentVersion?: number;        // Current version number
}
```

### 2. Firebase Callable Function

**File**: `functions/src/fn_popperHebbian_improveProposal.ts`

```typescript
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { Statement, Collections } from 'delib-npm';
import { getGeminiModel, geminiApiKey } from './config/gemini';

interface ImproveProposalRequest {
  statementId: string;
  language?: string;
}

interface ImproveProposalResponse {
  originalProposal: string;
  improvedProposal: string;
  improvementSummary: string;
  changesHighlight: string[];
  evidenceConsidered: number;
  confidence: number;
}

export const improveProposalWithAI = onCall<ImproveProposalRequest>(
  { secrets: [geminiApiKey] },
  async (request): Promise<ImproveProposalResponse> => {
    const { statementId, language = 'en' } = request.data;
    const userId = request.auth?.uid;

    if (!userId) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const db = getFirestore();

    // 1. Fetch the proposal statement
    const statementDoc = await db.collection(Collections.statements).doc(statementId).get();
    if (!statementDoc.exists) {
      throw new HttpsError('not-found', 'Statement not found');
    }
    const statement = statementDoc.data() as Statement;

    // 2. Check permissions: creator or admin
    const isCreator = statement.creatorId === userId;

    // Check if user is admin for this group
    let isAdmin = false;
    if (statement.topParentId) {
      const membersSnapshot = await db
        .collection(Collections.statementsSubscribe)
        .where('statementId', '==', statement.topParentId)
        .where('oderId', '==', userId)
        .where('role', 'in', ['admin', 'creator'])
        .limit(1)
        .get();
      isAdmin = !membersSnapshot.empty;
    }

    if (!isCreator && !isAdmin) {
      throw new HttpsError('permission-denied', 'Only the creator or admins can improve this proposal');
    }

    // 3. Fetch all evidence posts
    const evidenceSnapshot = await db
      .collection(Collections.statements)
      .where('parentId', '==', statementId)
      .where('evidence', '!=', null)
      .orderBy('evidence')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const evidencePosts = evidenceSnapshot.docs.map(doc => doc.data() as Statement);

    // 4. Build synthesis prompt
    const prompt = buildSynthesisPrompt(statement.statement, evidencePosts, language);

    // 5. Call Gemini
    const model = getGeminiModel();
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
      },
    });

    const aiResponse = JSON.parse(result.response.text());

    return {
      originalProposal: statement.statement,
      improvedProposal: aiResponse.improvedProposal,
      improvementSummary: aiResponse.improvementSummary,
      changesHighlight: aiResponse.changesHighlight,
      evidenceConsidered: evidencePosts.length,
      confidence: aiResponse.confidence,
    };
  }
);

function buildSynthesisPrompt(proposalText: string, evidencePosts: Statement[], language: string): string {
  const languageNames: Record<string, string> = {
    he: 'Hebrew', ar: 'Arabic', en: 'English', es: 'Spanish',
    fr: 'French', de: 'German', nl: 'Dutch'
  };
  const languageName = languageNames[language] || 'English';

  const supporting = evidencePosts
    .filter(p => (p.evidence?.support ?? 0) > 0)
    .map(p => `- ${p.statement} (support: ${p.evidence?.support?.toFixed(1)})`).join('\n');

  const challenging = evidencePosts
    .filter(p => (p.evidence?.support ?? 0) < 0)
    .map(p => `- ${p.statement} (challenge strength: ${Math.abs(p.evidence?.support ?? 0).toFixed(1)})`).join('\n');

  return `You are an expert deliberative facilitator. Your role is to evolve proposals toward genuine consensus by integrating evidence from the discussion.

IMPORTANT: Respond entirely in ${languageName}.

## Original Proposal
"${proposalText}"

## Supporting Evidence (${evidencePosts.filter(p => (p.evidence?.support ?? 0) > 0).length} items):
${supporting || 'None'}

## Challenging Evidence (${evidencePosts.filter(p => (p.evidence?.support ?? 0) < 0).length} items):
${challenging || 'None'}

## Your Task
Improve the proposal by:
1. Addressing valid criticisms
2. Incorporating helpful suggestions
3. Clarifying ambiguous parts
4. Making it more balanced and responsive to the group

Preserve the original intent. Do not introduce ideas not grounded in the discussion.

## Response Format (JSON)
{
  "improvedProposal": "The improved proposal text in ${languageName}",
  "improvementSummary": "Brief explanation of changes (2-3 sentences) in ${languageName}",
  "changesHighlight": ["Key change 1", "Key change 2", "..."],
  "confidence": 0.85
}`;
}
```

### 3. Frontend Controller

**File**: `src/controllers/db/popperHebbian/improveProposalController.ts`

```typescript
import { httpsCallable } from 'firebase/functions';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { functions, FireStore, auth } from '../config';
import { Collections, Statement } from 'delib-npm';
import { logError } from '@/utils/errorHandling';
import { getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logger } from '@/services/logger';

interface ImproveProposalResponse {
  originalProposal: string;
  improvedProposal: string;
  improvementSummary: string;
  changesHighlight: string[];
  evidenceConsidered: number;
  confidence: number;
}

interface StatementVersion {
  version: number;
  text: string;
  timestamp: number;
  changedBy: string;
  changeType: 'manual' | 'ai-improved';
  improvementSummary?: string;
}

/**
 * Request AI improvement for a proposal
 */
export async function requestProposalImprovement(
  statementId: string,
  language: string = 'en'
): Promise<ImproveProposalResponse> {
  try {
    const improveProposal = httpsCallable<
      { statementId: string; language: string },
      ImproveProposalResponse
    >(functions, 'improveProposalWithAI');

    const result = await improveProposal({ statementId, language });
    logger.info('Proposal improvement requested', { statementId });
    return result.data;
  } catch (error) {
    logError(error, {
      operation: 'improveProposalController.requestProposalImprovement',
      statementId,
    });
    throw error;
  }
}

/**
 * Apply AI improvement with version control
 */
export async function applyImprovement(
  statementId: string,
  currentText: string,
  improvedText: string,
  improvementSummary: string,
  currentVersion: number = 0
): Promise<void> {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('User must be authenticated');

    const statementRef = doc(FireStore, Collections.statements, statementId);
    const newVersion: StatementVersion = {
      version: currentVersion + 1,
      text: improvedText,
      timestamp: getCurrentTimestamp(),
      changedBy: currentUser.uid,
      changeType: 'ai-improved',
      improvementSummary,
    };

    // If this is the first version, save original as version 0
    const updates: Record<string, unknown> = {
      statement: improvedText,
      lastUpdate: getCurrentTimestamp(),
      currentVersion: currentVersion + 1,
    };

    if (currentVersion === 0) {
      // Save original as version 0
      const originalVersion: StatementVersion = {
        version: 0,
        text: currentText,
        timestamp: getCurrentTimestamp(),
        changedBy: currentUser.uid,
        changeType: 'manual',
      };
      updates.versions = [originalVersion, newVersion];
    } else {
      updates.versions = arrayUnion(newVersion);
    }

    await updateDoc(statementRef, updates);
    logger.info('Improvement applied', { statementId, newVersion: currentVersion + 1 });
  } catch (error) {
    logError(error, {
      operation: 'improveProposalController.applyImprovement',
      statementId,
    });
    throw error;
  }
}

/**
 * Revert to a previous version
 */
export async function revertToVersion(
  statementId: string,
  versions: StatementVersion[],
  targetVersion: number
): Promise<void> {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('User must be authenticated');

    const targetVersionData = versions.find(v => v.version === targetVersion);
    if (!targetVersionData) throw new Error('Version not found');

    const statementRef = doc(FireStore, Collections.statements, statementId);

    // Create revert version entry
    const revertVersion: StatementVersion = {
      version: versions.length,
      text: targetVersionData.text,
      timestamp: getCurrentTimestamp(),
      changedBy: currentUser.uid,
      changeType: 'manual',
      improvementSummary: `Reverted to version ${targetVersion}`,
    };

    await updateDoc(statementRef, {
      statement: targetVersionData.text,
      lastUpdate: getCurrentTimestamp(),
      currentVersion: versions.length,
      versions: arrayUnion(revertVersion),
    });

    logger.info('Reverted to version', { statementId, targetVersion });
  } catch (error) {
    logError(error, {
      operation: 'improveProposalController.revertToVersion',
      statementId,
      targetVersion,
    });
    throw error;
  }
}

/**
 * Check if user can improve this proposal (creator or admin)
 */
export function canUserImprove(
  statement: Statement,
  userId: string,
  userRole?: string
): boolean {
  const isCreator = statement.creatorId === userId;
  const isAdmin = userRole === 'admin' || userRole === 'creator';
  return isCreator || isAdmin;
}
```

### 4. Preview Modal Component

**File**: `src/view/pages/statement/components/popperHebbian/components/ImproveProposalModal/ImproveProposalModal.tsx`

Key features:
- Loading state with rotating messages
- Side-by-side diff view (original vs improved)
- "What Changed" summary with bullet points
- Version history panel (collapsible)
- Accept/Discard/Revert actions
- Accessibility: focus trap, escape to close, aria labels

### 5. Integration into PopperHebbianDiscussion

Add button below IdeaScoreboard:

```tsx
// In PopperHebbianDiscussion.tsx

// Add permission check
const canImprove = useMemo(() => {
  if (!user) return false;
  return canUserImprove(statement, user.uid, userRole);
}, [statement, user, userRole]);

// Add in render, after IdeaScoreboard
{canImprove && evidencePosts.length > 0 && (
  <div className={styles.improveSection}>
    <button
      className={styles.improveButton}
      onClick={() => setShowImproveModal(true)}
      aria-label={t('Generate AI-improved version based on discussion')}
    >
      <span className={styles.improveIcon}>✨</span>
      {t('Improve with AI')}
    </button>
    <p className={styles.improveHint}>
      {t('Get an AI-suggested improvement based on {{count}} contributions',
        { count: evidencePosts.length })}
    </p>
  </div>
)}
```

### 6. Wire Up EvolutionPrompt

Update `EvolutionPrompt.tsx` to call the same improvement flow:

```tsx
// Instead of placeholder callback, open the improve modal
<button onClick={onOpenImproveModal}>
  <span>✨</span>
  {t('Let AI Help')}
</button>
```

---

## Translation Keys to Add

```json
{
  "Improve with AI": "שפר עם AI",
  "Get an AI-suggested improvement based on {{count}} contributions": "קבל הצעה לשיפור מבוססת AI על סמך {{count}} תרומות",
  "Analyzing discussion contributions...": "מנתח תרומות לדיון...",
  "Synthesizing evidence...": "מסנתז ראיות...",
  "AI-Improved Version": "גרסה משופרת עם AI",
  "Original": "מקור",
  "Improved": "משופר",
  "What Changed": "מה השתנה",
  "Apply Improvement": "החל שיפור",
  "Discard": "בטל",
  "Version History": "היסטוריית גרסאות",
  "Revert to this version": "חזור לגרסה זו",
  "Version {{n}}": "גרסה {{n}}",
  "AI improved": "שופר עם AI",
  "Only the creator or admins can improve this proposal": "רק היוצר או מנהלים יכולים לשפר הצעה זו"
}
```

---

## Implementation Phases

### Phase 1: Backend (Est. 2-3 hours)
1. Create `fn_popperHebbian_improveProposal.ts` with:
   - Permission validation (creator + admin check)
   - Evidence fetching and categorization
   - Gemini prompt construction
   - JSON response parsing
2. Export in `functions/src/index.ts`
3. Test with Firebase emulator

### Phase 2: Controller & Types (Est. 1-2 hours)
1. Create `ImproveProposalModels.ts` with Valibot schemas
2. Create `improveProposalController.ts` with:
   - `requestProposalImprovement()`
   - `applyImprovement()` with version control
   - `revertToVersion()`
   - `canUserImprove()` permission helper

### Phase 3: Modal Component (Est. 3-4 hours)
1. Create `ImproveProposalModal.tsx` with:
   - Loading state with rotating messages
   - Error state with retry
   - Preview state with diff view
   - Success state
2. Create `DiffView.tsx` for side-by-side comparison
3. Create `VersionHistory.tsx` for viewing/reverting versions
4. Create SCSS module with responsive styles

### Phase 4: Integration (Est. 1-2 hours)
1. Add button to `PopperHebbianDiscussion.tsx`
2. Wire up `EvolutionPrompt.tsx` to use same flow
3. Add translation keys to all language files

### Phase 5: Testing & Polish (Est. 2 hours)
1. Test permission flows (creator, admin, other user)
2. Test version control (apply, revert)
3. Test with RTL languages
4. Test mobile responsiveness
5. Accessibility review

---

## Critical Files Reference

| File | Purpose |
|------|---------|
| `functions/src/fn_popperHebbian_refineIdea.ts` | Pattern for callable function with Gemini |
| `functions/src/fn_popperHebbian_onEvidencePost.ts` | Pattern for evidence fetching and AI classification |
| `src/view/pages/statement/components/popperHebbian/PopperHebbianDiscussion.tsx` | Main component to modify |
| `src/view/pages/statement/components/popperHebbian/refinery/IdeaRefineryModal.tsx` | Pattern for modal structure |
| `src/controllers/db/popperHebbian/refineryController.ts` | Pattern for Firebase function calls |
| `src/view/pages/statement/components/popperHebbian/components/EvolutionPrompt/EvolutionPrompt.tsx` | Wire up existing button |
| `src/controllers/db/popperHebbian/evidenceController.ts` | Evidence operations reference |

---

## Security Considerations

1. **Authentication**: All API calls require authenticated user
2. **Authorization**: Server-side check for creator or admin role
3. **Rate Limiting**: Firebase Functions built-in limits apply
4. **Prompt Injection**: Prompt constructed server-side, user input sanitized
5. **Data Validation**: Valibot schemas validate all request/response data

---

## Edge Cases Handled

| Case | Handling |
|------|----------|
| No evidence posts | Button shows but AI improves for clarity only |
| 50+ evidence posts | Truncate to 50 most recent, mention total |
| User not creator/admin | Button hidden; server rejects if bypassed |
| AI call fails | Recoverable error with retry button |
| Network timeout | Mapped to network error with retry |
| RTL languages | Full RTL support in modal styles |
| First improvement | Save original as version 0 |
| Revert requested | Create new version entry pointing to old text |

---

## UX Flow

```
[User views Option with Popper-Hebbian discussion]
                    │
                    ▼
    ┌────────────────────────────────┐
    │  IdeaScoreboard                │
    │  Status: Under Discussion      │
    │  Score: +2.5                   │
    │                                │
    │  [✨ Improve with AI]          │  ← Only visible to creator/admins
    │  "Based on 5 contributions"    │
    └────────────────────────────────┘
                    │
         (User clicks button)
                    │
                    ▼
    ┌────────────────────────────────┐
    │  Loading Modal                 │
    │  "Analyzing discussion..."     │
    │  "Synthesizing evidence..."    │
    │  [Spinner]                     │
    └────────────────────────────────┘
                    │
                    ▼
    ┌────────────────────────────────┐
    │  Preview Modal                 │
    │  ┌──────────┬──────────┐      │
    │  │ Original │ Improved │      │
    │  │          │          │      │
    │  └──────────┴──────────┘      │
    │                                │
    │  What Changed:                 │
    │  • Addressed safety concern    │
    │  • Clarified timeline          │
    │                                │
    │  [Version History ▼]           │
    │                                │
    │  [Discard] [Apply Improvement] │
    └────────────────────────────────┘
                    │
         (User clicks Apply)
                    │
                    ▼
    ┌────────────────────────────────┐
    │  Statement updated in-place    │
    │  Version 1 saved to history    │
    │  Original saved as Version 0   │
    │  Toast: "Improvement applied!" │
    └────────────────────────────────┘
```

---

## Total Estimated Time: ~10-13 hours
