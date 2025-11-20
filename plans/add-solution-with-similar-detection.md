# Add Solution with Similar Detection - Implementation Plan

**Date**: 2025-11-20
**Target**: Mass-Consensus App (Next.js)
**Status**: Planning

## Overview

Transform the "add solution" workflow to match the main app's behavior with automatic similar statement detection, slur checking, and user limit enforcement.

## User Flow

1. User enters solution text in AddSolutionForm
2. **Automatic check** for inappropriate content (slurs, profanity)
3. **Automatic search** for similar existing solutions
4. Show user their suggestion + similar alternatives
5. User selects their own OR existing solution
6. **Auto +1 evaluation** added to selected solution
7. **Success message** displayed (2-3 seconds)
8. Return to evaluation feed

## Technical Architecture

### Backend Infrastructure (Already Exists)

**Cloud Function**: `checkForSimilarStatements`
- Endpoint: `https://us-central1-{project-id}.cloudfunctions.net/checkForSimilarStatements`
- Features:
  - AI-powered slur/profanity detection (Google Generative AI)
  - Semantic similarity search (60%+ match threshold)
  - User limit validation
  - Response caching
  - Returns top 6 similar statements

**Request**:
```typescript
POST /checkForSimilarStatements
{
  "statementId": string,
  "userInput": string,
  "creatorId": string,
  "generateIfNeeded": false
}
```

**Response**:
```typescript
{
  "ok": true,
  "similarStatements": Statement[],
  "userText": string,
  "cached": boolean,
  "responseTime": number
}
```

**Error Codes**:
- 400: Inappropriate content detected
- 403: User reached submission limit
- 404: Parent statement not found
- 500: Internal error

### New API Routes (Mass-Consensus)

#### 1. Similar Solutions Check
**File**: `apps/mass-consensus/app/api/statements/[id]/similar/route.ts`

```typescript
POST /api/statements/[id]/similar
Request: { userInput: string, userId: string }
Response: { similarStatements: Statement[], userText: string }
```

**Responsibilities**:
- Proxy to Cloud Function
- Handle anonymous user IDs
- Format error responses
- Pass through cached responses

#### 2. Submit Solution (Updated)
**File**: `apps/mass-consensus/app/api/statements/[id]/submit/route.ts`

**New Parameter**: `existingStatementId?: string`

**Logic**:
```typescript
if (existingStatementId) {
  // User selected existing solution
  // Create evaluation (+1)
  // Update evaluation counters
  return { action: 'evaluated', statementId: existingStatementId }
} else {
  // User selected their own (new) solution
  // Create new statement
  // Create evaluation (+1)
  // Update parent counters
  return { action: 'created', statementId: newId }
}
```

**User Limit Enforcement**:
```typescript
// Get question settings
const numberOfOptionsPerUser = question.statementSettings?.numberOfOptionsPerUser || Infinity;

// Count user's existing solutions
const userSolutions = await getUserSolutionsCount(questionId, userId);

// Reject if limit reached
if (userSolutions >= numberOfOptionsPerUser) {
  return 403 error
}
```

### Frontend Components

#### 1. AddSolutionForm (Modified)
**File**: `apps/mass-consensus/src/components/question/AddSolutionForm.tsx`

**Changes**:
- Remove direct submit to `/api/statements/[id]/submit`
- Add call to `/api/statements/[id]/similar` on submit
- Add loading state: "Checking for similar solutions..."
- Handle errors:
  - 400 (inappropriate): Show error, allow retry
  - 403 (limit reached): Show message, disable form
  - 500 (internal): Show error, allow retry
- On success: Trigger `onSimilarFound(data)` callback

**States**:
- `idle` - Initial state
- `checking` - Calling similar API
- `error` - Show error message
- `limit-reached` - Disable form

#### 2. SimilarSolutions (New)
**File**: `apps/mass-consensus/src/components/question/SimilarSolutions.tsx`

**Props**:
```typescript
interface SimilarSolutionsProps {
  userSuggestion: string;
  similarSolutions: Statement[];
  onSelect: (statementId: string | null) => void;
  onBack: () => void;
}
```

**UI Structure**:
```
┌─────────────────────────────────────┐
│ Your Suggestion (highlighted)       │
│ "Build more affordable housing..."  │
│ [SELECT]                            │
├─────────────────────────────────────┤
│ Similar Existing Solutions          │
│                                     │
│ • "Increase affordable housing..."  │
│   [SELECT]                          │
│                                     │
│ • "Create more low-cost units..."   │
│   [SELECT]                          │
│                                     │
│ [← Back to Edit]                    │
└─────────────────────────────────────┘
```

