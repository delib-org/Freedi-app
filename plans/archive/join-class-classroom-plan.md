# Join-class: the classroom lesson app — Implementation Plan

> Execute with the `parallel-work` skill from repo root, branches off `dev`.
> Run it in **three batches** (A, B, C below): every lane in a batch needs the previous batch merged into `dev`.
> Authority for every screen, label and flow: `docs/ia/agora-classroom.md` (IA spec, §1-12) and `docs/design/agora-classroom-ux.md` (UX, §1-12). Where this plan and those docs disagree, the docs win; fix the plan.
> Approved interactive simulation of the whole flow (private canvas): https://claude.ai/artifact/YUK4XD19ZBvEv6pMCPXw5w

## Context

Agora's classroom game failed a teachers' test (UX too complex, many bugs). Tal replaced the process with the teacher-facilitated hybrid lesson in his Google Doc ("Agora Classroom Deliberation — Hybrid Physical-Digital Process"): 8 class-level steps, physical tables of 3-5 students with mixed initial sides, per-speaker 1-minute talk turns with a dark screens-down countdown, Join-style writing with live broadcast, 5-face −1..+1 ratings feeding consensus, a gate (threshold) proposals must pass, a ballot, and a summary that asks for support of the decision grouped by initial side.

**Tal's decisions (2026-10-21, final):**
- **Build in a NEW app `apps/join-class`, a copy of `apps/join`.** Join is the most used and most tested code in the monorepo (Mithril 2 + Vite + Firebase, lint/typecheck/136 vitest green, 0 `any`, resilient listeners, first load ≈ 250 kB gzipped). Join itself is never changed. Agora's engine is **not** reused.
- The teacher gets a screen to **plan and save the guiding questions** before the lesson.
- All the §9 and §11 decisions of the IA spec (הצעה not פתרון; slider for the side; rating open any time; rail steps are jump buttons; proposals written and broadcast during Table talk; per-speaker timer with a *chosen* next speaker; gate bars on console and projector; summary = support for the decision by initial side; students move freely between the screens of the current step).
- Device budget (IA §9b): old weak phones, slow cellular. First screen ≤ 300 kB gzipped, one font, no 3D, no autoplay video, every listener through `resilientOnSnapshot`, Firestore offline persistence, timers as server moments, PWA shell precached.

**Mapping onto Join's model (IA §12):** lesson = workspace (main statement); class step = the workspace's follow-me path + `lessonPlan.stepIndex`; guiding questions = sub-questions (`createSubQuestion`); answers/proposals = options; ratings = Join's 5-face evaluations (already → `consensus` via the shared Cloud Function); live broadcast = Join's `liveDrafts` (RTDB). New on Join: `classTables` collection + callables, side + decisionSupport on the student's subscription, a ballot, teacher routes `/t/*`.

**Verified foundations (audit 2026-10-21):**
- `apps/join/src/lib/store.ts` (1743 lines): `createSubQuestion(mainId, title)`, `createSuggestion`, `setEvaluation`, `setPowerFollowMe(mainId, path)`, `setQuestionSetting`, `setMainStatementSetting`, `setManualOptionOrder`, admin check in `lib/admin.ts`.
- `lib/resilientListeners.ts` (224 lines, 15 named listener kinds), `lib/liveDrafts.ts` (509 lines, RTDB), `components/Evaluation.ts` (5 faces, −1..+1), `components/EditableTitle.ts`, `lib/dragReorder.ts` + `components/ManualReorder.ts`, `components/QRShare.ts`, `components/FacilitatorPanel.ts` (2192 lines: follow-me, live/frozen/closed gate, sort, theme).
- Routes today: `/`, `/login`, `/invite`, `/q/:qid`, `/q/:qid/s/:sid`, `/m/:mid`, `/m/:mid/q/:qid`. Anonymous auth on share links (`lib/user.ts` `ensureUser()`).
- Join has **no** roster, rooms, timer, stance, ballot, projector or teacher console; those are the new work.
- Cross-app reference for the ballot: main app `src/controllers/db/vote/` + `functions/src/fn_vote.ts` (`votes` collection, `selections{}` tallies on the parent) — reuse the collection and trigger, port only the client call.
- Hosting: `firebase.json` target `join` → `apps/join/dist`; root scripts `dev:join`, `deploy:join`; `npm run env:dev` writes Join's `.env.local`.

