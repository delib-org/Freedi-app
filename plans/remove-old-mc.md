# Plan: Remove Old Mass Consensus (MC) Code from Main App

## Overview
Remove the old Mass Consensus code from the main Freedi app since a new standalone MC app exists at `apps/mass-consensus`. Keep settings that control the new MC app.

## Key Decisions
- **Keep Anchored Sampling settings** in QuestionSettings (used by new MC)
- **Remove Question Type toggle** (Simple vs Mass Consensus) - no longer needed
- **Keep "Request solution at start" toggle** - controls new MC behavior
- Add note explaining these settings control the new MC app

---

## Scope of Removal

### Primary Directories to Delete (Complete Removal)
1. `src/view/pages/massConsensus/` - All MC page components (~29 files)
2. `src/redux/massConsensus/` - Redux slice and API (3 files)
3. `src/controllers/db/massConsensus/` - Database controllers (4 files)
4. `src/view/components/massConsensus/` - Shared MC components (5 files)
5. `src/model/massConsensus/` - Data models (1 file)
6. `src/contexts/massConsensus/` - React contexts (1 file)
7. `src/view/pages/statement/components/settings/components/massConsensusSettings/` - Settings UI (10+ files)
8. `src/routes/massConsensusRoutes.tsx` - Route definitions
9. `src/hooks/useMassConsensusAnalytics.ts` - Analytics hook

### Files Requiring Modification

#### `src/view/pages/statement/components/settings/components/QuestionSettings/QuestionSettings.tsx`
**Critical modifications:**
- Remove Question Type toggle (lines 309-321) that switches between Simple/Mass Consensus
- Keep "Request solution at start" toggle (askUserForASolutionBeforeEvaluation) - remove the `{isMassConsensus && ...}` wrapper so it shows unconditionally
- Keep Anchored Sampling settings - remove the `{isMassConsensus && ...}` wrapper so they show unconditionally
- Add section header/note: "New Mass Consensus Settings" explaining these control the new MC app
- Remove import for `AddMassConsensusIcon` (line 23)

#### `src/view/pages/statement/components/settings/StatementSettings.tsx`
- Remove import of `MassConsensusSettings` (line 23)
- Remove `{isMassConsensus && <MassConsensusSettings />}` (line 130)
- Remove `isMassConsensus` variable (line 111)
- Remove `QuestionType` import if no longer used

#### `src/routes/router.tsx`
- Remove all MC route imports
- Remove `massConsensusRoutes` from router configuration

#### `src/redux/store.ts`
- Remove `massConsensusSlice.reducer` import and registration
- Remove `massConsensusApi.reducer` and middleware

### Assets to Remove
- `src/assets/icons/massConsensusIcon.svg`
- `src/assets/icons/massQuestionsIcon.svg`

### Other Files to Clean Up
- Any navigation/button components with MC references
- Analytics service MC references
- `src/utils/consensusColors.ts` - can be removed (duplicated in new MC app)

---

## Implementation Steps

### Phase 1: Delete Core MC Directories
```bash
rm -rf src/view/pages/massConsensus/
rm -rf src/redux/massConsensus/
rm -rf src/controllers/db/massConsensus/
rm -rf src/view/components/massConsensus/
rm -rf src/model/massConsensus/
rm -rf src/contexts/massConsensus/
rm -rf src/view/pages/statement/components/settings/components/massConsensusSettings/
rm src/routes/massConsensusRoutes.tsx
rm src/hooks/useMassConsensusAnalytics.ts
```

### Phase 2: Update QuestionSettings.tsx
1. Remove Question Type toggle (lines 309-321)
2. Remove `{isMassConsensus && (...)}` wrapper around "Request solution at start" toggle
3. Remove `{isMassConsensus && (...)}` wrapper around Anchored Sampling settings
4. Add section header: "New Mass Consensus Settings" with explanation note
5. Remove unused imports (`AddMassConsensusIcon`, `QuestionType` if not needed elsewhere)

### Phase 3: Update StatementSettings.tsx
1. Remove `MassConsensusSettings` import
2. Remove `isMassConsensus` variable
3. Remove `{isMassConsensus && <MassConsensusSettings />}`
4. Clean up `QuestionType` import if unused

### Phase 4: Update Redux Store
1. Remove MC slice imports from `src/redux/store.ts`
2. Remove MC reducer registrations
3. Remove MC API middleware

### Phase 5: Update Router
1. Remove all MC page component imports from `src/routes/router.tsx`
2. Remove MC routes from router configuration

### Phase 6: Clean Up Remaining References
1. Search for remaining `massConsensus` imports/references
2. Remove MC references from navigation/button components
3. Remove MC analytics references
4. Delete `src/assets/icons/massConsensusIcon.svg`
5. Delete `src/assets/icons/massQuestionsIcon.svg`
6. Optionally remove `src/utils/consensusColors.ts`

### Phase 7: Verification
1. Run `npm run typecheck` to find broken imports
2. Run `npm run lint` to check for issues
3. Run `npm run build` to verify compilation
4. Run tests to ensure no regressions

---

## Estimated Impact
- ~113 files affected
- ~3000+ lines of code to remove
- Significant reduction in main app bundle size
- QuestionSettings.tsx will show MC-related settings (askUserForASolutionBeforeEvaluation, Anchored Sampling) for all questions, with a note explaining they control the new MC app
