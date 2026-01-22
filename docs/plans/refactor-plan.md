# Freedi Platform Refactoring Plan

This document outlines a comprehensive refactoring plan based on an architecture evaluation of the Freedi platform. The plan is organized by priority and includes specific implementation steps.

---

## Executive Summary

| Dimension | Current | Target | Priority |
|-----------|---------|--------|----------|
| Robustness | B | A- | High |
| Maintainability | B+ | A | Medium |
| Code Quality | B | A- | Medium |
| Scalability | B- | B+ | High |
| Security | B | A- | High |
| Test Coverage | ~30% | 70%+ | High |

---

## Phase 1: Critical Security & Stability

**Timeline: Immediate**
**Risk Level: High if not addressed**

### 1.1 Add Rate Limiting to Cloud Functions

**Problem:** HTTP functions have no rate limiting, vulnerable to abuse.

**Implementation Steps:**

1. Create rate limiting middleware for Functions:
   ```
   functions/src/middleware/rateLimit.ts
   ```

2. Implement using Firestore-based tracking:
   ```typescript
   interface RateLimitConfig {
     windowMs: number;      // Time window in ms
     maxRequests: number;   // Max requests per window
     keyGenerator: (req: Request) => string;  // IP or userId
   }
   ```

3. Apply to all HTTP functions in `index.ts`

4. Add to these high-risk endpoints first:
   - `checkForSimilarStatements` (AI costs)
   - `improveSuggestion` (AI costs)
   - `addEmailSubscriber` (spam risk)
   - `getRandomStatements` (database load)

**Files to Create/Modify:**
- [ ] `functions/src/middleware/rateLimit.ts` (new)
- [ ] `functions/src/index.ts` (modify wrappers)
- [ ] `functions/src/services/rate-limit-service.ts` (new)

---

### 1.2 Add Circuit Breaker for AI Service

**Problem:** AI service retries but no circuit breaker for cascading failures.

**Implementation Steps:**

1. Create circuit breaker utility:
   ```
   functions/src/utils/circuitBreaker.ts
   ```

2. Implement states: CLOSED → OPEN → HALF_OPEN

3. Configuration:
   ```typescript
   const AI_CIRCUIT_CONFIG = {
     failureThreshold: 5,      // Open after 5 failures
     resetTimeout: 30000,      // Try again after 30s
     monitorInterval: 10000,   // Check health every 10s
   };
   ```

4. Wrap AI service calls:
   ```typescript
   const aiCircuit = new CircuitBreaker(AI_CIRCUIT_CONFIG);

   export async function checkForSimilarStatements(input: string) {
     return aiCircuit.execute(() => aiService.findSimilar(input));
   }
   ```

**Files to Create/Modify:**
- [ ] `functions/src/utils/circuitBreaker.ts` (new)
- [ ] `functions/src/services/ai-service.ts` (modify)
- [ ] `functions/src/__tests__/circuitBreaker.test.ts` (new)

---

### 1.3 Secure Admin Routes in Sign App

**Problem:** Admin verification could be bypassed with insufficient checks.

**Implementation Steps:**

1. Create middleware for admin routes:
   ```
   apps/sign/src/middleware/adminAuth.ts
   ```

2. Verify admin role server-side on every request:
   ```typescript
   export async function verifyAdminAccess(
     userId: string,
     documentId: string
   ): Promise<boolean> {
     const subscription = await db
       .collection('statementsSubscribe')
       .where('odot', '==', userId)
       .where('statementId', '==', documentId)
       .where('role', 'in', ['admin', 'creator'])
       .get();

     return !subscription.empty;
   }
   ```

3. Apply to all `/api/admin/*` routes

4. Add audit logging for admin actions

**Files to Create/Modify:**
- [ ] `apps/sign/src/middleware/adminAuth.ts` (new)
- [ ] `apps/sign/app/api/admin/*/route.ts` (modify all)
- [ ] `apps/sign/src/lib/utils/auditLog.ts` (new)

---

### 1.4 Input Sanitization for XSS Prevention

**Problem:** User-generated content (comments, statements) not sanitized.

**Implementation Steps:**

1. Add sanitization library:
   ```bash
   npm install dompurify isomorphic-dompurify
   ```

2. Create sanitization utility:
   ```
   src/utils/sanitization.ts
   ```

3. Apply at data input boundaries:
   - Statement creation
   - Comment creation
   - Description fields