---

## Batch A — one lane, must land first

### A1. Scaffold `apps/join-class` (L, sequential, blocks everything)
- Copy `apps/join` → `apps/join-class`: package `@freedi/join-class`, dev port **3017**, PWA name "WizCol Class", `<html lang="he" dir="rtl">` default.
- Monorepo wiring: root `package.json` scripts `dev:join-class`, `deploy:join-class` (mirror the join ones); `firebase.json` hosting target `join-class` → `apps/join-class/dist` (mirror the `join` block incl. `/m/**` rewrites if any); `.firebaserc` target in the worktree only (gitignored); extend the env script that writes `apps/join/.env.local` to also write `apps/join-class/.env.local`; add the app to the CI workflow that validates Join (lint, typecheck, test, build).
- Keep everything that is not clearly separable. Remove only the Google-Sheets join-form sync and the delegates feature **if** their removal is a clean delete (files + routes + i18n keys); otherwise leave them.
- Locale files: keep all 7 (en, he, ar, fa, de, es, nl); new keys below go into every file.
- **Done:** `cd apps/join-class && npm run check-all && npm test` green with Join's 136 tests passing in the copy; `npm run dev:join-class` serves 3017 against the emulators; one commit.

---

## Batch B — two lanes (after A is in `dev`)

### B1. Lesson model on Join's objects (M) — files: `apps/join-class/src/lib/lesson.ts` (+ `__tests__`), `packages/shared-types` (optional fields only)
- `lessonPlan: { steps: StepKey[8], stepIndex: number }` on the workspace's `statementSettings`; step keys in order: `waiting, opening, side, tables, tableTalk, proposals, vote, summary`.
- `setLessonStep(mainId, index)`: writes `stepIndex` **and** the follow-me path of that step (reuse `setPowerFollowMe`); backward jumps allowed (IA §11.1). `getLessonStep()`, `stepLabel(key)`, `nextStep(key)`.
- Sub-question roles: `setQuestionSetting(qid, 'classRole', 'guiding' | 'challenge')`, optional `hint` string. Exactly one challenge question per lesson.
- Join code: a 6-digit `code` on the workspace + route `/c/:code` → resolves to `/m/:mid` (collection `classCodes/{code}` → `{mainId}`; rules: read any authed, write admin). QR stays Join's `QRShare`.
- Strict-parse trap: any new field on a shared Valibot schema is `optional()`; rebuild `shared-types` and repack for functions (memory: shared-types → functions .tgz).
- i18n keys `lesson.*`, `step.*` in all 7 locales. Vitest for every pure helper.

### B2. Teacher screens: home, plan the questions, console placeholder (L) — files: `apps/join-class/src/views/teacher/*.ts`, `src/index.ts` routes, `src/styles/_teacher.scss`
- IA §12.1 + UX §12. Routes: `/t` (teacher home), `/t/:mid/plan`, `/t/:mid` (console placeholder page "הקונסולה תגיע בשלב הבא" + link to plan + QR + code), `/t/:mid/screen` (placeholder).
- **`/t` home**: my workspaces (reuse `views/Main.ts` list), each row → "תכנון השאלות" and "לשיעור"; "+ שיעור חדש" → title → creates the workspace and opens `/t/:mid/plan`.
- **`/t/:mid/plan`** "תכנון השאלות": pinned card "השאלה לפתרון" (one `EditableTitle`); section "השאלות לשולחנות": cards with `EditableTitle` text + 14 px hint field + drag handle (`dragReorder`) + "מחיקה" tertiary; dashed "+ שאלה" card adds via `createSubQuestion` and focuses the new one (Enter adds the next); sticky bottom bar "שמירה" (primary → teal "נשמר") + "לקונסולה". Saves per field on blur; "שמירה" is confirmation. Admin only (`lib/admin.ts`); non-admin → `/m/:mid`. Empty state "עוד אין שאלות. הוסיפו את הראשונה". Phone layout: same list, bar fixed at the bottom.
- Vitest for the view's pure helpers; a Playwright smoke script `apps/join-class/scripts/e2e-plan.mjs` (emulator): create lesson, add 3 guiding + 1 challenge question, reorder, reload, see them.

