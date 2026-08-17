# Agora: Voting Stage after Deliberation — Implementation Plan

> Execute from repo root on branch `feat/agora-classroom-hardening` (or a branch off it).
> House rule: `cd apps/agora && npm run preflight && npm run fast` BEFORE editing anything in apps/agora.

## Context

Agora's classroom game currently flows lobby → framing → perspectives → needs → positioning → deliberation → results → ended, with the results-stage "leader" picked by consensus math alone. This plan adds a **voting stage** between deliberation and results: the teacher (session admin — TAU runs sessions via Odyssey, same shared machinery, no separate admin role needed) configures which proposals advance — **default: top X options by the shared consensus metric (Cp, `statement.consensus`)**, with an above-threshold mode also selectable — and students then vote main-app-style (one vote each, bar-chart tallies). When voting ran, the **top-voted proposal is the winner by default**, unless the teacher set a **winning Cp threshold** (e.g. Cp > 0.88) that the top-voted proposal fails to clear.

Decisions confirmed with Tal:
- Selection uses the **shared metrics/machinery used by all other apps** (`ResultsSettings`, `statement.consensus`, `functions/src/evaluation/updateChosenOptions.ts`) — not Agora-only `classConsensus`.
- Votes **reuse the main-app `votes` collection** and the existing `addVote`/`fn_vote` trigger (`functions/src/fn_vote.ts`).
- Keep settings + winner math in **shared packages** so Odyssey (TAU) can reuse later; no Odyssey work now.

Verified foundations:
- The shared evaluation triggers (`functions/src/evaluation/onCreateEvaluation.ts` etc., registered on `/evaluations/{evaluationId}` in `functions/src/index.ts`) already run on Agora ratings (they only skip `migratedAt` / `source === 'sign'`), so Agora proposals already carry `statement.consensus`, and `updateParentStatementWithChosenOptions` already runs for the challenge question on every rating.
- `functions/src/agora/fn_agoraAdvanceStage.ts` permits any forward jump (`toIndex > fromIndex`) → voting is naturally skippable (deliberation → results stays legal).
- `firestore.rules` `/votes/{voteId=**}` (~line 911) is wide open to any authed user — tighten as part of this work.
- Agora is **Mithril**, not React — main-app vote UI (`src/view/pages/statement/components/vote/`) is a UX reference only, don't import it.
- Vote doc id: `getVoteId(userId, parentId)` = `${userId}--${parentId}` (one vote per user per question); un-vote = write `statementId: 'none'` (see `src/controllers/db/vote/setVote.ts` semantics).
- `fn_vote.ts` (`addVote`) maintains `selections{optionId: count}`, `isVoted`, `topVotedOption` on the parent statement — live tallies reach clients through the parent statement doc.

## Step 1 — Shared types (`packages/shared-types`)

1. `src/models/agora/agoraEnums.ts` — add `voting = 'voting'` to `AgoraStage`, between `deliberation` and `results`.
2. **New** `src/models/vote/votingStageSettings.ts` (vote dir, so Odyssey can reuse without agora imports):
   - `VotingStageSettingsSchema = object({ enabled: optional(boolean()), selection: optional(ResultsSettingsSchema), winningConsensusThreshold: optional(number()) })` — `selection` reuses the shared `ResultsSettings` shape (`ResultsBy`/`CutoffBy` from `src/models/results/ResultsSettings.ts`).
   - `resolveVotingSelection(settings?: VotingStageSettings): ResultsSettings` — defaults to `{ resultsBy: ResultsBy.consensus, cutoffBy: CutoffBy.topOptions, numberOfResults: AGORA_VOTING.DEFAULT_TOP_X }`.
   - Pure winner math (server + any future client compute identically):
     - `tallyVotes(votes: Array<{statementId: string; userId: string}>, candidateIds: string[]): Record<string, number>` — ignores `'none'`, only counts candidates.
     - `pickVoteWinner(counts, consensusById, winningConsensusThreshold?): { winnerStatementId?: string; metThreshold: boolean; total: number }` — tie-break: votes desc → consensus desc → statementId asc (deterministic).
   - Export everything from the package barrel.