4. Apply at render time for legacy data:
   ```typescript
   import DOMPurify from 'isomorphic-dompurify';

   export function sanitizeHtml(dirty: string): string {
     return DOMPurify.sanitize(dirty, {
       ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
       ALLOWED_ATTR: ['href', 'target'],
     });
   }
   ```

**Files to Create/Modify:**
- [ ] `src/utils/sanitization.ts` (new)
- [ ] `src/controllers/db/statements/setStatement.ts` (modify)
- [ ] `apps/sign/src/lib/utils/sanitization.ts` (new)
- [ ] `apps/mc/src/lib/utils/sanitization.ts` (new)

---

## Phase 2: Test Coverage & Quality

**Timeline: 2-4 weeks**
**Risk Level: Medium (enables safe refactoring)**

### 2.1 Establish Testing Infrastructure

**Problem:** Low test coverage (~30%), missing E2E tests.

**Implementation Steps:**

1. Add Playwright for E2E testing:
   ```bash
   npm install -D @playwright/test
   npx playwright install
   ```

2. Create test structure:
   ```
   tests/
   ├── e2e/
   │   ├── auth.spec.ts
   │   ├── statement-crud.spec.ts
   │   ├── evaluation.spec.ts
   │   └── mc-flow.spec.ts
   ├── integration/
   │   └── firebase/
   └── fixtures/
   ```

3. Add test scripts to package.json:
   ```json
   {
     "test:e2e": "playwright test",
     "test:e2e:ui": "playwright test --ui",
     "test:integration": "jest --config jest.integration.config.js"
   }
   ```

4. Set up CI pipeline for tests

**Files to Create:**
- [ ] `playwright.config.ts` (new)
- [ ] `tests/e2e/auth.spec.ts` (new)
- [ ] `tests/e2e/statement-crud.spec.ts` (new)
- [ ] `.github/workflows/test.yml` (new or modify)

---

### 2.2 Controller Test Coverage

**Target:** 70% coverage for all controllers

**Priority Order:**

1. **Statement Controllers** (highest risk)
   - [ ] `controllers/db/statements/setStatement.ts`
   - [ ] `controllers/db/statements/listenToStatements.ts`
   - [ ] `controllers/db/statements/deleteStatement.ts`

2. **Evaluation Controllers**
   - [ ] `controllers/db/evaluation/setEvaluation.ts`
   - [ ] `controllers/db/evaluation/getEvaluation.ts`

3. **Subscription Controllers**
   - [ ] `controllers/db/subscription/setSubscription.ts`
   - [ ] `controllers/db/subscription/listenToSubscription.ts`

**Test Template:**
```typescript
// controllers/db/statements/__tests__/setStatement.test.ts
describe('setStatement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validation', () => {
    it('should reject statements below minimum length', async () => {});
    it('should reject statements without parentId', async () => {});
  });

  describe('creation', () => {
    it('should create statement with correct timestamps', async () => {});
    it('should set creator from current user', async () => {});
  });

  describe('error handling', () => {
    it('should log error with context on failure', async () => {});
    it('should not create partial data on failure', async () => {});
  });
});
```

**Files to Create:**
- [ ] `src/controllers/db/statements/__tests__/setStatement.test.ts`
- [ ] `src/controllers/db/statements/__tests__/listenToStatements.test.ts`
- [ ] `src/controllers/db/evaluation/__tests__/setEvaluation.test.ts`

---

### 2.3 Functions Test Coverage

**Target:** 80% coverage for Cloud Functions

**Priority Order:**

1. **Consensus Calculation** (business-critical)
   - [ ] `fn_evaluation.ts` - consensus algorithm tests
   - [ ] Edge cases: zero evaluators, extreme values

2. **AI Integration**
   - [ ] `fn_findSimilarStatements.ts`
   - [ ] Mock AI responses, test error handling

3. **Trigger Functions**
   - [ ] `fn_statementCreation.ts`
   - [ ] `fn_subscriptions.ts`

**Files to Create:**
- [ ] `functions/src/__tests__/fn_evaluation.test.ts`
- [ ] `functions/src/__tests__/fn_statementCreation.test.ts`
- [ ] `functions/src/__tests__/consensus-algorithm.test.ts`

---

## Phase 3: Shared Code Consolidation

**Timeline: 4-6 weeks**
**Risk Level: Medium**

### 3.1 Create @freedi/core Package

**Problem:** Firebase queries, utilities duplicated across apps.

**Implementation Steps:**