**Behavior**:
- User suggestion: `onSelect(null)` - creates new
- Existing solution: `onSelect(statementId)` - evaluates existing
- Back button: `onBack()` - return to form
- Auto-select if only 1 option (user's own)

#### 3. SuccessMessage (New)
**File**: `apps/mass-consensus/src/components/question/SuccessMessage.tsx`

**Props**:
```typescript
interface SuccessMessageProps {
  action: 'created' | 'evaluated';
  solutionText: string;
  onComplete: () => void;
}
```

**Display**:
- Created: "✓ Solution submitted successfully!"
- Evaluated: "✓ Evaluation added!"
- Show for 2-3 seconds
- Auto-call `onComplete()` → return to evaluation feed

#### 4. Question Page (Modified)
**File**: `apps/mass-consensus/app/q/[statementId]/page.tsx`

**State Management**:
```typescript
type FlowState =
  | { step: 'input' }
  | { step: 'similar', data: SimilarData }
  | { step: 'submitting' }
  | { step: 'success', action: 'created' | 'evaluated' }
  | { step: 'evaluate' }
```

**Flow**:
1. `input` → User fills form → Calls similar API
2. `similar` → Shows SimilarSolutions → User selects
3. `submitting` → Calls submit API
4. `success` → Shows SuccessMessage (2s)
5. `evaluate` → Returns to SolutionFeedClient

## Environment Setup

**File**: `apps/mass-consensus/.env.local`

```bash
CHECK_SIMILARITIES_ENDPOINT=https://us-central1-{project-id}.cloudfunctions.net/checkForSimilarStatements
```

For local development:
```bash
CHECK_SIMILARITIES_ENDPOINT=http://localhost:5001/{project-id}/us-central1/checkForSimilarStatements
```

## Type Definitions

**File**: `apps/mass-consensus/src/types/api.ts`

```typescript
import { Statement } from 'delib-npm';

export interface SimilarCheckRequest {
  userInput: string;
  userId: string;
}

export interface SimilarCheckResponse {
  ok: boolean;
  similarStatements: Statement[];
  userText: string;
  cached?: boolean;
  responseTime?: number;
}

export interface SubmitSolutionRequest {
  userInput: string;
  userId: string;
  existingStatementId?: string;
}

export interface SubmitSolutionResponse {
  success: boolean;
  action: 'created' | 'evaluated';
  statementId: string;
}

export interface ErrorResponse {
  error: string;
  code?: string;
}
```

## Error Handling Strategy

Follow CLAUDE.md guidelines:

```typescript
import { logError, ValidationError, DatabaseError } from '@/utils/errorHandling';

try {
  // Operation
} catch (error) {
  logError(error, {
    operation: 'api.statements.similar',
    userId,
    statementId,
    metadata: { userInput }
  });

  // Return user-friendly error
  return NextResponse.json(
    { error: ERROR_MESSAGES.GENERIC },
    { status: 500 }
  );
}
```

**Error Categories**:
- Inappropriate content (400): "Your submission contains inappropriate content. Please revise."
- Limit reached (403): "You've reached the maximum number of solutions for this question."
- Network error (500): "Something went wrong. Please try again."

## Testing Strategy

### Unit Tests
- [ ] API route: similar check proxy
- [ ] API route: submit with existing vs new
- [ ] User limit calculation
- [ ] Error handling for each error code

### Integration Tests
- [ ] Full flow: input → similar → select → success
- [ ] Slur detection blocks submission
- [ ] Similar detection finds matches
- [ ] User limit enforcement works
- [ ] Evaluation created correctly (+1)
- [ ] Parent counters updated

### E2E Tests (Playwright)
- [ ] Submit new unique solution
- [ ] Submit similar solution, select existing
- [ ] Submit similar solution, select own
- [ ] Reach submission limit
- [ ] Submit inappropriate content
- [ ] Network error handling

### Manual Testing Checklist
- [ ] Loading states show correctly
- [ ] Error messages are user-friendly
- [ ] Success message displays and auto-dismisses
- [ ] Returns to evaluation feed after success
- [ ] Submitted solution doesn't appear in next batch
- [ ] Cache works (submit same text twice quickly)

## Performance Considerations

### Caching
- Cloud Function already caches responses (15 min TTL)
- Same input + statementId = instant response
- Consider client-side cache for retries

### Loading States
- Show "Checking for similar solutions..." immediately
- Skeleton loader for similar results
- Disable form during API calls

### Optimizations
- Debounce form submission (prevent double-submit)
- Prefetch evaluation feed while showing success message
- Lazy load SimilarSolutions component

## Rollout Plan

### Phase 1: Backend (Day 1)
1. Add environment variable
2. Create similar API route
3. Update submit API route
4. Add user limit logic
5. Test API routes independently

### Phase 2: Frontend (Day 2)
1. Create SimilarSolutions component
2. Create SuccessMessage component
3. Update AddSolutionForm
4. Wire up state management
5. Test component interactions

### Phase 3: Integration (Day 3)
1. Connect all components
2. End-to-end testing
3. Error handling verification
4. Performance testing

### Phase 4: Polish (Day 4)
1. UI/UX refinements
2. Loading state improvements
3. Error message clarity
4. Accessibility check

## Success Metrics

After deployment, monitor:
- **Duplicate prevention rate**: % of users who select existing vs create new
- **Slur detection rate**: % of submissions blocked
- **User satisfaction**: Feedback on similar suggestions quality
- **Submission completion rate**: % who complete full flow
- **Error rate**: Track 400/403/500 errors

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Cloud Function unavailable | High | Graceful degradation: allow submit without check |
| AI false positives (slur detection) | Medium | Provide appeal/override mechanism |
| Poor similarity matching | Medium | Tune AI threshold, collect feedback |
| User limit too restrictive | Low | Make configurable per question |
| Performance issues | Medium | Caching, optimize API calls |

## Future Enhancements

- [ ] AI-generated alternative suggestions (`generateIfNeeded: true`)
- [ ] User feedback on similarity quality ("None of these match")
- [ ] Bulk import existing solutions
- [ ] Admin dashboard for slur detection review
- [ ] A/B test similarity threshold
- [ ] Multi-language support for slur detection

## References

- Main app implementation: `/src/view/pages/massConsensus/`
- Cloud Function: `/functions/src/fn_findSimilarStatements.ts`
- Design guide: `/docs/design-guide.md`
- Error handling: `/src/utils/errorHandling.ts`
