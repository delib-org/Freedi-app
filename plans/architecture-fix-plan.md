# Architecture Fix Plan

**Based on**: Architecture Audit (Feb 18, 2026)
**Overall Health**: 3/5 → Target: 4.5/5

---

## Phase 1: CRITICAL Fixes (Week 1)

### Task 1.1: Fix Controller-to-View Dependency Violations
**Agent**: `system-architect` (plan the moves) → `react-firebase-engineer` (execute)

5 files in `controllers/` illegally import from `view/`. This corrupts the architecture boundary.

**Files to fix**:
1. `src/controllers/db/statements/setStatements.ts` (lines 8-9)
   - Move `getExistingOptionColors`, `getSiblingOptionsByParentId` from `src/view/pages/statement/components/vote/statementVoteCont` → `src/controllers/utils/colorUtils.ts`
   - Move `getRandomColor` from `src/view/pages/statement/components/vote/votingColors` → `src/controllers/utils/colorUtils.ts`

2. `src/controllers/general/helpers.ts` (line 9)
   - Move `EnhancedEvaluationThumb` type → `src/types/evaluation.ts` or into `@freedi/shared-types`

3. `src/controllers/db/waitingList/SetWaitingList.tsx`
   - Remove import of `VisuallyHidden` React component from view
   - Either inline the hidden element or use a utility approach

4. `src/controllers/hooks/userDemographic/useInheritedDemographics.ts`
   - Move imported type → `src/types/`

5. `src/controllers/db/userDemographic/getUserDemographic.ts`
   - Move `MemberReviewData` type → `src/types/`

**Verification**: Run `grep -r "from '@/view" src/controllers/` — should return 0 results.

---

### Task 1.2: Add Error Handling to Firebase Functions
**Agent**: `backend-security-engineer`

Firebase Functions has **0% structured error handling** — no `errorHandling.ts` utility exists.

**Steps**:
1. Create `functions/src/utils/errorHandling.ts` with:
   - `AppError`, `DatabaseError`, `ValidationError`, `AuthenticationError`
   - `logError()` with structured context (operation, userId, metadata)
   - `withErrorHandling()` wrapper for cloud functions
   - `getErrorMessage()` safe error extraction
2. Replace all 50 bare `console.error()` calls across 21 files with `logError()`
3. Add error context to every catch block (operation name, relevant IDs)

**Verification**: `grep -r "console.error" functions/src/` — should return 0 results.

---

### Task 1.3: Break Up `surveys.ts` (2,053 lines)
**Agent**: `system-architect` (plan decomposition) → `react-firebase-engineer` (execute)

File: `apps/mass-consensus/src/lib/firebase/surveys.ts`

**Proposed split**:
```
apps/mass-consensus/src/lib/firebase/
├── surveys/
│   ├── index.ts              # Re-exports (barrel file)
│   ├── surveyCrud.ts         # Create, read, update, delete operations
│   ├── surveyQueries.ts      # Complex queries and filters
│   ├── surveyExport.ts       # Export/download functionality
│   ├── surveyProgress.ts     # Progress tracking, completion logic
│   ├── surveyDemographics.ts # Demographic-related queries
│   └── surveyHelpers.ts      # Shared utilities
```

**Verification**: Each file < 300 lines. All existing imports still resolve. MC app builds successfully.

---

## Phase 2: HIGH Priority (Week 2)

### Task 2.1: Create `@freedi/shared-utils` Package
**Agent**: `system-architect` (plan) → `backend-security-engineer` (implement)

Error handling is copy-pasted across 3 apps. Firebase init is tripled too.

**Steps**:
1. Create `packages/shared-utils/` with:
   ```
   packages/shared-utils/
   ├── package.json
   ├── tsconfig.json
   ├── src/
   │   ├── index.ts
   │   ├── errorHandling.ts      # Unified error handling
   │   ├── errorTypes.ts         # AppError, DatabaseError, etc.
   │   ├── logger.ts             # Structured logging
   │   └── constants.ts          # Shared constants
   ```
2. Consolidate error handling from:
   - `src/utils/errorHandling.ts`
   - `apps/sign/src/lib/utils/errorHandling.ts`
   - `apps/mass-consensus/src/lib/utils/errorHandling.ts`
3. Support Sentry integration as optional (MC app uses it)
4. Update all 3 apps + functions to import from `@freedi/shared-utils`
5. Delete the 3 duplicated files