1. Create new package in monorepo:
   ```
   packages/core/
   ├── src/
   │   ├── firebase/
   │   │   ├── queries/
   │   │   │   ├── statements.ts
   │   │   │   ├── evaluations.ts
   │   │   │   └── subscriptions.ts
   │   │   ├── utils.ts
   │   │   └── index.ts
   │   ├── hooks/
   │   │   ├── useFirebaseQuery.ts
   │   │   └── index.ts
   │   ├── utils/
   │   │   ├── sanitization.ts
   │   │   ├── timestamps.ts
   │   │   └── index.ts
   │   └── index.ts
   ├── package.json
   └── tsconfig.json
   ```

2. Move shared code:
   - Firebase query patterns
   - Timestamp utilities
   - Error handling utilities
   - Sanitization

3. Update imports across apps:
   ```typescript
   // Before
   import { getStatement } from '@/lib/firebase/queries';

   // After
   import { getStatement } from '@freedi/core/firebase';
   ```

4. Add to workspace:
   ```json
   // package.json (root)
   {
     "workspaces": [
       "apps/*",
       "packages/*"
     ]
   }
   ```

**Files to Create:**
- [ ] `packages/core/package.json`
- [ ] `packages/core/tsconfig.json`
- [ ] `packages/core/src/firebase/queries/statements.ts`
- [ ] `packages/core/src/firebase/queries/evaluations.ts`
- [ ] `packages/core/src/utils/index.ts`

---

### 3.2 Standardize Firebase Query Patterns

**Problem:** Each app has slightly different query implementations.

**Implementation Steps:**

1. Define standard query interface:
   ```typescript
   interface QueryOptions {
     limit?: number;
     orderBy?: { field: string; direction: 'asc' | 'desc' };
     where?: WhereClause[];
     startAfter?: DocumentSnapshot;
   }

   interface QueryResult<T> {
     data: T[];
     lastDoc: DocumentSnapshot | null;
     hasMore: boolean;
   }
   ```

2. Create query builders:
   ```typescript
   export function createStatementQuery(
     parentId: string,
     options?: QueryOptions
   ): Query<Statement>

   export async function executeQuery<T>(
     query: Query<T>
   ): Promise<QueryResult<T>>
   ```

3. Add pagination support:
   ```typescript
   export function usePaginatedQuery<T>(
     queryFn: () => Query<T>,
     pageSize: number
   ): {
     data: T[];
     loadMore: () => Promise<void>;
     hasMore: boolean;
     isLoading: boolean;
   }
   ```

**Files to Create:**
- [ ] `packages/core/src/firebase/queryBuilder.ts`
- [ ] `packages/core/src/firebase/pagination.ts`
- [ ] `packages/core/src/hooks/usePaginatedQuery.ts`

---

## Phase 4: Component Architecture

**Timeline: 6-8 weeks**
**Risk Level: Low-Medium**

### 4.1 Break Down God Components

**Problem:** StatementMain.tsx has too many responsibilities.

**Current State:**
```
StatementMain.tsx (500+ lines)
├── Authentication logic
├── Authorization logic
├── Data fetching (5+ hooks)
├── Panel state management
├── Routing logic
├── Error handling
└── Render logic
```

**Target State:**
```
StatementMain.tsx (< 150 lines)
├── StatementProvider (context)
├── StatementHeader/
├── StatementContent/
├── StatementPanels/
└── StatementModals/
```

**Implementation Steps:**

1. Extract context provider:
   ```typescript
   // StatementProvider.tsx
   interface StatementContextValue {
     statement: Statement | null;
     isLoading: boolean;
     error: Error | null;
     permissions: Permissions;
     actions: StatementActions;
   }

   export function StatementProvider({
     statementId,
     children
   }: Props) {
     // All data fetching and state logic here
   }
   ```

2. Create focused sub-components:
   ```
   view/pages/statement/
   ├── StatementMain.tsx          # Composition only
   ├── StatementProvider.tsx      # Data & state
   ├── components/
   │   ├── StatementHeader.tsx
   │   ├── StatementContent.tsx
   │   ├── StatementPanels.tsx
   │   └── StatementModals.tsx
   └── hooks/
       ├── useStatementPermissions.ts
       └── useStatementActions.ts
   ```

3. Migrate incrementally (one sub-component at a time)

**Files to Create/Modify:**
- [ ] `src/view/pages/statement/StatementProvider.tsx` (new)
- [ ] `src/view/pages/statement/components/StatementHeader.tsx` (new)
- [ ] `src/view/pages/statement/components/StatementContent.tsx` (new)
- [ ] `src/view/pages/statement/StatementMain.tsx` (refactor)

---

### 4.2 Complete Atomic Design Migration

