# Add Solution Feature - Todo List

**Last Updated**: 2025-11-20
**Status**: Planning Complete

## Setup
- [ ] Create `plans/` directory ✓
- [ ] Add `CHECK_SIMILARITIES_ENDPOINT` to `.env.local`
- [ ] Verify Cloud Function is deployed and accessible

## Backend API Routes

### Similar Check Route
- [ ] Create `app/api/statements/[id]/similar/route.ts`
- [ ] Implement POST handler
- [ ] Add request validation (userInput, userId required)
- [ ] Proxy request to Cloud Function
- [ ] Handle error responses (400, 403, 500)
- [ ] Format successful response
- [ ] Add error logging with context
- [ ] Write unit tests

### Submit Route Updates
- [ ] Update `app/api/statements/[id]/submit/route.ts`
- [ ] Add `existingStatementId` parameter
- [ ] Implement conditional logic (new vs existing)
- [ ] Create evaluation for existing statement
- [ ] Create statement + evaluation for new
- [ ] Update parent question counters
- [ ] Add user limit check
- [ ] Query `numberOfOptionsPerUser` from settings
- [ ] Count user's existing solutions
- [ ] Return 403 if limit reached
- [ ] Add proper error handling
- [ ] Write unit tests

## Frontend Components

### SimilarSolutions Component (New)
- [ ] Create `src/components/question/SimilarSolutions.tsx`
- [ ] Define TypeScript interface for props
- [ ] Create component structure
- [ ] Style user's suggestion (highlighted)
- [ ] Style existing solutions list
- [ ] Implement select handlers
- [ ] Add "Back to Edit" button
- [ ] Handle auto-select if only one option
- [ ] Add loading states
- [ ] Add accessibility attributes
- [ ] Create SCSS module if needed
- [ ] Write component tests

### SuccessMessage Component (New)
- [ ] Create `src/components/question/SuccessMessage.tsx`
- [ ] Define TypeScript interface for props
- [ ] Create component structure
- [ ] Display different messages (created vs evaluated)
- [ ] Implement auto-dismiss timer (2-3s)
- [ ] Call `onComplete` callback
- [ ] Add animation (fade in/out)
- [ ] Style according to design guide
- [ ] Add accessibility (role="status")
- [ ] Write component tests

### AddSolutionForm Updates
- [ ] Open `src/components/question/AddSolutionForm.tsx`
- [ ] Remove direct submit logic
- [ ] Add call to similar API route
- [ ] Add loading state ("Checking for similar...")
- [ ] Implement error handling
  - [ ] 400 error: Show message, allow retry
  - [ ] 403 error: Show limit message, disable form
  - [ ] 500 error: Show generic error, allow retry
- [ ] Add `onSimilarFound` callback prop
- [ ] Update TypeScript types
- [ ] Update component tests

### Question Page Integration
- [ ] Open `app/q/[statementId]/page.tsx`
- [ ] Add state management for flow steps
- [ ] Define FlowState type
- [ ] Implement step transitions
- [ ] Wire up AddSolutionForm
- [ ] Wire up SimilarSolutions
- [ ] Wire up SuccessMessage
- [ ] Handle return to evaluation feed
- [ ] Ensure evaluation feed refreshes
- [ ] Add error boundaries
- [ ] Test full flow

## Type Definitions
- [ ] Create or update `src/types/api.ts`
- [ ] Define `SimilarCheckRequest`
- [ ] Define `SimilarCheckResponse`
- [ ] Define `SubmitSolutionRequest`
- [ ] Define `SubmitSolutionResponse`
- [ ] Define `ErrorResponse`
- [ ] Import Statement type from `delib-npm`
- [ ] Export all types

## Error Handling
- [ ] Import utilities from `@/utils/errorHandling`
- [ ] Use `logError` with context in all try/catch
- [ ] Define user-friendly error messages
- [ ] Create custom error types if needed
- [ ] Test error scenarios

## Testing