**Verification**: `npm run check-all` passes across all apps. No duplicated error handling files remain.

---

### Task 2.2: Migrate Firebase Operations to Utilities
**Agent**: `react-firebase-engineer`

76 direct `doc(FireStore, ...)` calls need migration to utility functions.

**Priority files** (most violations):
1. `src/controllers/db/statements/setStatements.ts` — 15 direct refs
2. `src/controllers/db/evaluation/setEvaluation.ts`
3. `src/controllers/db/subscriptions/setSubscriptions.ts`
4. `src/controllers/db/vote/setVote.ts`
5. `src/controllers/db/statements/listenToStatements.ts`
6. All remaining 24 files

**Pattern**:
```typescript
// BEFORE
const ref = doc(FireStore, Collections.statements, statementId);

// AFTER
const ref = createStatementRef(statementId);
// or
const ref = createDocRef(Collections.statements, statementId);
```

**Verification**: `grep -r "doc(FireStore" src/controllers/` — should return 0 results.

---

### Task 2.3: Fix Timestamp Violations
**Agent**: `react-firebase-engineer` (client) + `backend-security-engineer` (functions)

Replace `FieldValue.serverTimestamp()` and `Timestamp.now()` with `Date.now()`.

**Client-side files** (5):
- `src/controllers/db/statements/setStatements.ts`
- `src/controllers/db/vote/setVote.ts`
- `src/controllers/db/subscriptions/setSubscriptions.ts`
- `src/controllers/db/online/setOnline.ts`
- `src/controllers/db/evaluation/setEvaluation.ts`

**Functions files** (3):
- `functions/src/fn_syncParagraphsToDescription.ts`
- `functions/src/fn_updateOfficialParagraphText.ts`
- `functions/src/fn_handleVotingDeadline.ts`

**Pattern**:
```typescript
// BEFORE
createdAt: FieldValue.serverTimestamp()

// AFTER
createdAt: Date.now()
```

**Verification**: `grep -r "serverTimestamp\|Timestamp.now()" src/ functions/src/` — should return 0 results.

---

### Task 2.4: Remove Debug PNGs from Git
**Agent**: `Bash` (direct commands)

44 debug screenshots (~2.5MB) are tracked in git.

**Steps**:
1. Add to `.gitignore`:
   ```
   # Debug screenshots
   *.png
   !public/**/*.png
   !src/assets/**/*.png
   !apps/**/public/**/*.png
   ```
2. Remove tracked files:
   ```bash
   git rm --cached *.png e2e-screenshots/*.png .playwright-mcp/*.png
   git rm --cached stats.html
   ```
3. Move useful docs screenshots to `docs/images/` if needed
4. Commit cleanup

**Verification**: `git ls-files "*.png" | grep -v public | grep -v assets` — should return 0.

---

### Task 2.5: Break Up `fn_evaluation.ts` (1,491 lines)
**Agent**: `backend-security-engineer`

File: `functions/src/fn_evaluation.ts`

**Proposed split**:
```
functions/src/evaluation/
├── index.ts                    # Re-exports
├── onCreateEvaluation.ts       # onCreate trigger
├── onUpdateEvaluation.ts       # onUpdate trigger
├── onDeleteEvaluation.ts       # onDelete trigger
├── updateChosenOptions.ts      # Complex option selection logic
├── evaluationHelpers.ts        # Shared calculations
```

**Verification**: Each file < 300 lines. `npm run build` in functions passes. Deploy test succeeds.

---

## Phase 3: MEDIUM Priority (Weeks 3-4)

### Task 3.1: Convert `console.error()` to `logError()` in Main App
**Agent**: `react-firebase-engineer` (batch processing)

499 bare `console.error()` calls across 161 files.

**Approach**: Process in batches by directory:
1. `src/controllers/db/` (highest priority — ~120 calls)
2. `src/controllers/hooks/` (~40 calls)
3. `src/services/` (~30 calls)
4. `src/view/pages/` (~200 calls)
5. `src/view/components/` (~100 calls)

**For each file**:
- Replace `console.error(error)` with `logError(error, { operation: 'module.function', ...ids })`
- Add import for `logError` from `@/utils/errorHandling`
- Add meaningful operation names and relevant IDs to context

**Verification**: `grep -r "console.error" src/ --include="*.ts" --include="*.tsx" | wc -l` — should be 0.

---