**Problem:** Dual component systems create confusion.

**Implementation Steps:**

1. Audit existing components:
   ```
   # Generate component usage report
   grep -r "import.*from.*components/buttons" src/ --include="*.tsx" | wc -l
   grep -r "import.*from.*components/atomic" src/ --include="*.tsx" | wc -l
   ```

2. Create migration checklist:
   - [ ] Button → atomic/atoms/Button
   - [ ] Card components → atomic/molecules/Card
   - [ ] Modal → atomic/molecules/Modal
   - [ ] Form inputs → atomic/atoms/Input

3. Migration strategy:
   - New features: Use atomic only
   - Bug fixes: Migrate if touching component
   - Dedicated sprints: Batch migrate related components

4. Add deprecation warnings:
   ```typescript
   // components/buttons/button/Button.tsx
   /** @deprecated Use @/view/components/atomic/atoms/Button instead */
   export default function Button(props: ButtonProps) {
     console.warn('Button is deprecated. Use atomic Button.');
     return <AtomicButton {...props} />;
   }
   ```

**Files to Modify:**
- [ ] Add deprecation notices to legacy components
- [ ] Update import paths in active development areas
- [ ] Document migration guide in `CLAUDE.md`

---

## Phase 5: Performance & Scalability

**Timeline: 8-12 weeks**
**Risk Level: Medium**

### 5.1 Add Request Caching (React Query)

**Problem:** No caching layer, redundant Firestore reads.

**Implementation Steps:**

1. Install React Query:
   ```bash
   npm install @tanstack/react-query
   ```

2. Set up provider:
   ```typescript
   // src/providers/QueryProvider.tsx
   import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

   const queryClient = new QueryClient({
     defaultOptions: {
       queries: {
         staleTime: 1000 * 60 * 5, // 5 minutes
         gcTime: 1000 * 60 * 30,   // 30 minutes
         retry: 2,
       },
     },
   });
   ```

3. Create query hooks:
   ```typescript
   // hooks/queries/useStatement.ts
   export function useStatement(statementId: string) {
     return useQuery({
       queryKey: ['statement', statementId],
       queryFn: () => getStatement(statementId),
       enabled: !!statementId,
     });
   }
   ```

4. Integrate with Firebase listeners:
   ```typescript
   // Invalidate cache when listener receives update
   queryClient.invalidateQueries({ queryKey: ['statement', statementId] });
   ```

**Files to Create:**
- [ ] `src/providers/QueryProvider.tsx`
- [ ] `src/hooks/queries/useStatement.ts`
- [ ] `src/hooks/queries/useStatements.ts`
- [ ] `src/hooks/queries/useEvaluations.ts`

---

### 5.2 Implement Pagination

**Problem:** Large lists load all data, causing performance issues.

**Implementation Steps:**

1. Add pagination to Redux selectors:
   ```typescript
   interface PaginationState {
     page: number;
     pageSize: number;
     totalCount: number;
   }

   export const selectPaginatedStatements = createSelector(
     [selectAllStatements, selectPagination],
     (statements, pagination) => {
       const start = pagination.page * pagination.pageSize;
       return statements.slice(start, start + pagination.pageSize);
     }
   );
   ```

2. Add to Firebase queries:
   ```typescript
   export async function getStatementsPaginated(
     parentId: string,
     pageSize: number,
     lastDoc?: DocumentSnapshot
   ) {
     let query = db.collection('statements')
       .where('parentId', '==', parentId)
       .orderBy('createdAt', 'desc')
       .limit(pageSize);

     if (lastDoc) {
       query = query.startAfter(lastDoc);
     }

     return query.get();
   }
   ```

3. Implement infinite scroll in UI:
   ```typescript
   function StatementList({ parentId }: Props) {
     const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
       queryKey: ['statements', parentId],
       queryFn: ({ pageParam }) => getStatementsPaginated(parentId, 20, pageParam),
       getNextPageParam: (lastPage) => lastPage.lastDoc,
     });
   }
   ```

**Files to Modify:**
- [ ] `src/redux/statements/statementsSlice.ts`
- [ ] `src/controllers/db/statements/getStatements.ts`
- [ ] `src/view/pages/statement/components/StatementList.tsx`

---

### 5.3 Optimize Heat Map Aggregation (Sign App)

**Problem:** Heat map aggregates on every request.

**Implementation Steps:**

1. Create aggregation cache:
   ```typescript
   // Cache heat map data with 5-minute TTL
   interface CachedHeatMap {
     data: HeatMapData;
     computedAt: number;
     documentId: string;
   }
   ```