### Unit Tests
- [ ] Test similar API route
- [ ] Test submit API route (new statement)
- [ ] Test submit API route (existing statement)
- [ ] Test user limit calculation
- [ ] Test SimilarSolutions component
- [ ] Test SuccessMessage component
- [ ] Test AddSolutionForm component
- [ ] All tests pass with 80%+ coverage

### Integration Tests
- [ ] Test full flow: input → similar → select own → success
- [ ] Test full flow: input → similar → select existing → success
- [ ] Test slur detection (inappropriate content blocked)
- [ ] Test similar detection (finds matches)
- [ ] Test user limit enforcement
- [ ] Test evaluation creation (+1 added)
- [ ] Test parent counter updates

### E2E Tests (Playwright)
- [ ] Write test: Submit new unique solution
- [ ] Write test: Submit similar, select existing
- [ ] Write test: Submit similar, select own
- [ ] Write test: Reach submission limit
- [ ] Write test: Submit inappropriate content
- [ ] Write test: Network error handling
- [ ] All E2E tests pass

### Manual Testing
- [ ] Loading states show correctly
- [ ] Error messages are clear and helpful
- [ ] Success message displays and auto-dismisses
- [ ] Returns to evaluation feed after success
- [ ] Submitted solution doesn't appear in next batch
- [ ] Cache works (submit same text quickly)
- [ ] Mobile responsive
- [ ] Keyboard navigation works
- [ ] Screen reader compatible

## Code Quality
- [ ] Run `npm run lint` - all checks pass
- [ ] Run `npm run typecheck` - no errors
- [ ] Run `npm run build` - successful
- [ ] No `any` types used
- [ ] All imports from `delib-npm` where applicable
- [ ] No magic numbers (use constants)
- [ ] Follow BEM naming for CSS
- [ ] CSS modules only (no global imports)
- [ ] Error logging follows CLAUDE.md

## Documentation
- [ ] Update README if needed
- [ ] Add JSDoc comments to new functions
- [ ] Document API routes
- [ ] Add inline comments for complex logic
- [ ] Update CHANGELOG

## Deployment
- [ ] Verify `.env.local` variables
- [ ] Test in development environment
- [ ] Test in staging environment
- [ ] Deploy to production
- [ ] Monitor error logs
- [ ] Monitor success metrics

## Post-Launch
- [ ] Monitor duplicate prevention rate
- [ ] Monitor slur detection rate
- [ ] Collect user feedback
- [ ] Track error rates
- [ ] Identify improvement opportunities

## Nice-to-Have (Future)
- [ ] AI-generated alternatives
- [ ] "None of these match" feedback
- [ ] Admin slur detection review dashboard
- [ ] Multi-language slur detection
- [ ] Configurable similarity threshold
- [ ] Bulk solution import

---

## Quick Start Guide

To begin implementation:

1. **Start with Backend** (Day 1)
   ```bash
   # Add to .env.local
   CHECK_SIMILARITIES_ENDPOINT=http://localhost:5001/{project}/us-central1/checkForSimilarStatements

   # Create similar API route
   touch apps/mass-consensus/app/api/statements/[id]/similar/route.ts

   # Update submit route
   # Edit: apps/mass-consensus/app/api/statements/[id]/submit/route.ts
   ```

2. **Build Components** (Day 2)
   ```bash
   # Create new components
   mkdir -p apps/mass-consensus/src/components/question
   touch apps/mass-consensus/src/components/question/SimilarSolutions.tsx
   touch apps/mass-consensus/src/components/question/SuccessMessage.tsx
   ```

3. **Wire Everything Up** (Day 3)
   ```bash
   # Update existing files
   # Edit: apps/mass-consensus/src/components/question/AddSolutionForm.tsx
   # Edit: apps/mass-consensus/app/q/[statementId]/page.tsx
   ```

4. **Test & Polish** (Day 4)
   ```bash
   npm run test
   npm run typecheck
   npm run lint
   npm run build
   ```

## Progress Tracking

**Backend**: 0/12 tasks complete (0%)
**Frontend**: 0/34 tasks complete (0%)
**Testing**: 0/24 tasks complete (0%)
**Code Quality**: 0/9 tasks complete (0%)

**Overall**: 0/79 tasks complete (0%)