### Task 3.2: Break Up Large Component Files
**Agent**: `system-architect` (plan) → `react-firebase-engineer` (execute) → `scss-architect` (styles)

| File | Lines | Action |
|------|-------|--------|
| `EnhancedAdvancedSettings.tsx` | 1,027 | Split into sub-settings components |
| `setStatements.ts` | 815 | Split by operation type (create/update/delete) |
| `EnhancedMindMapService.ts` | 721 | Extract layout, rendering, interaction modules |
| `OfflineManager.ts` | 707 | Extract sync, queue, conflict resolution |
| `QuestionSettings.tsx` | 639 | Extract sub-sections into components |
| `EnhancedMindMap.tsx` | 601 | Extract toolbar, canvas, node components |

**Verification**: No file > 500 lines. All imports resolve. Build passes.

---

### Task 3.3: Add DOMPurify to Main App XSS Prevention
**Agent**: `backend-security-engineer`

File: `src/view/components/richTextEditor/ParagraphsDisplay.tsx`
Uses `dangerouslySetInnerHTML` without sanitization.

**Steps**:
1. Install DOMPurify if not already in dependencies
2. Import and apply before `dangerouslySetInnerHTML`:
   ```typescript
   import DOMPurify from 'dompurify';
   // ...
   dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
   ```
3. Check for other `dangerouslySetInnerHTML` usages in main app
4. Verify MC app's `QuestionTextEditor.tsx` also sanitizes

**Verification**: `grep -r "dangerouslySetInnerHTML" src/` — every usage has DOMPurify.

---

### Task 3.4: Adopt or Remove Selector Factories
**Agent**: `react-firebase-engineer`

Selector factories at `src/redux/utils/selectorFactories.ts` are used by only 1 file. Either adopt widely or remove.

**Recommended**: Adopt — replace 12 raw `createSelector` usages:
1. Audit all files using `createSelector` directly
2. For each, check if a factory already covers the pattern
3. Replace with factory calls where applicable
4. Add new factories if patterns are common but uncovered

**Verification**: `grep -r "createSelector" src/ --include="*.ts"` — only in `selectorFactories.ts`.

---

### Task 3.5: Fix Circular Dependencies
**Agent**: `system-architect`

7 circular dependency chains detected.

**Known cycles**:
1. `store.ts` ↔ `evaluationsSlice.ts` ↔ `types.ts` — Fix: move types to a separate non-importing file
2. `MemberValidation` ↔ `MemberReviewList` — Fix: extract shared types
3. `shared-types`: `StatementTypes.d.ts` ↔ `Results.d.ts` — Fix: merge or reorder exports
4. `shared-types`: `index.d.ts` ↔ `StatementSnapShot.d.ts` — Fix: barrel export ordering

**Steps**:
1. Run `npx madge --circular src/` to get full list
2. For each cycle, identify the shared type/function causing it
3. Extract to a new file that doesn't import back

**Verification**: `npx madge --circular src/` — should return 0 cycles.

---

### Task 3.6: Fix Error Handling in Sign App & MC App
**Agent**: `react-firebase-engineer`

**Sign App**: 50 bare `console.error()` despite having `logError()`. Worst: `DemographicSettings.tsx` (11).
**MC App**: 68 bare `console.error()` with only 32 `logError()`. Worst: several components.

Same approach as Task 3.1 but for sub-apps.

---

## Phase 4: LOW Priority (Weeks 5-6)

### Task 4.1: Clean Up Orphaned & Misspelled Files
**Agent**: `Bash` (direct commands)

| File | Issue | Action |
|------|-------|--------|
| `src/ShareButton.tsx` | Empty (0 bytes) | Delete |
| `src/controllers/hooks/useAutoFocus .ts` | Space in filename | Rename to `useAutoFocus.ts` |
| `src/controllers/hooks/useWindowDimentions.ts` | Typo | Rename to `useWindowDimensions.ts` + update imports |
| `src/view/components/approveMemebers/` | Typo | Rename to `approveMembers/` + update imports |
| `functions/fn_notifications.backup.ts` | Backup file | Delete |
| `vite.dev.config.ts` | Empty | Delete |

**Verification**: Build passes. No broken imports.

---

### Task 4.2: Consolidate Hook Directories
**Agent**: `react-firebase-engineer`

Hooks split across `src/hooks/` (3 files) and `src/controllers/hooks/` (30 files).