2. Use Firestore for cache (serverless-friendly):
   ```typescript
   async function getHeatMapData(docId: string): Promise<HeatMapData> {
     const cacheRef = db.collection('_heatMapCache').doc(docId);
     const cached = await cacheRef.get();

     if (cached.exists && Date.now() - cached.data().computedAt < 300000) {
       return cached.data().data;
     }

     const freshData = await computeHeatMapData(docId);
     await cacheRef.set({ data: freshData, computedAt: Date.now(), documentId: docId });

     return freshData;
   }
   ```

3. Add background refresh via Cloud Function:
   ```typescript
   // Trigger on approval/comment changes
   export const refreshHeatMapCache = onDocumentWritten(
     { document: 'approval/{approvalId}' },
     async (event) => {
       const docId = event.data?.after?.data()?.documentId;
       if (docId) {
         await computeAndCacheHeatMap(docId);
       }
     }
   );
   ```

**Files to Create/Modify:**
- [ ] `apps/sign/src/lib/firebase/heatMapCache.ts` (new)
- [ ] `apps/sign/app/api/heatmap/[docId]/route.ts` (modify)
- [ ] `functions/src/fn_heatMapCache.ts` (new)

---

## Phase 6: State Management Standardization

**Timeline: 12-16 weeks (can be parallel with other phases)**
**Risk Level: Low (recommendation only)**

### 6.1 Evaluate State Management Options

**Current State:**
- Main App: Redux Toolkit
- MC App: React Context
- Sign App: Zustand

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| Keep as-is | No migration work | Inconsistent patterns |
| All Redux | Powerful, mature | Boilerplate heavy |
| All Zustand | Simple, light | Less ecosystem |
| Hybrid (Redux for Main, Zustand for others) | Best of both | Still inconsistent |

**Recommendation:** Document current choices, standardize for new apps only.

**Implementation Steps:**

1. Create state management guide:
   ```markdown
   # State Management Decision Guide

   ## When to use Redux (Main App)
   - Complex state with many reducers
   - Need for middleware (thunks, saga)
   - DevTools debugging critical

   ## When to use Zustand (New Apps)
   - Simpler state needs
   - Faster development
   - Smaller bundle size

   ## When to use React Context
   - Theme/config only
   - Rarely changing state
   ```

2. Add to CLAUDE.md or create separate doc

**Files to Create:**
- [ ] `docs/STATE_MANAGEMENT_GUIDE.md`

---

## Implementation Checklist

### Phase 1: Critical (Weeks 1-2)
- [ ] 1.1 Rate limiting middleware
- [ ] 1.2 Circuit breaker for AI
- [ ] 1.3 Admin route security
- [ ] 1.4 XSS sanitization

### Phase 2: Testing (Weeks 2-6)
- [ ] 2.1 Playwright E2E setup
- [ ] 2.2 Controller test coverage (70%)
- [ ] 2.3 Functions test coverage (80%)

### Phase 3: Shared Code (Weeks 4-10)
- [ ] 3.1 Create @freedi/core package
- [ ] 3.2 Standardize Firebase queries

### Phase 4: Components (Weeks 6-14)
- [ ] 4.1 Break down StatementMain
- [ ] 4.2 Atomic design migration

### Phase 5: Performance (Weeks 8-16)
- [ ] 5.1 React Query integration
- [ ] 5.2 Pagination implementation
- [ ] 5.3 Heat map caching

### Phase 6: Documentation (Ongoing)
- [ ] 6.1 State management guide

---

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Test Coverage | ~30% | 70%+ | Jest coverage report |
| Bundle Size | Unknown | < 200KB | Webpack analyzer |
| Lighthouse Score | Unknown | > 90 | Lighthouse CI |
| Error Rate | Unknown | < 0.1% | Sentry dashboard |
| API Response Time (p95) | Unknown | < 500ms | Firebase monitoring |
| Time to First Contentful Paint | Unknown | < 1.5s | Lighthouse |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking changes during refactor | Feature flags, incremental migration |
| Test coverage gaps | Prioritize critical paths first |
| Team unfamiliarity with new patterns | Documentation, pair programming |
| Scope creep | Strict phase boundaries, defer non-critical items |
| Performance regression | Benchmark before/after each phase |

---

## Review Schedule

- **Weekly:** Phase progress check
- **Bi-weekly:** Code quality metrics review
- **Monthly:** Architecture review with stakeholders
- **Per Phase:** Retrospective and plan adjustment