---

## Batch C — five lanes (after B is in `dev`)

### C1. Engine: tables, turns, timers, ballot, decision support (L, backend) — files: `functions/src/classroom/*`, `packages/shared-types/src/models/classroom/*`, `firestore.rules`, `database.rules.json`
- **Collection `classTables/{mainId}--{n}`** (IA §2.2 adapted): `{ mainId, n, memberUids[], noDeviceMembers[{name}], step: 'pick'|'talk'|'write'|'rate', askerUid, turn, questionId?, writingMode: 'each'|'table', speakerUid?, speakerEndsAt?, spokenUids[], updatedAt }`. Student's `tableId` on their `statementsSubscribe` doc for the workspace.
- **Callables** (me-west1, App Check): `classAssignTables` (round-robin by `camp` from the subscription's `side`, 3-5 per table, centre spread, re-run replaces with a confirm flag), `classMoveStudent`, `classAddNoDevice`, `classTableStep` (actor = asker or admin; actions `pickQuestion`, `toTalk`, `nextSpeaker {uid}` which writes `speakerEndsAt = now + 60s`, `toWrite`, `setWritingMode`, `toRate`, `nextTurn`; a timer ending never advances anything), `classAllTablesTo {step}` (admin).
- **Side + support**: `side` 0..100, `camp` (`a | center | b`, thresholds 40/60), `decisionSupport` −1..+1 on the subscription; written by the student (rules: own doc, these fields only).
- **Auto +1** (IA §9.1): on an option created with `classTable.{tableId, shared, coAuthors}`, the trigger writes a +1 evaluation for the creator and each co-author (idempotent id `auto_<uid>_<optionId>`), through the shared evaluation pipeline so `consensus` updates.
- **Ballot**: reuse the `votes` collection + `fn_vote.ts` trigger; `classFreezeBallot` (admin) writes `ballot: { candidateIds[], frozenAt }` on the challenge question from the options above the gate (`votingSettings.threshold`, default 0.6) or the top N; `classCastVote` is Join's client writing a vote doc (port `setVote` semantics; un-vote = `statementId: 'none'`); decision = top-voted (tie → consensus → id).
- **`supportBySide()`** pure function in shared-types: mean `decisionSupport` per initial camp + verdict "sides came closer" when both sides ≥ gate.
- Rules for all of the above; Jest tests next to each function (`functions/src/classroom/__tests__`); an emulator script that seeds a 24-student lesson (`scripts/seed-classroom.ts`), reusable by C2-C5.

### C2. Student screens, part 1: waiting → side → my table (M, UI) — files: `apps/join-class/src/views/student/*.ts`, `src/components/StudentFrame.ts`, `ActionButton` (Join `.btn`), `SideSlider.ts`, `src/styles/_student.scss`
- UX §2.1-2.5 wireframes, 390 px, one instruction per screen, primary action pinned at the bottom. `StudentFrame` (`.frame`, `__header`, `__content`, `__action`, `--down`) is the shared phone frame for every student screen (UX §10 build order #1-2).
- **Code** `/c/:code` → **Join** (name) → **Waiting** ("ממתינים למורה" + count) → **Opening** (question card + "צופים ביחד"; video plays only on tap, never autoplay) → **Side** (`SideSlider`: native range `dir=ltr`, two character circles, centre tick, 48 px thumb, live word label as `aria-valuetext`; writes `side`/`camp`) → **My table** (big table number + tablemates chips with side marks; "עוד אין לכם שולחן. חכו למורה" until placed).
- The student's screen is decided by `lessonPlan.stepIndex` (listener on the workspace) — a refreshed phone lands on the current step; no student navigation except the step's own strip (C3).
- i18n keys `opening.*`, `side.*`, `table.*` in 7 locales. Vitest for pure helpers; Playwright script `e2e-student-1.mjs` on the seeded lesson.

### C3. Student screens, part 2: table talk, proposals, vote, summary (L, UI) — files: `apps/join-class/src/views/student/TableFlow.ts`, `TalkScreen.ts`, `Countdown.ts`, `QuestionPick.ts`, `WriteBox.ts`, `RatedList.ts`, `TextCard.ts`, `Sheet.ts`, `VoteList.ts`, `DecisionCard.ts`, `SupportBySide.ts`
- UX §2.6-2.9, §3, §4, §11 wireframes. Listener on `classTables/{mainId}--{myTable}`.
- **Sub-step strip** (UX §11 last bullet): שאלה · מדברים · כותבים · מדרגים pills under the asker line; switches the local view only.
- **Pick**: radio list of the teacher's guiding questions (used-at-this-table greyed, "נשאלה"), "+ שאלה משלנו" (anyone at the table, creates a sub-question with the table id), asker's primary "לקרוא בקול ולהתחיל".
- **Talk (screens down, UX §3)**: the one inverted screen (`--down` tokens: bg ink, text paper); line "הדוברת/הדובר: דנה · זמן נותר: 34 שניות" above `Countdown` (96-128 px tabular digits from `speakerEndsAt` and the server clock offset, last 10 s terracotta + two digits, "הזמן נגמר" replaces the digits); speaker chips of the tablemates (asker always, everyone once the minute is over; spoken = ✓); "סיימנו, לכתוב" asker always / everyone when all spoke. Proposals step: same screen, no speaker order.
- **Write**: asker's mode switch "כולם כותבים | תשובה אחת לשולחן" (locks after the first send); answer box + "הצעה לפתרון (לא חובה)" box at Table talk, proposal box alone at Proposals; broadcast checkbox "משדרים את הכתיבה לכיתה" (Join `liveDrafts`; the table's shared draft mirrored read-only on the other devices); "שליחה" → teal "נשלח", editable until the Vote opens; failed send keeps the draft locally.
- **Rate**: live-draft card "● שולחן 5 כותבים עכשיו" on top; answers and proposals mixed, each a `TextCard` with Join's `Evaluation` 5 faces + a −1 … +1 scale line; own items never listed; order unrated first, newest first; "▸ דירגתם n" collapsed group; reachable from every sub-step through the header control "הכיתה כותבת" as a `Sheet` (92 vh, labelled close "סגירה").
- **Plenum** (`roundPhase` on the challenge question = `improve`): "ההצעות המובילות על המקרן" line, list reordered by consensus, own proposal pinned with "עריכה".
- **Vote**: radio cards (no numbers, no authors) + "הצבעה" (two taps) → "הצבעתם"; change until closed.
- **Summary**: decision card (teal) first; "עד כמה אתם תומכים בהצעה?" 5 faces → `decisionSupport`; three bars (קרובים ליונתן / באמצע / קרובים לנועה) of mean support with "n מתוך m דירגו"; verdict line teal "✓ הצדדים התקרבו" or terracotta.
- i18n keys `turn.*`, `question.*`, `answer.*`, `proposal.*`, `rate.*`, `voting.*`, `summary.*` in 7 locales. Vitest for `Countdown` maths, list order, support bars; Playwright `e2e-student-2.mjs` (asker and non-asker devices in two contexts).

### C4. Teacher console (L, UI) — files: `apps/join-class/src/views/teacher/Console.ts`, `StepRail.ts`, `TablesBoard.ts`, `TableCard.ts`, `MemberChip.ts`, `TableSheet.ts`, `GatePanel.ts`, `WhatTheyWrote.ts`, `src/styles/_console.scss`
- UX §5 + §11 wireframes at 1280 px; three fixed bands: step rail (96 px), switch (48 px), board.
- **Step rail**: 8 steps as `<button>`s (done = ink fill + ✓, current = terracotta + larger, upcoming = outline; `<ol aria-label="שלבי השיעור">`, `aria-current="step"`); click = `setLessonStep(i)` forward or back; the ONE forward control `.btn--primary` 320 px at the rail's end "פתיחת השלב הבא: {name}" / "סיום השיעור"; "שלב n מתוך 8" + lesson clock.
- **Switch band**: step actions as secondaries ("חלוקה לשולחנות" / "חלוקה מחדש" at Tables; "כל השולחנות: מדרגים" at Table talk and Proposals; "כולם ביחד" at Proposals → teal "כולם ביחד · פעיל"); `Segment` "שולחנות | מה כתבו" (`?view=`).
- **Tables board**: before Tables = one roster card (chips of joined students; side marks appear after the Side step); after = grid of `TableCard`s (title + סבב, "עכשיו: …", timer line "הדוברת: דנה · 0:42" / "הזמן נגמר" in words + empty bar, asker line, member chips with ●/■/◆ side marks and "בלי מכשיר" dashed chips, "+ בלי מכשיר" inline form, quick actions "לכתיבה · לדירוג"); "ללא שולחן" strip with "לשולחן ▾" per unplaced student; **drag-to-move** with pointer events (clone, dashed target outline, `classMoveStudent` on drop) and the **keyboard path** (Space pick up, arrows, Space/Enter drop, Escape) plus the chip menu "העברה לשולחן אחר"; no "stuck" mark.
- **Gate panel** "הצעות מול השער" under the cards at Proposals (and at Table talk once a proposal exists): row = text (ellipsis) · track with terracotta gate line at `votingSettings.threshold` · consensus · "עברה את השער" / "עוד 0.12"; teal fill past the gate.
- **Table sheet** `/t/:mid/table/:n` (Join's `FacilitatorPanel` side-sheet pattern, 420 px): members with side + "העברה לשולחן אחר ▾" / "הסרה" / "הודעה", current question + turn, "לכתיבה" / "לדירוג" / "+ בלי מכשיר", "סגירה" + Escape.
- **What they wrote** (`?view=texts`): Join's display-only cards grouped by step then table; hide/restore (existing); "לדרג בשם …" on a card only when a "בלי מכשיר" member exists.
- Join's `FacilitatorPanel` knobs (sort, theme, language, gate threshold, speak seconds) stay behind the cog. i18n `console.*`. Vitest for rail state + drag reducer; Playwright `e2e-console.mjs` (run a whole lesson with one control; seat the class; move a student by keyboard).

### C5. Projector + full-lesson e2e + perf gate (M, UI + QA) — files: `apps/join-class/src/views/teacher/Projector.ts`, `src/styles/_projector.scss`, `apps/join-class/scripts/e2e-lesson.mjs`, CI workflow
- **Projector** `/t/:mid/screen` (UX §6): one thing per step, smallest text 32 px, bottom band with code + QR at every step. Waiting = code 160 px + QR + "n בכיתה"; Opening = question 72 px + video (teacher presses play); Side = the two characters, no counts; Tables = 5×2 grid of table tiles with names; Table talk = four count tiles; Proposals = gate bars at 28 px, then top proposals at the plenum; Vote = live tally bars; Summary = decision card + support-by-side bars + verdict. Grid, not a room map (deferred `class.roomLayout`).
- **Full-lesson Playwright test** on the emulators: teacher plans 3 questions + challenge, 6 students join by code, pick sides, get seated, one table runs two turns (asker + non-asker contexts, timer at 20× via a test-only speed flag on the server clock), proposals, plenum, ballot, summary with support by side. Wire it into CI for join-class (this is the structural fix for "bugs the teachers saw": Agora's 44 e2e scripts were never in CI).
- **Perf gate**: build and assert the student entry ≤ 300 kB gzipped (script in CI), one font family in `dist`, no `autoplay` attribute anywhere, Lighthouse-style slow-4G + 4× CPU run of `/c/:code` recorded in `docs/performance/join-class.md`; test once on a real low-end Android before the next teachers' test (Tal's hands).

---

## Order, lanes and merges

| Batch | Lanes | Needs |
|---|---|---|
| A | A1 | — |
| B | B1 ∥ B2 | A in `dev` |
| C | C1 ∥ C2 ∥ C3 ∥ C4 ∥ C5 | B in `dev`; C2-C5 stub the engine against `scripts/seed-classroom.ts` fixtures until C1 merges, then rebase |

Branch per lane: `feat/join-class-<lane>`. One commit per deliverable. Reviewer (`qa-code-auditor`) on every L lane. After each batch: merge every green branch into local `dev`, remove worktrees, hand Tal the deploy command list (`npm run deploy:join-class` hosting; `npm run deploy:f:prod -- classAssignTables classMoveStudent classAddNoDevice classTableStep classAllTablesTo classFreezeBallot` + rules) and ask once.

## Out of scope (later plans)
Scenario library / picking questions "מהספרייה"; room-mirroring projector layout; character portraits on the slider; Agora deletion (Agora stays as is until join-class has run a real lesson); Odyssey/civic tracks.