**Decision**: Move everything to `src/hooks/` (standard React convention) or keep in `src/controllers/hooks/` (current majority).

**Steps**:
1. Pick one location
2. Move files
3. Update all imports
4. Delete empty directory

---

### Task 4.3: Merge `model/` and `models/` Directories
**Agent**: `react-firebase-engineer`

Two directories with similar purpose:
- `src/model/`
- `src/models/`

**Steps**:
1. Audit contents of both
2. Merge into single `src/models/`
3. Update all imports

---

### Task 4.4: Move Shell Scripts to `scripts/`
**Agent**: `Bash`

Move from repo root to `scripts/`:
- `analyze-functions.sh`
- `convert-to-modules.sh`
- `update-delib-npm.sh`

---

### Task 4.5: Improve Test Coverage
**Agent**: `qa-test-architect`

Current state:
| App | Test Files | Source Files | Ratio |
|-----|-----------|-------------|-------|
| Main | 44 | ~599 | 7.3% |
| Sign | 19 | ~200 | 9.5% |
| MC | 18 | ~150 | 12% |
| Functions | 8 | 88 | 9% |

**Priority test targets**:
1. `src/utils/` — all utility functions (target 80%+)
2. `src/controllers/db/` — all Firebase operations
3. `src/redux/` — all reducers and selectors
4. `functions/src/` — all cloud function handlers

**Agent workflow**: For each module:
1. `qa-test-architect` to design test plan
2. `react-firebase-engineer` or `backend-security-engineer` to write tests
3. `qa-code-auditor` to verify coverage

---

### Task 4.6: Expand Atomic Design System
**Agent**: `scss-architect` (styles) + `react-firebase-engineer` (components) + `ux-ui-architect` (design review)

Currently: 3 atoms, 4 molecules vs 60+ legacy components.

**Approach**: Don't migrate all at once. Instead:
1. Identify the 10 most-reused legacy components
2. Create atomic equivalents
3. Use in all new features
4. Gradually migrate existing usages during feature work

---

### Task 4.7: Standardize Redux Slice Naming
**Agent**: `react-firebase-engineer`

Mixed naming: `statementsSlicer.reducer` vs `creatorReducer` vs `pwaReducer`.

**Steps**:
1. Rename all to consistent pattern: `{domain}Slice` (e.g., `statementsSlice`, `evaluationsSlice`)
2. Export consistently: `export default slice.reducer` + named export for actions

---

## Phase 5: SOLID & Clean Architecture (Weeks 7-10)

> **Current SOLID Scores**: SRP 2/5, OCP 2.5/5, LSP 3.5/5, ISP 2/5, DIP 1.5/5
> **Clean Architecture Score**: 2/5
> **Target**: All principles ≥ 3.5/5, Clean Architecture ≥ 3.5/5

### Task 5.1: Introduce Repository Pattern (DIP — highest leverage)
**Agent**: `system-architect` (design interfaces) → `react-firebase-engineer` (implement)
**SOLID**: DIP (1.5 → 3.5), SRP (improves controller focus)

Currently there is **zero abstraction** over Firebase. 64 raw `doc(FireStore, ...)` calls in controllers + 10+ in View components. Swapping the database = rewriting everything.

**Steps**:
1. Define repository interfaces in `src/repositories/`:
   ```
   src/repositories/
   ├── IStatementRepository.ts
   ├── IEvaluationRepository.ts
   ├── ISubscriptionRepository.ts
   ├── IVoteRepository.ts
   ├── INotificationRepository.ts
   └── firebase/
       ├── FirebaseStatementRepository.ts
       ├── FirebaseEvaluationRepository.ts
       ├── FirebaseSubscriptionRepository.ts
       ├── FirebaseVoteRepository.ts
       └── FirebaseNotificationRepository.ts
   ```
2. Each interface defines domain operations (not Firebase operations):
   ```typescript
   interface IStatementRepository {
       getById(id: string): Promise<Statement | undefined>;
       save(statement: Statement): Promise<void>;
       update(id: string, fields: Partial<Statement>): Promise<void>;
       delete(id: string): Promise<void>;
       getChildrenByParent(parentId: string): Promise<Statement[]>;
       listenToChildren(parentId: string, cb: (stmts: Statement[]) => void): Unsubscribe;
   }
   ```
