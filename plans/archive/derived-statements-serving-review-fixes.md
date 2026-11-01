# Code Review Findings — derived-statement serving filter (uncommitted changes)

## Context
Review of the uncommitted working-tree changes on `main-mc`:
- New `apps/mass-consensus/src/lib/utils/derivedStatements.ts` (`isDerivedStatement` / `isServableOriginal`)
- `apps/mass-consensus/src/lib/firebase/queries.ts` — `getRandomOptions` and `getAdaptiveBatch` now filter with `isServableOriginal` instead of `!opt.hide`
- `packages/shared-types` — new `integratedInto` field on StatementSchema
- `firebase.json` — emulator hosts `0.0.0.0` → `localhost`

What checked out fine: `sanitizeStatement` only strips `embedding`, so all marker fields reach the filter; `performIntegration` writes `hide:true, integratedInto`; `reverseIntegration` clears both; shared-types dist was rebuilt and includes `integratedInto`; migrated evaluations are copies (source evals kept), so already-evaluated originals stay in the user's excluded set.

## Findings (most severe first)

### 1. Moderation hide is ineffective once `integratedInto` is set
`derivedStatements.ts:50` — `isServableOriginal` returns true for any hidden statement with `integratedInto`, regardless of WHY it is currently hidden. If a moderator later hides an integrated original (e.g. offensive content discovered post-clustering), `hide:true` is silently overridden and the statement keeps being served for evaluation. The predicate conflates "hidden by integration" with "currently only hidden by integration".

### 2. Users evaluate options they can never see in results / my-suggestions
`queries.ts:171,192,246` serve hidden-integrated originals, but `getAllSolutionsSorted` (queries.ts:337) and `getUserSolutions` (queries.ts:373) still filter `!statement.hide`. A user rates original X, then opens q-results or my-suggestions and X is absent (only the cluster shows). The user's own integrated suggestion also vanishes from "my suggestions".

### 3. Post-integration evaluations on originals never reach the cluster
Evaluation migration is a one-time copy at integration time (`functions/src/evaluation/evaluationMigration.ts`). Now that originals are served again after integration, new evaluations land on the hidden original and are not reflected in the cluster's consensus shown in results — silently lost from the displayed aggregate unless something re-aggregates.

### 4. `apps/chat` hardcodes `127.0.0.1` for emulators now bound to `localhost`
`apps/chat/src/lib/firebaseClient.ts:67,91,130` connects to `127.0.0.1` (with a comment explaining it deliberately avoids `localhost`/IPv6). firebase.json emulators now bind to `localhost`; depending on firebase-tools version/IPv6 resolution this can stop accepting IPv4 connections. Also, LAN/mobile-device emulator access (the point of `0.0.0.0`) is lost.

### 5. Batch under-fill: fetchMultiplier doesn't account for derived/hidden docs
`queries.ts:155` — `fetchMultiplier` scales over-fetch only by `allExcludedIds.length`, but the Firestore `limit()` is applied before the (now stricter) `isServableOriginal` post-filter. In a heavily clustered question, a large share of fetched docs are derived clusters and get filtered out, so batches return fewer than `size` even though enough servable originals exist.

### 6. MC mirror omits `liveSynthOrigin` from the canonical `isDerived` checks
`derivedStatements.ts:20` claims to mirror `functions/src/synthesis/derivedDocs.ts:isDerived`, but drops the `liveSynthOrigin` check. Currently safe (the only writer, clusterOps.ts:292, also sets `isCluster`/`derivedByPipeline`), but the mirrors will drift silently if a future writer sets only `liveSynthOrigin`.

## Optional fixes
- **#1**: store the pre-integration hide state (e.g. `hiddenBeforeIntegration`) or have moderation clear `integratedInto`; simplest: have `performIntegration` use a dedicated flag instead of overloading `hide`, or treat `hide:true` as unservable when a separate moderation marker exists.
- **#2**: apply `isServableOriginal` (or a shared predicate) in `getAllSolutionsSorted`/`getUserSolutions`, or map integrated originals to their cluster in results.
- **#5**: derive `fetchMultiplier` from the question's derived/hidden ratio or loop-fetch until `size` reached.
- **#6**: add `!!statement.liveSynthOrigin` to `isDerivedStatement` (field would need adding to shared-types or a local cast as in derivedDocs.ts).

## Verification
- `cd apps/mass-consensus && npx jest derivedStatements` (existing test file covers the predicate)
- Manual: integrate two options in a test question, then check MC results/my-suggestions for the served-but-invisible mismatch.