3. `src/models/agora/agoraSession.ts` — add to `AgoraSessionSchema`:
   - `votingSettings: optional(VotingStageSettingsSchema)` — teacher-writable.
   - `voting: optional(AgoraVotingStateSchema)` — **server-owned ballot snapshot**:
     ```ts
     export const AgoraVotingStateSchema = object({
       candidateIds: array(string()),
       candidates: array(object({ statementId: string(), statement: string(), consensus: number() })),
       computedAt: number(),
     });
     ```
     Snapshot matters: the shared trigger keeps rewriting `parent.results`/`isChosen` on later evaluations; clients must read the ballot from `session.voting`, never `parent.results`.
   - `AgoraClassScoreSchema` gains: `voteWinnerStatementId: optional(string())`, `voteCounts: optional(record(string(), number()))`, `voteTotal: optional(number())`, `voteWinnerMetThreshold: optional(boolean())`, `winningConsensusThreshold: optional(number())`.
4. `src/models/agora/agoraConstants.ts` — add:
   ```ts
   export const AGORA_VOTING = {
     DEFAULT_TOP_X: 3,
     MIN_TOP_X: 2,
     MAX_TOP_X: 10,
     DEFAULT_CUTOFF_CP: 0.5,
   } as const;
   ```
5. Unit tests for `resolveVotingSelection` / `tallyVotes` / `pickVoteWinner` — put in `apps/agora/src/lib/__tests__/votingSelection.test.ts` (agora's vitest gate imports shared-types; shared-types has no verified test runner of its own). Cover: default resolution, topX vs threshold mapping, winner/tie-breaks, threshold met/missed, `'none'` ignored, empty votes.
6. Rebuild shared-types (`cd packages/shared-types && npm run build`). **Functions consumes shared-types as a packed .tgz** — repack/rsync it into functions before the functions build, or edits are invisible there (see memory `shared-types-functions-tgz`).

## Step 2 — Cloud Functions

1. **New** `functions/src/agora/votingStage.ts` — `prepareVotingStage(sessionId: string)`:
   - Read session; `const selection = resolveVotingSelection(session.votingSettings)`.
   - Write `selection` as `resultsSettings` on `statements/{session.challengeQuestionId}`.
   - Call the existing `updateParentStatementWithChosenOptions(session.challengeQuestionId)` (`functions/src/evaluation/updateChosenOptions.ts`) — it sorts by Cp / filters above threshold, sets `isChosen`, writes `parent.results`. Maximal reuse; do not reimplement.
   - Read the parent back; write `session.voting = { candidateIds, candidates (each with its shared consensus), computedAt: Date.now() }` with omit-undefined discipline (copy the `leadFields` conditional-spread style from `classScore.ts`). Empty candidates is a valid state.
2. `functions/src/agora/fn_agoraAdvanceStage.ts`:
   - Insert `AgoraStage.voting` into `STAGE_ORDER` between `deliberation` and `results` (~line 38).
   - After the session update, mirror the results branch: `if (stage === AgoraStage.voting) await prepareVotingStage(sessionId);`
   - Add a comment that deliberation → results remains a legal skip (voting is optional).
3. `functions/src/agora/classScore.ts` — `computeSessionResults`:
   - Extend `ProposalRow` with the shared `consensus` (from the statement doc — NOT `agoraScores.classConsensus`).
   - If `session.voting?.candidateIds?.length`: query `Collections.votes` where `parentId == session.challengeQuestionId` (single-equality — no composite index needed) → `tallyVotes` + `pickVoteWinner(counts, consensusById, session.votingSettings?.winningConsensusThreshold)`.
   - **Winner rule:** if a winner exists AND `metThreshold` → the vote winner becomes `leadProposal` (overrides the consensus pick; the health-metric simulation and results screen then narrate the elected proposal). If the threshold is missed → do NOT override the lead; record the facts so the UI can say "top-voted X didn't clear the bar".
   - Write the new classScore fields with conditional spreads (an `undefined` sinks the whole batch write).
4. No new function exports — `prepareVotingStage` is internal to `agoraAdvanceStage`; `addVote` unchanged. Deploy (only on explicit ask): `npm run deploy:f:test -- agoraAdvanceStage` (me-west1; never raw `firebase deploy`).

## Step 3 — Firestore rules + rules tests

1. `firestore.rules` agoraSessions update rule (~lines 55–72): add a frozen clause alongside `classScore`/`participantCount`:
   ```
   request.resource.data.get('voting', {}) == resource.data.get('voting', {})
   ```
   `votingSettings` stays teacher-writable via the existing teacher-only update rule (no change needed for it).
2. Tighten `/votes` (~line 911) — replace the wide-open recursive match:
   ```
   match /votes/{voteId} {
     allow read: if request.auth.uid != null;
     allow create, update: if request.auth.uid != null &&
       request.resource.data.userId == request.auth.uid &&
       voteId == (request.auth.uid + '--' + request.resource.data.parentId);
     allow delete: if request.auth.uid != null && resource.data.userId == request.auth.uid;
   }
   ```
   Compatible with main-app `setVoteToDB` (transactional set on own deterministic doc id, incl. the `'none'` toggle) and with `getVoters`-style collection reads. **Before dropping `=**`**: grep `src/ functions/ apps/` for any subcollection under `votes` (none found in exploration, re-verify).
3. **New** `tests/rules/votes.test.mjs` (pattern: `tests/rules/agora.test.mjs` + `helpers.mjs`, node --test, emulator 8081): own-vote create with correct id allowed; wrong doc id denied; forged `userId` denied; updating another user's vote denied; toggle to `'none'` allowed; authed collection read allowed.
4. Extend `tests/rules/agora.test.mjs`: teacher may update `votingSettings`; teacher may NOT write `voting` / `classScore`; student may not update the session doc.

## Step 4 — Agora client: vote path + live tallies

1. **New** `apps/agora/src/lib/voting.ts` (all Firestore in lib per house conventions; announce-style listeners per commit `a1b0d84c5` — callbacks update module state then `m.redraw()`, never call back into views):
   - Module state `{ selections: Record<string, number>; topVotedId: string | null; myVoteStatementId: string | null; voterUids: Set<string>; loaded: boolean }` + `getVotingState()`.
   - `listenToVoting(sessionId, challengeQuestionId, userId)` — idempotent per key: (a) doc listener on `statements/{challengeQuestionId}` → `selections` (drop the `'none'` key) + `topVotedOption`; (b) doc listener on `votes/{uid--challengeQuestionId}` → `myVoteStatementId` (`'none'` → null); (c) collection listener on `votes` where `parentId == challengeQuestionId` → `voterUids` (teacher "n/N voted" chips; cheap for a class).
   - `stopVotingListeners()`.
   - `castVote(session, statementId)` — `voteId = getVoteId(uid, session.challengeQuestionId)`; if `myVoteStatementId === statementId` write `statementId: 'none'` (un-vote), else the option id; full `Vote` object with `voter: agoraCreator(uid, anonName)` (anonymity preserved); wrap in `trackWrite('voting.saving_vote', setDoc(...))` from `lib/confirmedWrite.ts` (stuck-write discipline — see memory `agora-write-confirmation`).
2. **New** `apps/agora/src/views/Voting.ts` — student ballot, Mithril, attrs `{ session, myParticipant, userId }`:
   - Ballot from `session.voting.candidates` (already Cp-sorted at snapshot time); live counts from `getVotingState()`.
   - Full-width option buttons; inner `.voting__bar` fill = count/total; show count + %; my vote highlighted with `aria-pressed`; tap to vote, re-tap to un-vote, tap another to switch; footer `voting.total_votes`; empty candidates → `voting.waiting` card. No Firestore imports in the view.
   - BEM: `.voting`, `.voting__list`, `.voting__option`, `.voting__option--mine`, `.voting__bar`, `.voting__label`, `.voting__count`.
3. **New** `apps/agora/src/styles/components/_voting.scss`, imported by `components.scss`; add representative voting markup to `mock/surfaces.html` (the contrast gauntlet renders real stylesheets).

## Step 5 — Stage wiring (every enumerating surface)

- `apps/agora/src/views/GameController.ts` — `case AgoraStage.voting:` → `m(Voting, {...})` (respect the existing no-seat guard pattern); attach `listenToVoting` idempotently like other stage listeners; `stopVotingListeners()` in `onremove`.
- `apps/agora/src/components/StageTransition.ts` — add entry `{ icon: 'scales', labelKey: 'stage.voting', lineKey: 'transition.voting' }` (`'scales'` exists in the `IconName` union in `components/Icon.ts`; pick another if it clashes with an existing station).
- `apps/agora/src/components/JourneyStrip.ts` — station `{ stages: [AgoraStage.voting], icon: 'scales', labelKey: 'stage.voting' }` between deliberation and results.
- `apps/agora/src/views/teacher/TeacherInstructions.ts` — voting projector card (`voting.title` / `voting.teacher_hint`).
- `apps/agora/scripts/fastlane.ts` — `ARRIVED.voting = '.voting'`.

## Step 6 — Teacher settings UI + winner display

1. `apps/agora/src/lib/teacher.ts` — `setVotingSettings(sessionId, settings: VotingStageSettings)` → `updateDoc` on the session doc (teacher-writable by rules); clamp X to `AGORA_VOTING.MIN_TOP_X..MAX_TOP_X` before writing.
2. `apps/agora/src/views/teacher/TeacherSession.ts`:
   - Add `AgoraStage.voting` to its local `STAGE_ORDER` and `PROGRESS_STAGES`.
   - Next-stage chain: if the computed next stage is `voting` and `session.votingSettings?.enabled === false`, skip to `results` (server already allows the jump). Undefined = enabled.
   - During **deliberation**: render `votingSettingsCard(session)` — enable toggle, mode select (`topOptions` default / `aboveThreshold`), number input for X, number input for Cp cutoff, optional number input for `winningConsensusThreshold` (blank = top-voted always wins); saves via `setVotingSettings`. Live panel only — no TopicWizard/TopicEditor changes.
   - During **voting**: attach `listenToVoting`; show live tally + `t('teacher.voted_count', { n, total })`; `participantProgress` gains a voting branch: done = `voterUids.has(participant.userId)`.
3. `apps/agora/src/views/Results.ts` — new card when `session.classScore?.voteWinnerStatementId` exists: "the class voted" + winner text (from `session.voting.candidates`) + counts. When `voteWinnerMetThreshold === false`: show `results.vote_winner_missed` (winner's Cp vs `winningConsensusThreshold`) instead of crowning it.

## Step 7 — i18n

`apps/agora/src/lib/i18n.ts`, ALL 6 locales (he, en, ar, es, de, nl) — `i18nParity.test.ts` enforces parity, Hebrew is the reference. Keys:

- `stage.voting` (he: `הצבעה` / en: `The vote`)
- `transition.voting` (he: `הכיכר בחרה מועמדות — עכשיו מצביעים` / en: `The square has chosen its finalists — time to vote`)
- `voting.title`, `voting.teacher_hint`, `voting.instruction`, `voting.waiting`, `voting.total_votes` ({n}), `voting.change_hint`, `voting.saving_vote`
- `teacher.voting_settings`, `teacher.voting_enabled`, `teacher.voting_mode`, `teacher.voting_mode_top`, `teacher.voting_mode_threshold`, `teacher.voting_top_x`, `teacher.voting_threshold`, `teacher.voting_win_threshold`, `teacher.voted_count` ({n}, {total})
- `results.vote_winner`, `results.vote_winner_missed` ({cp}, {threshold})

## Step 8 — Fastlane + E2E

1. `apps/agora/scripts/lib/fastlane.ts` — new option `ratings?: boolean` (auto-on when the target stage is `voting` or `results`): after proposals are posted, each bot writes Evaluation docs shaped exactly like `rateProposal()` in `apps/agora/src/lib/proposals.ts` (id `${uid}--${statementId}`, `parentId: challengeQuestionId`, `evaluator` object, `agoraSessionId`, varied values so ordering is deterministic), then **poll** the proposal statements until `consensus` is populated (shared triggers run async in the emulator; preflight already requires the functions emulator) before calling `agoraAdvanceStage`. Without the poll, candidate selection sorts zeros.
2. **New** `apps/agora/scripts/e2e-voting.mjs` (pattern: `e2e-cycle.mjs` + `scripts/lib/e2e.mjs`; asserts Firestore state, not pixels):
   1. Fastlane to deliberation, 4 bots, 3 proposals, seeded ratings; wait for consensus.
   2. Teacher sets `votingSettings { selection: { resultsBy: consensus, cutoffBy: topOptions, numberOfResults: 2 } }`.
   3. Advance → voting; assert `session.voting.candidateIds` = top-2 by Cp and `isChosen` set on exactly those statements.
   4. Two bots cast votes **via authenticated client writes** (exercises the tightened rules + `addVote` trigger); assert `selections` tallies on the challenge question; one bot changes their vote; assert increment/decrement.
   5. Advance → results; assert `classScore.voteWinnerStatementId` = top-voted and `leadStatementId` = it.
   6. Second session with `winningConsensusThreshold: 0.99`; assert `voteWinnerMetThreshold === false` and `leadStatementId` NOT forced to the vote winner.

## Verification checklist

1. **Before editing** (house rule): `cd apps/agora && npm run preflight && npm run fast`.
2. `npm run fast -- --stage=voting --open` — student lands on the ballot.
3. `apps/agora`: `npm run check-all` (lint, typecheck, typecheck:scripts, vitest incl. i18nParity, build, contrast, typesize).
4. `functions`: build + existing evaluation tests still green.
5. Rules tests (`tests/rules`, node --test, emulator 8081): new votes tests + session freeze tests.
6. `node scripts/e2e-voting.mjs`; re-run `e2e-cycle.mjs` and `e2e-smoke.mjs` (stage-order change touches shared paths).
7. Main-app regression after rules tightening: cast/toggle a vote in the main app against the test env.
8. Deploys **only on explicit ask**: shared-types build → `npm run deploy:f:test -- agoraAdvanceStage` → rules deploy script → agora hosting.

## Risks / gotchas

- **`{voteId=**}` recursion drop**: re-grep for votes subcollections before tightening the match.
- **`selections.none`**: un-votes bump a `'none'` key and `fn_vote`'s `maxKeyInObject` could crown `'none'` as `topVotedOption` (pre-existing main-app quirk). Agora ignores `'none'` client-side, and the authoritative winner comes from `tallyVotes` over the votes collection — never rely on `topVotedOption`.
- **Late ratings after candidacy**: mitigated by the rules-frozen `session.voting` ballot snapshot; clients read the ballot only from there.
- **In-flight vote at results time**: `computeSessionResults` reads the votes collection directly, so a vote landing just before advance is counted even if the trigger hasn't updated `selections` yet — the safe direction.
- **shared-types → functions .tgz**: functions won't see shared-types edits until the tarball is repacked (memory `shared-types-functions-tgz`).
