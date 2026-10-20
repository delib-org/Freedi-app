# Lane B: evaluation result updates (t2 evaluator count, t3 isChosen diff)

Branch `feat/firebase-cost-results`. Scope: `functions`, `packages/shared-types`, `firestore.rules`.

## 1. The chain on one evaluation event (after this change)

Trigger functions (all me-west1, `functions/src/evaluation/`): `newEvaluation`, `updateEvaluation`, `deleteEvaluation` fire on `evaluations/{id}` create / update / delete. Every writer of `evaluations` goes through them (client vote, MC, Agora `fn_onAgoraEvaluation` / `fn_agoraJoinSession` / `fn_agoraRerateStances` / `fn_agoraCharacterReview`, `fn_mergeStatements`, integration). Exceptions skipped inside the trigger by design: `source: 'sign'` (Sign API route computes consensus itself) and `migratedAt` (create only).

| step | create | update | delete | cost |
|---|---|---|---|---|
| `updateStatementEvaluation` (option's sums, consensus, `lastUpdate`, processed-event marker) | yes | yes | yes | unchanged by this lane |
| `recordEvaluatorParticipation(parentId, uid)` | yes | yes | no | 1 read if already counted; else 2 reads + 2 writes (marker + question counters) |
| `updateParentStatementWithChosenOptions(parentId)` | yes | yes | yes | 1 parent read + 1 query over the question's options + 1 query over currently chosen children; writes only the diff |
| demographic, engagement, progress, social proof, embedding stale, history | yes | partly | partly | unchanged |

Other callers of `updateParentStatementWithChosenOptions` (selection only, no counting): `topAnswerSync.ts` (option deleted / hidden / unhidden), `fn_recomputeTopOptions.ts` (admin callable), `agora/votingStage.ts`. They no longer rescan evaluations. `evaluationMigration.ts` (integration) calls `reconcileParentEvaluators` (a deliberate full recount, rare admin-style action).

Queries removed from ordinary processing: `evaluations where parentId == X` with no limit (the O(N) scan) and the full read-modify-write of the question's `evaluation` object.

Triggers downstream of what we write: every write to a `statements/*` doc fires the statement-update trigger (`fn_statement_updates.ts`, lane A) and its subscription fan-out. That is why the tables below count "statement-update triggers" separately from raw writes.

Client listeners affected: the question statement listener (`parentStatement.evaluation.asParentTotalEvaluators`, `totalEvaluators`, `results`, `totalResults`; read by `SingleLikeEvaluation`, `SuggestionCard`, `TreeOptionNode`, `StageCard`, `FindSolutionsPhase`, `useStageManagement`) and the options listener (`isChosen`). They still receive live updates, just fewer redundant ones. `evaluationParticipants` has no client listener (rules deny all).

## 2. Ownership of calculated results

| field | owner | when it changes |
|---|---|---|
| option `evaluation.*`, `consensus`, `totalEvaluators` (the option's own) | `updateStatementEvaluation` | every evaluation event on that option |
| question `evaluation.asParentTotalEvaluators`, question `totalEvaluators` | `recordEvaluatorParticipation` (+1 on first participation), `reconcileParentEvaluators` / backfill (absolute) | first evaluation by a user on the question; reconcile |
| `evaluationParticipants/{parentId}--{uid}` | `recordEvaluatorParticipation`, reconcile, backfill | created once; only reconcile deletes |
| option `isChosen` | `updateParentStatementWithChosenOptions` | only when an option enters or leaves the chosen set |
| question `results`, `totalResults` | same | only when the ordered chosen list, or a field copied into it (consensus, text, ...), changes |

## 3. t2: evaluator count

* Collection `evaluationParticipants`, doc id `{parentId}--{encodeURIComponent(uid)}` (`getEvaluationParticipantId`, `EvaluationParticipantSchema`, `Collections.evaluationParticipants` in shared-types). Fields: `parentId`, `userId`, `createdAt` (ms). Server only.
* Event handling is one transaction: read marker; if present, stop (no write at all). If absent: read question, create marker, `FieldValue.increment(1)` on `evaluation.asParentTotalEvaluators` and `totalEvaluators`. Duplicate, re-delivered, out-of-order and concurrent events therefore count each user exactly once.
* Neutral evaluations (value 0) count: the participation rule has no value input.
* **Behaviour change (agreed with Tal):** once counted, a participant stays counted. Deleting all of one's evaluations does not decrement. The old scan did decrement. Only `reconcileParentEvaluators` can lower the count, because it recomputes from the evaluations that exist now.
* **`lastUpdate` (corrected after review):** a real count change DOES stamp the question's `lastUpdate` (same write, `Date.now()`), and so does a real `results` change; an option whose `isChosen` flips gets `lastUpdate` too. The first version of this lane omitted this, which was wrong: `listenToStatementDeltas` (`where lastUpdate > watermark`, wired in `useStatementListeners`) is the only live channel for bulk-loaded scopes, so the count and results would have stopped updating live. Nothing is stamped when nothing changed (already-counted user, unchanged selection). Treating result/count-only changes as non-activity in the statement-update fan-out is lane A's job, not done here. Tests: `evaluatorParticipation.test.ts`, `chosenOptions.test.ts` ("advances lastUpdate ...").
* The question is written only when the count actually changes (first participation of a user). An update to an existing evaluation does zero parent writes. The old code also rewrote the whole `evaluation` map (racy with other writers); the new code writes only the two counter fields (dotted path), and builds a complete default `evaluation` map only if the question has none.
* Failure mode: if the transaction fails the error is logged (`evaluation.recordEvaluatorParticipation`) and the trigger continues. The user's next create/update event self-heals it; reconcile repairs any drift.

### Backfill and reconciliation

* `functions/src/migrations/backfillEvaluationParticipants.ts` + CLI `functions/scripts/backfillEvaluationParticipants.ts`. Two phases, cursor-paged by document id (500/page), resumable (`--cursor=<docId>` printed after every page), idempotent (existing markers untouched via `create` + ignore ALREADY_EXISTS; a question already holding the right count is not written). Dry run by default; `--execute` to write.
  * `--phase=participants`: evaluations -> markers.
  * `--phase=counts`: markers -> question counts (aggregation `count()`).
* `reconcileEvaluatorCount` (callable, me-west1, question admin only, 300 s): `reconcileParentEvaluators(questionId)` rescans that question's evaluations in pages, adds missing markers, removes markers whose user has no evaluation left, writes the exact count only if it differs. Full scans never run in ordinary processing.

## 4. t3: isChosen diff

`updateParentStatementWithChosenOptions` now: read question (for settings and current `results`), read its options (one query), compute the chosen list with the pure rules in `chosenOptionsSelection.ts`, read currently-flagged children (`isChosen == true`, small), write `isChosen: false` only for removed and `true` only for added (chunks of 500), and write `results`/`totalResults` only if they differ from what is stored. Comparison ignores `lastUpdate` of the copied options (moves on every vote; no surface reads it from the copy). Selection rules are unchanged: topOptions with `ceil(numberOfResults)` (default 5), aboveThreshold with `cutoffNumber` (strictly greater), `all`, unknown cutoff -> nothing chosen, hidden options (incl. hidden originals inside clusters) excluded, `ResultsBy` ordering with stable ties, `defaultResultsSettings` fallback. The old clear-everything-then-set-again toggling is gone, so a settled question produces no option writes.

Proof: `chosenOptions.test.ts` runs a frozen copy of the old implementation (`__tests__/helpers/legacyChosenOptions.ts`) against the new one over 241 settings combinations x random option sets (ties, undefined consensus, hidden + stale chosen) and requires identical `isChosen` flags and identical `results`/`totalResults`.

## 5. Before / after (one new evaluation, shared update step)

Measured with the instrumented in-memory Firestore in `chosenOptions.test.ts` (reads = documents returned, min 1 per query; `count()` = 1 read per 1000 entries). Question with 10 options, top 5 chosen. "Before" = old `updateParentStatementWithChosenOptions` (clear + re-mark + parent results + evaluator scan + parent update). "After" = `recordEvaluatorParticipation` + new `updateParentStatementWithChosenOptions`. `updateStatementEvaluation` (identical both ways) and the evaluation trigger invocation itself (1 per event both ways) are excluded. "Stmt triggers" = writes to `statements/*` docs, each of which fires the statement-update function.

Scenarios: A new user votes on a non-top option (selection and copies unchanged); B new user votes on a top option (its consensus moves, order unchanged); C a vote makes option 6 overtake option 5; D an existing participant edits a vote, nothing else changes.

| N existing evals | scenario | reads before | reads after | writes before | writes after | stmt triggers before | stmt triggers after |
|---|---|---|---|---|---|---|---|
| 10 | A | 28 | 18 | 12 | 2 | 12 | 1 |
| 100 | A | 118 | 18 | 12 | 2 | 12 | 1 |
| 1000 | A | 1018 | 18 | 12 | 2 | 12 | 1 |
| 10000 | A | 10018 | 18 | 12 | 2 | 12 | 1 |
| 10 / 100 / 1000 / 10000 | B | 28 / 118 / 1018 / 10018 | 18 | 12 | 3 | 12 | 2 |
| 10 / 100 / 1000 / 10000 | C | 28 / 118 / 1018 / 10018 | 18 | 12 | 5 | 12 | 4 |
| 10 / 100 / 1000 / 10000 | D | 28 / 118 / 1018 / 10018 | 17 | 12 | 0 | 12 | 0 |

Function invocations per event: the evaluation trigger is 1 before and after. Downstream statement-update invocations (plus their subscription fan-out) fall from 12 to 0-4 (the "stmt triggers" column). In scenario A the single remaining one is the counter write for a genuinely new participant. A vote that collects M evaluations used to spend about M^2/2 reads on scans alone (500k for M=1000); it is now about 18 x M.

Remaining read cost per event is O(options on the question), not O(evaluations): 1 question + all options + chosen children (+1 marker, +1 question on first participation).

## 6. Rollout order and rollback

1. **Deploy `firestore.rules`** (adds the deny-all `evaluationParticipants` block). Safe alone.
2. **Backfill** (old functions still running and still writing absolute counts), from `functions/`, per project:
   `GCLOUD_PROJECT=<proj> npx tsx scripts/backfillEvaluationParticipants.ts --phase=participants --execute` then `--phase=counts --execute`. Dry run first without `--execute`. Resume with `--cursor=`.
3. **Deploy functions** (named, in batches): `newEvaluation`, `updateEvaluation`, `deleteEvaluation`, `reconcileEvaluatorCount` (new callable), plus the functions that import `updateChosenOptions.ts` and are bundled with it: `recomputeTopOptions` and whatever `index.ts` loads (the whole codebase bundle redeploys functions whose code changed; use `npm run deploy:f:<target> -- <names>`).
4. **Run the backfill again** (both phases). The final count write is transactional (marker count and question are read in one transaction), so it is safe while evaluations are being made. This closes the gap: users who first evaluated between step 2 and step 3 were counted by the old scan but have no marker, and would otherwise be counted a second time on their next event. The second run is idempotent and sets exact counts.
5. Spot check a busy question: `reconcileEvaluatorCount` returns `previousCount == count` (unless users deleted all evaluations, see section 3).

Rollback: redeploy the previous functions. The old code recomputes the absolute count from evaluations on its next event, so counts self-correct; `evaluationParticipants` is simply ignored (leave it or delete it later). The rules block can stay.

## 7. Remaining uncertainties

* Shared-types repack: `functions/freedi-shared-types-1.0.2.tgz` was rebuilt (same file name). Prebuild in CI re-packs it anyway.
* Ordering between the participation transaction and `updateStatementEvaluation` is not enforced; both are independent writes to different fields, so no conflict, but a failure between them is only healed by the user's next event or reconcile.
* Participants who evaluated before rollout and never evaluate again rely on the backfill (steps 2 and 4). Skipping step 4 can over-count by the number of users who first evaluated inside the gap.
* The "stays counted" rule means a question whose evaluations were purged (e.g. `fn_removeUserEvaluations`, test-data clearing) keeps its count until `reconcileEvaluatorCount` is run for it. Those paths were not changed.
* Sign-app evaluations skip the triggers, so they never create markers; the old scan counted them whenever any other evaluation fired. Backfill and reconcile count them. If Sign questions show a count lower than before, run reconcile once for them.
* Fake-Firestore op counts model billing (docs returned = reads); real Firestore can add index-entry or listener costs not modelled. The emulator was not used for the scaling table (a mocked instrumented Firestore was used, as the brief allowed). Rules tests ran on the emulator (204 pass, 0 fail).
* Reads per event could drop a further ~5 by deriving the currently-chosen set from the options snapshot, but that would stop cleaning stale `isChosen` flags on non-option children, so it was left.