3. Firebase implementations use existing `firebaseUtils.ts` (finally giving it real consumers)
4. Controllers receive repositories as parameters or via a simple service locator
5. Migrate controllers one domain at a time: statements → evaluations → votes → subscriptions

**Verification**: No controller file imports `firebase/firestore` directly. All Firestore access goes through repository implementations.

---

### Task 5.2: Extract Firebase from View Components (DIP)
**Agent**: `react-firebase-engineer`
**SOLID**: DIP, SRP

10+ View components directly import and call Firebase SDK. No View file should know Firebase exists.

**Files with direct Firestore access in View layer**:
1. `src/view/pages/statement/components/settings/components/advancedSettings/EnhancedAdvancedSettings.tsx`
   - 5 raw `doc()` + `setDoc()` calls (lines 227-253)
2. `src/view/pages/statement/components/settings/components/advancedSettings/AdvancedSettings.tsx`
   - 4 raw Firestore calls
3. `src/view/pages/statement/components/settings/components/advancedSettings/ImprovedSettings.tsx`
   - 1 raw Firestore call
4. `src/view/pages/statement/components/settings/MembersSettings.tsx`
   - Firestore `query()`/`getDocs()` directly
5. Notification components (5 files)
   - `getAuth()`/`getDoc()` directly

**Pattern for each**:
```typescript
// BEFORE (in View component)
import { doc, setDoc } from 'firebase/firestore';
function handleHideChange(newValue: boolean) {
    const ref = doc(FireStore, Collections.statements, statement.statementId);
    setDoc(ref, { hide: newValue }, { merge: true });
}

// AFTER (View calls controller, controller calls repository)
import { updateStatementVisibility } from '@/controllers/db/statements/statementVisibility';
function handleHideChange(newValue: boolean) {
    updateStatementVisibility(statement.statementId, newValue);
}
```

**Verification**: `grep -r "from 'firebase/firestore'" src/view/` — should return 0 results.

---

### Task 5.3: Decouple Controllers from Redux Store (DIP)
**Agent**: `system-architect` (plan pattern) → `react-firebase-engineer` (execute)
**SOLID**: DIP, SRP (controllers stop being Redux dispatchers)

60+ `store.getState()` and `store.dispatch()` calls directly in controller files. Controllers should receive dependencies, not reach into global singletons.

**Current pattern** (tightly coupled):
```typescript
// setStatements.ts
import store from '@/redux/store';
const storeState = store.getState();
const creator = storeState.creator?.creator;
// ...
store.dispatch(incrementOptionsCreated());
```

**Target pattern** (dependency injected):
```typescript
// Option A: Pass as parameters
export async function createStatement(
    input: CreateStatementInput,
    context: { creator: Creator; dispatch: AppDispatch }
): Promise<Statement> { ... }

// Option B: Use a thin context hook (for hooks that call controllers)
const { creator } = useCreatorContext();
const dispatch = useAppDispatch();
await createStatement(input, { creator, dispatch });
```

**Approach**:
1. Audit all 60+ `store.getState()`/`store.dispatch()` call sites
2. Group by pattern (reading creator, reading user, dispatching actions)
3. For each controller function, add explicit parameters for what it needs
4. Update all call sites (mostly in hooks and components) to pass the context
5. Remove direct `store` import from controllers

**Verification**: `grep -r "store.getState\|store.dispatch" src/controllers/` — should return 0 results.

---

### Task 5.4: Decompose the Statement God Object (ISP)
**Agent**: `system-architect` (design types) → `react-firebase-engineer` (main app) → `backend-security-engineer` (functions)
**SOLID**: ISP (2 → 3.5)

The `Statement` type is 166 lines with ~75 fields. Every consumer depends on fields they never use. UI state is leaked into the domain type.

**Proposed decomposition**:
```typescript
// packages/shared-types/src/models/statement/

// Core — what every consumer needs (~20 fields)
interface StatementCore {
    statementId: string;
    statement: string;
    description: string;
    statementType: StatementType;
    parentId: string;
    topParentId: string;
    creatorId: string;
    creator: Creator;
    createdAt: number;
    lastUpdate: number;
    lastChildUpdate: number;
    consensus: number;
    results?: Results[];
    resultsSettings?: ResultsSettings;
    statementSettings?: StatementSettings;
    membership?: Membership;
    maxConsensus?: number;
    totalSubStatements?: number;
}

// Sign-app extensions
interface SignDocumentFields {
    doc?: DocumentFields;
    documentApproval?: number;
    documentImportance?: number;
    documentAgree?: number;
    isDocument?: boolean;
    versionControl?: VersionControl;
}

// Evaluation extensions
interface EvaluationFields {
    evaluation?: Evaluation;
    evaluationSettings?: EvaluationSettings;
    evaluationType?: EvaluationType;
}

// Voting extensions
interface VotingFields {
    selections?: Selection[];
    voted?: number;
    topVotedOption?: string;
}

// MC-specific
interface MassConsensusFields {
    massMembers?: number;
    isCluster?: boolean;
    integratedOptions?: string[];
}

// Composed types per app
type Statement = StatementCore & SignDocumentFields & EvaluationFields & VotingFields & MassConsensusFields & ...;
type SignStatement = StatementCore & SignDocumentFields;
type MCStatement = StatementCore & MassConsensusFields & VotingFields;
```

**Critical**: Remove UI state from domain type:
- `elementHight` (typo) → move to Redux UI slice or component state
- `top` → move to Redux UI slice
- `order` → keep (this is domain data for ordering)
- `isInMultiStage` → move to Redux UI slice
- `selected` → move to component state

**Steps**:
1. Design the decomposition in `shared-types`
2. Create the sub-interfaces
3. Keep `Statement` as the full intersection type for backward compatibility
4. Gradually narrow type usage in each app (e.g., Sign app uses `SignStatement`)
5. Move UI state fields to appropriate Redux slices

**Verification**: `StatementCore` has ≤ 25 fields. Each app imports only the composed type it needs. Build passes across all apps.

---

### Task 5.5: Split God Files by Responsibility (SRP)
**Agent**: `system-architect` (plan splits) → `react-firebase-engineer` (execute)
**SOLID**: SRP (2 → 3.5)

Beyond the file size fixes in Phase 3, this task focuses on **responsibility separation**.

**`setStatements.ts` (815 lines, 15 responsibilities) → 5 files**:
```
src/controllers/db/statements/
├── createStatement.ts          # Factory: createStatement(), getDefaultStatement()
├── writeStatement.ts           # Persistence: setStatementToDB(), saveStatementToDB()
├── updateStatementFields.ts    # Mutations: updateStatementText(), updateStatementParagraphs(),
│                               #   updateStatementMainImage(), updateStatementImageDisplayMode()
├── statementVisibility.ts      # Visibility: toggleStatementHide(), toggleStatementAnchored(),
│                               #   setFollowMeDB(), setPowerFollowMeDB()
├── statementOrdering.ts        # Ordering: updateStatementsOrderToDB(), setRoomSizeInStatementDB(),
│                               #   setStatementGroupToDB()
```

**`helpers.ts` (411 lines, 10+ concerns) → 5 files**:
```
src/controllers/general/
├── authorization.ts            # isAuthorized(), isAdmin(), isUserCreator()
├── formatting.ts               # getInitials(), getFirstName(), truncateString(), getTime()
├── statementDisplay.ts         # statementTitleToDisplay(), getTitle(), getDescription()
├── typeHierarchy.ts            # TYPE_RESTRICTIONS, isStatementTypeAllowedAsChildren()
├── colors.ts                   # getRandomColor(), generateRandomLightColor(), getPastelColor()
```

**`EnhancedAdvancedSettings.tsx` (1,027 lines) → 6 components**:
```
src/view/pages/statement/components/settings/components/advancedSettings/
├── EnhancedAdvancedSettings.tsx  # Shell: renders sub-sections (~100 lines)
├── VisibilitySettings.tsx        # hide/anchor/follow-me
├── EvaluationSettings.tsx        # evaluation type, vote limits, recalculation
├── ExportSettings.tsx            # data export, privacy export
├── LocalizationSettings.tsx      # language, forced localization
├── DocumentModeSettings.tsx      # document mode toggling
```

**`statementsSlice.ts` (499 lines, 5 concerns) → 3 slices**:
```
src/redux/
├── statements/statementsSlice.ts      # Statement entities only
├── subscriptions/subscriptionsSlice.ts # Subscription management (extracted)
├── membership/membershipSlice.ts       # Membership tracking (extracted)
```
Move `screen` state to a UI slice. Remove `elementHight`/`top` from Redux entirely.

**Verification**: No file > 300 lines. Each file has a single clear responsibility. All imports resolve. Build passes.

---

### Task 5.6: Replace Switch Chains with Registries (OCP)
**Agent**: `react-firebase-engineer`
**SOLID**: OCP (2.5 → 3.5)

Switch statements that grow every time a new type is added. Replace with data-driven registries.

**Evaluation type routing** (`Evaluation.tsx` lines 32-59):
```typescript
// BEFORE — must modify for every new type
switch (evaluationType) {
    case 'single-like': return <SingleLikeEvaluation />;
    case 'range': return <EnhancedEvaluation />;
    // ... grows with each new type
}

// AFTER — open for extension, closed for modification
const EVALUATION_REGISTRY: Record<EvaluationType, FC<EvalProps>> = {
    'single-like': SingleLikeEvaluation,
    'range': EnhancedEvaluation,
    'community-voice': CommunityVoiceEvaluation,
    'like-dislike': SimpleEvaluation,
};

const EvalComponent = EVALUATION_REGISTRY[evaluationType] ?? SimpleEvaluation;
return <EvalComponent {...props} />;
```

**Screen routing** (`SwitchScreen.tsx` lines 86-155):
```typescript
// AFTER
const SCREEN_REGISTRY: Record<StatementScreen, FC<ScreenProps>> = {
    [StatementScreen.vote]: VoteScreen,
    [StatementScreen.chat]: ChatScreen,
    [StatementScreen.settings]: SettingsScreen,
    // ...
};
```

**Sort strategies** (`statementVoteCont.ts` lines 24-58):
```typescript
// AFTER
const SORT_STRATEGIES: Record<SortType, (a: Statement, b: Statement) => number> = {
    [SortType.newest]: (a, b) => b.createdAt - a.createdAt,
    [SortType.random]: () => Math.random() - 0.5,
    [SortType.accepted]: (a, b) => (b.consensus ?? 0) - (a.consensus ?? 0),
};
```

**EvaluationUI mapping** (`setStatements.ts` lines 368-379):
```typescript
// AFTER
const STAGE_TO_UI: Record<StageSelectionType, EvaluationUI> = {
    [StageSelectionType.consensus]: EvaluationUI.suggestions,
    [StageSelectionType.voting]: EvaluationUI.voting,
    [StageSelectionType.checkbox]: EvaluationUI.checkbox,
};
```

**Verification**: `grep -rn "switch.*evaluationType\|switch.*screen\|switch.*sort" src/` — should return 0 results for the migrated patterns.

---

### Task 5.7: Fix LSP Violations and Type Safety Hacks
**Agent**: `react-firebase-engineer`
**SOLID**: LSP (3.5 → 4.5)

**`@ts-ignore` in `listenToStatements.ts:69`**:
```typescript
// BEFORE — silently mutates type at runtime
//@ts-ignore
if (role === 'statement-creator') {
    statementSubscription.role = Role.admin;
}

// AFTER — proper migration function
function migrateRole(role: string): Role {
    const LEGACY_ROLE_MAP: Record<string, Role> = {
        'statement-creator': Role.admin,
    };
    return LEGACY_ROLE_MAP[role] ?? (role as Role);
}
statementSubscription.role = migrateRole(role);
```

**Tighten component prop contracts**:
- `SuggestionCard` accepts `Statement | undefined` then early-returns on `undefined`
- Parent should guarantee non-null — remove `undefined` from prop type
- Audit other components with similar patterns

**Verification**: `grep -r "@ts-ignore\|@ts-expect-error" src/` — should return 0 for the fixed patterns.

---

### Task 5.8: Establish Domain Layer (Clean Architecture)
**Agent**: `system-architect` (design) → `react-firebase-engineer` (implement)
**Clean Architecture**: Entities layer (1.5 → 3)

Currently there is **no domain layer**. Business logic is scattered across controllers, Redux reducers, view components, and shared-types. The `Statement` type is an anemic data structure with zero behavior.

**Steps**:
1. Create `src/domain/` directory:
   ```
   src/domain/
   ├── statement/
   │   ├── StatementEntity.ts       # Domain logic methods
   │   ├── StatementFactory.ts      # Creation with validation
   │   └── StatementRules.ts        # Business rules (type hierarchy, permissions)
   ├── evaluation/
   │   ├── EvaluationEntity.ts
   │   └── ConsensusCalculator.ts
   └── vote/
       └── VoteRules.ts
   ```

2. Move business logic from scattered locations into domain:
   ```typescript
   // src/domain/statement/StatementRules.ts
   export function canAddChild(parent: Statement, childType: StatementType): boolean {
       // Moved from helpers.ts isStatementTypeAllowedAsChildren()
   }

   export function calculateConsensus(evaluations: Evaluation[]): number {
       // Moved from fn_evaluation.ts consensus calculation
   }
   ```

3. Domain layer has **zero imports** from React, Firebase, Redux — pure TypeScript only
4. Controllers become orchestrators that call domain logic + repositories
5. Shared domain logic can later be extracted to a `@freedi/domain` package

**Verification**: `src/domain/` has zero imports from `firebase`, `react`, `@reduxjs`. All business rules have unit tests. Build passes.

---

## Phase 6: Ongoing Maintenance

### Task 6.1: Set Up Automated Enforcement
**Agent**: `backend-security-engineer`

Add ESLint rules and CI checks to prevent regressions:
1. **No `console.error`** — custom ESLint rule requiring `logError()`
2. **No direct Firebase refs** — custom rule banning `doc(FireStore,`
3. **No `any` type** — already enforced, ensure it stays
4. **File size limit** — warn on files > 300 lines, error on > 500
5. **No controller-to-view imports** — dependency direction lint rule
6. **No view-to-Firebase imports** — ban `firebase/firestore` in `src/view/`
7. **No `store.getState/dispatch` in controllers** — enforce DIP
8. **Circular dependency check** — `madge --circular` in CI
9. **Registry pattern enforcement** — warn on new switch statements matching known patterns

---

## Execution Summary

| Phase | Tasks | Duration | Key Agents | SOLID Focus |
|-------|-------|----------|------------|-------------|
| 1 - Critical | 3 tasks | Week 1 | system-architect, backend-security-engineer, react-firebase-engineer | — |
| 2 - High | 5 tasks | Week 2 | system-architect, backend-security-engineer, react-firebase-engineer, Bash | — |
| 3 - Medium | 6 tasks | Weeks 3-4 | react-firebase-engineer, backend-security-engineer, system-architect, scss-architect | — |
| 4 - Low | 7 tasks | Weeks 5-6 | react-firebase-engineer, Bash, qa-test-architect, scss-architect, ux-ui-architect | — |
| **5 - SOLID/Clean** | **8 tasks** | **Weeks 7-10** | **system-architect, react-firebase-engineer, backend-security-engineer** | **DIP, ISP, SRP, OCP, LSP** |
| 6 - Ongoing | 1 task | Continuous | backend-security-engineer | Enforcement |

**Total**: 30 tasks across ~10 weeks

### SOLID Score Targets

| Principle | Before | After Phase 5 | Target |
|-----------|--------|---------------|--------|
| SRP | 2/5 | 3.5/5 | Tasks 5.5, 5.8 |
| OCP | 2.5/5 | 3.5/5 | Task 5.6 |
| LSP | 3.5/5 | 4.5/5 | Task 5.7 |
| ISP | 2/5 | 3.5/5 | Task 5.4 |
| DIP | 1.5/5 | 3.5/5 | Tasks 5.1, 5.2, 5.3 |
| Clean Arch | 2/5 | 3.5/5 | Tasks 5.1, 5.8 |

### Agent Usage Summary

| Agent | Tasks | Purpose |
|-------|-------|---------|
| `system-architect` | 1.1, 1.3, 3.2, 3.5, 5.1, 5.3, 5.4, 5.5, 5.8 | Architecture decisions, SOLID design, decomposition |
| `backend-security-engineer` | 1.2, 2.1, 2.5, 3.3, 5.4, 6.1 | Functions, security, shared packages, enforcement |
| `react-firebase-engineer` | 1.1, 2.2, 2.3, 3.1, 3.2, 3.4, 3.6, 4.2, 4.3, 4.6, 4.7, 5.1, 5.2, 5.3, 5.5, 5.6, 5.7, 5.8 | React/Redux/Firebase code changes, SOLID refactoring |
| `scss-architect` | 3.2, 4.6 | Style refactoring, atomic design |
| `qa-test-architect` | 4.5 | Test planning and execution |
| `qa-code-auditor` | Post-phase reviews | Quality verification after each phase |
| `ux-ui-architect` | 4.6 | Design system expansion |
| `Bash` | 2.4, 4.1, 4.4 | Git operations, file cleanup |
