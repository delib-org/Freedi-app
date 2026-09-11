# Agora — Working Handoff

**Start-here document for continuing work in a fresh chat.** Last updated
2026-09-06.

Companion docs: `../CLAUDE.md` (the rules of the road — read that first),
`feedback-cycle.md` (the improvement loop, and the spec `e2e-cycle.mjs`
asserts against by name), `game-script.md` (the pedagogical script, grounded
in Tal's *On Deliberation*), `../DESIGN.md` (Purple Agora — current, and what
the contrast auditor enforces), `chat-guide-rules.md` (ARCHIVED: describes the
chat deliberation, deleted 2026-08-16).

**Status: live.** https://agora-wizcol.web.app on project `wizcol-app` —
hosting, 13 functions, rules and 5 indexes deployed, demo topic seeded.
No class has played it yet.

## What Agora is
  
A classroom deliberation game (`apps/agora`, Mithril + Vite SPA, Hebrew-first
RTL, port 3009). A teacher sends the class "through a time tunnel" to a
historical crisis (demo: French Revolution 1789). Students meet two opposing
characters, hear their positions, then their *needs* (the pedagogical pivot),
position themselves between the camps, and deliberate: propose solutions,
rate others, improve each other's ideas — aiming for a solution both camps
can live with. Cross-camp support ("bridging") is worth ~2× same-camp.
Grounded in Tal's deliberative theory: needs vs. positions, criticism as
service, expanding agreement, honest disagreement as an achievement.

## Village personal writing desks (2026-09-10)

`prototypes/olive-hill/writing-desks.js` builds timber desks, a personal paper
and pen in the writing stations. `world-scene.js` paints confirmed own text,
anchors a comic invitation to the station guide, and opens the paper from a
nearby desk click, the bubble, or the keyboard-accessible entry button.

The embedded `agora-village-write` message carries the current plan item ID.
`VillageShell` checks source/origin and the live item, opens the existing
RoundStage/QuestionStage/Deliberation writer and focuses it. Deliberation's
`writeRequest` returns to the personal editor without advancing the lap.
Past items are read-only through the normal entry route. Repeated questions
keep distinct IDs. No demo localStorage or parallel proposal persistence is
used; existing confirmed saves and point awards remain authoritative.

Verified in a separate local session: physical desk click, character bubble,
story save/reopen, empty needs paper, proposal creation (+3 points), and
editing the same proposal from the desk. Agora tests (325), lint, typecheck
and build pass. This is a client-only change; publish Agora hosting when ready.

## Question-led scenario authoring (2026-09-10)

The new-scenario wizard asks for a question (`statement`, max 200) and its
purpose/context (`description`, max 2000). `agoraGenerateTopicPackage` sends
both as structured topic data to `topicPrompt.ts`. The prompt follows WizCol
without vision, stays within the teacher's scope, and no longer requires a
historical episode, time tunnel or national health gauges. Short illustrative
voices and needs remain compatible with the existing scenario scenes.

The server pins `title` and `challengeQuestion` to the teacher's statement and
stores `authoringBrief` separately from the editable AI draft. The editor
shows the original purpose for review. A missing AI key now returns an error;
it must never substitute the unrelated French Revolution fixture. Old clients
sending `{topic, language}` are still accepted during rollout.

`topicStagePlan(topic)` is shared by StartGame and the create-session fallback:
new packages with an authoring brief use scenarioWizcol with ONLY vision
removed; older packages keep their defaults. StartGame caches plans by topic
id so switching scenarios neither leaks vision back in nor loses manual edits.
Proposal development, mutual improvement, evaluation and further refinement
remain the existing deliberation cycles before voting.

Validation: Agora lint/typecheck/tests/build; shared-types `agoraTopicPlan` and
`agoraRounds`; functions `topicGeneration`; `scripts/e2e-authoring.mjs`.
Deployment requires rebuilding/packing shared-types, deploying
`agoraGenerateTopicPackage` and `agoraCreateSession`, and Agora hosting.

## Teacher self-serve classes (2026-09-07)

Tal's rule: **the admin creates the school and attaches its teachers; each
teacher then opens their own classes.** Before this, only a sys-admin could
open a class (Studio, by teacher email), so a teacher who signed up alone
saw "which class is playing?" with nothing but the guest journey — and guest
games have no roster, no careers, no real names on the console.

- **Schools carry their teachers**: `agoraSchools.teacherIds` + the
  `teacherMap` `{uid: true}` index (same shape as on a class; absent on old
  docs, read as empty). `agoraAdminManageSchool` gained
  `assignTeacher`/`removeTeacher` by sign-in email (resolved server-side,
  never stored); Studio's school page has the "teachers of this school"
  section.
- **`agoraTeacherClass`** (teacher callable, full account): `create` in a
  school whose `teacherMap` holds the caller (the only school is implied;
  more than one needs `schoolId`); `rename` / `archive` / `addTeacher` (by
  email) / `removeTeacher` (by uid, never the last one) for the class's own
  teachers. Class = `gradeLevel` (the grade) + `name` (the label); the
  unique 6-char class code is issued exactly as on the admin path — one
  helper serves both.
- **Dashboard** reports `schools` so the start screen knows whether "new
  class" is allowed: my classes first, then "＋ new class" (inline form:
  grade, label, school when there is more than one), then the guest journey
  last. No school → a quiet "ask your admin" line. The class page keeps
  rename, archive and co-teachers behind a cog, like the console.
- Students still claim roster spots with the class code at their first
  game; nothing changed in the join flow.
- **Verify:** `npx tsx scripts/e2e-teacher-classes.mjs` (or the extended
  `e2e-class-career.mjs`); Studio typecheck/build.
- **Deploy:** functions `agoraAdminManageSchool agoraTeacherClass
  agoraTeacherConsole`, then `deploy:agora` and the Studio hosting.

## WizCol rounds (2026-09-06) — the book's process is the default game

Tal's guide *התהליך הדליברטיבי הבסיסי* (WizCol, v2.0) moves a group from
personal stories to needs, a shared vision, and only then to solutions rated
on a scale that protects the minority. In Agora that is a **self-paced
digital sequence** — no tables, no clocks, no spoken turns — and it adds NO
stage kinds: a round is a `question` item with a different evaluation type.
The default plan for a quick game is now

```
lobby → question(story) → question(needs) → question(vision) → deliberation → voting → results
```

(`stagePlanPreset('wizcol')`, item ids `round-story` / `round-needs` /
`round-vision`), and a scenario game runs its character scenes as the
prologue (`scenarioWizcol`). `StartGame` seeds both. `classic` and
`quickDecision` still exist; `AGORA_STAGE_ORDER` is untouched, so plan-less
and civic sessions run exactly as before. The book's opening (the goal is a
solution most can live with; listening is the work; what happens at the
end) lives on the lobby — a student card and the teacher's spoken lines.

- **One item, four kinds.** `item.kind` is `open` (absent — the admin's own
  question, rated −1…+1, banded C_p record: everything the question stage
  always did) or `story` / `needs` / `vision`. The kind decides the default
  prompt, the deal, the scale, what pays the author and what the AI writes,
  from ONE table both client and functions read: `AGORA_ROUNDS` (shared-types
  `rounds.ts`, `roundSpecOf(item)`, `evaluationScaleOf(item)`). `story`
  deals 3 and takes a like; `needs` and `vision` deal 6 and take a 0…1
  five-step rating. A round may leave `title` blank (`question_needs_title`
  is for `open` only); the Statement text falls back to the kind.
- **Ordinary Statements, ordinary evaluations.** Answers are option
  Statements under the item's question Statement at
  `${sessionId}--${uid}--${itemId}`; ratings are evaluations at
  `${uid}--${answerId}`. A like is `1`, an un-like is `0` — never a delete —
  so the pipeline's `mean × raters` IS the heart count (`roundLikes`). Unit
  ratings write their step verbatim. Nothing below the challenge question
  sees these: camps and C_p are gated on `parentId === challengeQuestionId`,
  and the client never draws `CpBands` for a round.
- **The reader's deal** is the square's own attention allocator
  (`rankStalls` — least-attended first, per-student tiebreak,
  `mergeLateArrivals`), frozen per item in sessionStorage
  (`lib/flows/roundFlow.ts`). "Read more" extends it by another sample.
- **Appreciation pays the author, not the reader.** A like on my story, or a
  rating ≥ 0.5 on my need or my vision, pays me `AGORA_POINTS.ROUND_APPRECIATION`
  (+1) into `points.appreciation`. The ledger is `roundAppreciations` on the
  AUTHOR's participant doc keyed by evaluation id (rules-pinned), so a
  re-rating cannot pay twice and a later downgrade never claws back. Round
  ratings do NOT earn the reader's `RATING_CREDIT` — 3 + 6 + 6 would exhaust
  the cap before the square opened. `fn_onAgoraEvaluation` branches on the
  round item before the square's economy and returns; an open question keeps
  its effort credit.
- **Closing** goes through `closeQuestionStage` for every question item and
  dispatches on the kind: open → the banded record as before; a round → every
  answer travels (`outcome.selected` = all rows by `rankRoundAnswers`), no
  bands, and the AI record depends on the kind — stories: one warm paragraph
  on what the class has lived through; needs: a clustered list, one `• need —
  sentence` per line; vision: ONE merged shared vision. Fixture without a
  key: the texts joined. `CarriedContext` renders the record (pre-line) plus
  a folded "all N" list, which is how the needs list and the vision sit beside
  the deliberation pen and on the results.
- **Teacher and projector.** The plan editor's question row has a kind
  select; class pips read `roundProgress` for a round; the carry panel shows
  hearts or means and the record once closed; the projector shows numbered
  texts, never names.
- **Verify:** `npx tsx scripts/e2e-wizcol.mjs`;
  `npm run fast -- --plan=wizcol --stage=question --open`.
- **Deploy (hosting first):** shared-types build → functions prebuild →
  `deploy:agora` → `deploy:rules:prod` → `deploy:f:prod -- agoraCreateSession
  agoraUpdateStagePlan agoraAdvanceStage onAgoraEvaluationWritten`.

## Stage plan (2026-09-02) — the stages are the admin's to arrange

The order of stages is no longer hardwired. A session may carry an explicit
`stagePlan` (an ordered list of items — `lobby`, the scenario stages,
`question`, `deliberation`, `voting`, `results`; `ended` is appended at
resolve time and never stored) plus `stageIndex` (the room's position) and
`stageState[itemId]` (server-written runtime state: `openedAt`, a question's
`outcome`, why voting opened). A session WITHOUT a plan resolves to the
legacy order via `resolveStagePlan` — every session written before this,
and every civic session, runs exactly as before. `session.stage` keeps
mirroring the kind of the current item, so every `stage !== deliberation`
guard still holds.

- **One move path**: `functions/src/agora/stageAdvance.ts` `advanceSession`.
  The teacher callable, the auto-open trigger and the hourly sweep all call
  it. The pointer moves in a transaction guarded by the position the caller
  saw (a lost race is `stale`, not an error); side effects (close the question
  just left, draw the ballot, compute results) run after the commit. The
  legacy `{stage}` request shape still works (Odyssey's admin sends it).
- **`question` stage**: admin-authored question + explanation. Its Statement
  (`StatementType.question`, child of the session root) is created when the
  plan is set; answers are `option` children of it at deterministic ids
  `${sessionId}--${uid}--${itemId}`; ratings are ordinary evaluations, so the
  shared pipeline computes their numbers. On advance, `closeQuestionStage`
  ranks by net agreement, applies the admin's cutoff (`selectCarriedAnswers`,
  shared-types), writes an AI summary (fixture = the answers joined) into
  `stageState[itemId].outcome`, marks `isChosen` and `results` on the
  question Statement. Later screens show it as the `CarriedContext` card.
  Answers never enter the square's economy: `fn_onAgoraEvaluation` and
  `fn_onAgoraProposal` gate on `parentId === challengeQuestionId`, and
  `classScore.ts` filters proposals/evaluations by the same parent.
- **Auto-open voting**: a deliberation item may carry `votingTrigger`
  `{enabled, singleMin 0.85, pairMin 0.5, minRaters 3}` in NET agreement (the
  students-only `agoraScores.classConsensus.mean`, no C_p). Evaluated in
  `fn_onAgoraEvaluation` after each score commit (sibling scores read AFTER
  the commit, own score substituted). One proposal ≥ singleMin → a
  for/against ballot on that proposal; two ≥ pairMin → pick one. The teacher
  panel shows the same rule live via `evaluateVotingTrigger`; the manual
  button is the backstop (hot-reload gotcha below).
- **For/against**: a one-candidate ballot counts `VOTE_AGAINST` (`'against'`)
  as a sentinel in the same vote doc; `ballotTallyIds` adds it to the tally,
  `pickVoteWinner` adopts only on a strict majority and reports `rejected`.
  `fn_vote` now skips the isVoted/topVoted marking for sentinel keys.
- **Quick game**: `agoraCreateSession` accepts `quick {title, mainQuestion,
  explanation?, language}` instead of a package and writes a minimal
  `kind: 'quick'` topic shell (two placeholder characters, no scenes, no AI
  raters seeded). Flow forced to no stances/needs/elders/framing, so
  `scoreMode` is the new third mode `agreement`: results are
  `session.agreement` (ranked by net agreement + the vote), screen
  `views/AgreementResults.ts`, computed by `agreementResults.ts`.
- **Named rooms**: `identity: 'named'` — the join screen asks for a name,
  `agoraJoinSession` stores it as `anonName` (+`displayName`), cards show it.
  Those names are readable by any signed-in user who knows the session.
- **Free navigation**: `lib/flows/stageNav.ts` (pure) + `components/StageNav`.
  Opened stages are doors; the player's choice lives in sessionStorage and is
  carried forward when the room advances. A past stage renders read-only
  (deliberation → `ResultsBoard`, question → ranked list + outcome, voting →
  tallies).
- **Admin UI**: `/teach/start` has Scenario / Quick game, names, and the
  `StagePlanEditor` (reducer `lib/flows/stagePlanEditor.ts`; presets
  `classic`, `quickDecision`). The live board shows the plan rail, the
  question's ranked answers with "travels forward" marks, the trigger line,
  and "edit upcoming stages" (`agoraUpdateStagePlan`, frozen prefix).
- **Rules**: `stage`, `stageIndex`, `stagePlan`, `stageState`, `identity`,
  `agreement`, `roundNumber` are pinned server-owned on `agoraSessions`.
- **Client parse**: `lib/session.ts` uses `safeParse`; an unknown `stage`
  kind shows a "refresh" screen instead of bricking the tab. **Deploy hosting
  before functions** whenever a stage kind is added.
- **Shared pipeline fix** (`functions/src/evaluation/statementEvaluationUpdater.ts`):
  the missing-averageEvaluation repair used to be scheduled with
  `setImmediate` from INSIDE the transaction and overwrote the first rating
  on a fresh option with a zero block whenever a sibling was rated in the
  same second. It now runs after the commit, skips the option just updated,
  and conditions each write on `lastUpdateTime`.
- **Verify**: `npx tsx scripts/e2e-stage-plan.mjs` (the Vosh scenario, 53
  assertions), `npm run fast -- --quick --stage=question --open --shot=q`.

## Teacher screens simplified (2026-09-07) — one console, a three-line start

Built on `feat/agora-teacher-simplify`, **NOT deployed** (client only: `deploy:agora`).
Tal's verdict was "not simple enough for the teachers"; the UX audit measured the
advance button 1,200–1,400px down on every stage and ~48 controls before "Open
journey" on the start screen, one of them required.

- **Console** (`views/teacher/TeacherSession.ts`): `TeacherNav` carries the join
  code as a tap-to-copy pill (`code` attr), the projector button and the cog
  (`menuItems` fold them into the ≡ menu on a phone). `TeacherStrip.ts` is the
  only navigation — "step i of n · name" (tap = read-only step popover) and the
  ONE primary button, sticky under the header, a fixed bottom bar ≤600px.
  `NowCard.ts` opens the board: one sentence (`teacher.now_*`), "3 of 4 finished",
  chips of the unfinished (tap = thread drawer); the lobby variant is the QR +
  code + "n joined". Class / "what they wrote" / settings open in
  `TeacherPanel.ts` — a side panel over the board (no scrim on desktop, a sheet
  on a phone; the thread drawer still layers over it). The students' words fold
  behind `.teacher-peek`. Gone: the tab strip, the rail card, the code panel.
- **Start** (`StartGame.ts`): scenario rows + "my own question" row → class chips
  → button → muted summary line → a closed "advanced settings" card holding the
  plan editor, names, devices, colours, rounds. `classChoice` defaults to the
  route class, else the only class, else `'none'` when the teacher has no school
  (so a guest teacher's button is live at once); "no class" is never highlighted
  by default otherwise.
- **Dashboard** (`TeacherHome.ts`): live-lesson banners first, a dismissable
  first-run strip (`localStorage agora.teacher.firstRunDismissed`), scenario rows
  navigate straight to `/teach/start?topic=`, past lessons name the scenario.
- **Vocabulary**: teacher-side keys say lesson / step / class / agreement; the new
  `teacherStage.*` block (`lib/teacherSteps.ts`) names steps in the teacher's
  words while `stage.*` stays the students'. `StagePlanEditor` uses it too.
- **Styles**: `_teacher-strip.scss`, `_teacher-panel.scss` (new), additions in
  `_teacher-nav.scss` / `_teacher-dashboard.scss`; tokens `--teacher-nav-h`,
  `--teacher-strip-h`, `--z-panel`. `.teacher-tabs` deleted. The gauntlet has
  the new surfaces; `teacher-panels__badge` joined the pink ledger.
- **Scripts**: the walk is now tap scenario → `/teach/start` → one primary click →
  `/session`. `.teacher__code` still exists (lobby now card); the cog is
  `.teacher-nav__cog`; `.teacher-instructions` needs `.teacher-peek__summary`
  clicked first; the count is `.teacher-now__count(--all)`.
  `npx tsx scripts/teacher-shots.mjs --out=teacher-shots/after` shoots every
  teacher screen, desktop and phone (one rated session walked forward — a second
  rated session never settles behind the first one's trigger backlog).
- **Gotcha**: a keyed `.map()` spread beside unkeyed siblings makes Mithril throw
  "vnodes must either all have keys or none" and the dashboard sits on a spinner
  for ever. Nest the array instead of spreading it.

## Teacher console (2026-09-03) — names, moderation, notes, projector

Built on `work/2026-09-03`, **NOT deployed**. Four things a teacher can now do
from `/teach/session/:id`, and the wall can show:

- **Real names, teacher-only.** The join screen asks every student for a real
  name (skippable; `lib/flows/joinName.ts` decides when; `session.collectRealNames`
  is the per-lesson switch, default on, never on civic). `agoraJoinSession`
  writes it to `agoraIdentities/{sessionId}--{uid}` with `teacherId`
  denormalised — the rule is `resource.data.teacherId == request.auth.uid`,
  which the console's SDK listener (`sessionId == && teacherId ==`) can prove.
  Never on the participant doc, never in a statement, never in a log or a
  prompt. `expiresAt` = lesson end + 30 days for a Firestore **TTL policy that
  still has to be created** (`gcloud firestore fields ttls update expiresAt
  --collection-group=agoraIdentities`); the console's "forget names" deletes
  them now. Named rooms send the typed name as both `displayName` and
  `realName`.
- **Moderation.** `agoraModerateStatement` (session teacher only): `hide`
  blanks `statement` on the world-readable doc, sets the shared `hide` flag
  (the ballot selector already honours it) plus `agoraModeration.hidden`,
  flags `agoraScores.hidden`, darkens the `edit` announcements under it, and
  files the words and the reason on the private thread — the ONLY copy.
  `restore` reads them back from there. `edit` rewrites and stamps
  `agoraModeration.editedAt`; `isTeacherTouched(before, after)` (shared-types)
  makes `fn_onAgoraProposal` skip revision credit, weave credit and the
  elders for a teacher's write (it still announces a rewrite). Hidden text
  is out of `classScore`, `agreementResults`, `closeQuestionStage`, the
  auto-open voting rule and the evaluation trigger (a rating on it moves
  nothing). Hiding a ballot candidate is refused (`on-ballot`) — close the
  vote first. Rules pin `hide` + `agoraModeration` and refuse ALL client
  deletes of agora statements (the teacher's inherited admin subscription
  used to make `isAuthorized()` a silent hard delete).
- **Private thread.** `agoraTeacherMessages/{id}`, one doc per line, both
  keys (`teacherId`, `studentUid`) pinned, readable by either side, written
  only by `agoraTeacherMessage` (teacher note / student reply, quick
  phrases as `presetKey` rendered in the student's language, thread capped)
  and by the moderation callable (notices). NOT in `statements`: that
  collection is world-readable and every student's deliberation listener
  pulls the whole session. The student gets an `inAppNotifications` doc
  (`agora_teacher_*` triggers — in `notificationCopy.ts` `LOOKS` or the
  client drops it), a toast, an inbox row with target `{kind:'teacher'}`,
  a mail door beside the stage nav on every stage (`StageNav.mail`), and
  `components/TeacherThreadSheet.ts` to read and reply.
- **Console.** `TeacherSession.ts` shrank (voting cards → `VotingCards.ts`,
  question/trigger → `DeliberationCards.ts`) and grew three tabs: Board
  (as before), Class (`ClassPanel.ts`: pseudonym → real name, a pip per
  opened stage from the pure `lib/flows/classProgress.ts`, ratings given,
  points, idle, unread-reply badge) and Messages (`MessagesPanel.ts`: every
  student line from the pure `lib/flows/moderationQueue.ts`, reword / take
  down with reason / put back / message). `StudentThreadDrawer.ts` is the
  per-student thread. All reads are the listeners the console already held
  plus `lib/teacherConsole.ts` (identities, threads).
- **Projector.** `/teach/screen/:id` → `views/teacher/ProjectorScreen.ts`:
  the room's current stage as a seatless student would see it (lobby map,
  scenes via `TeacherInstructions {projector:true}`, needs board, camp
  census, ranked answers by number, the live square, the ballot via
  `Voting {board, projector}` — reveal follows the class setting — and the
  results), a join-code strip on every stage, no stage nav, no HUD, no
  names. `projectorImports.test.ts` pins that it never imports the
  notification, inbox, seen-state or teacher-console modules. Opened from
  the console's code panel ("Open projector" / copy link).

**Verify:** `npx tsx scripts/e2e-teacher-console.mjs` (identities + rules,
thread both ways + classmate refused, hide/restore incl. results exclusion,
teacher edit pays nothing, marks pinned, no hard delete, forget names,
projector when vite is up); `npm run fast -- --names --open` puts real
names on the Class tab; rules in `tests/rules/agora-teacher.test.mjs`.

**Deploy (in this order):** shared-types build → `deploy:rules:prod` →
functions `agoraJoinSession agoraTeacherMessage agoraModerateStatement
onAgoraProposalWritten onAgoraEvaluationWritten agoraAdvanceStage
agoraResolveSuggestion agoraCharacterReview agoraTeacherConsole
agoraCreateSession` → `deploy:agora` → the TTL policy. New queries are
equality-only (no composite index expected); never `--force` an index deploy.

## Current game flow (as implemented)

**Teacher** (`/teach`): Google sign-in → pick a ready topic package → open
session (join code + QR stay on the board through ALL stages for latecomers)
→ advance stages with one button: lobby → framing → perspectives → needs →
positioning → deliberation (auto-starts, no round management) → results.
A **class-progress card** (per-student chips) shows who finished the current
stage's self-paced steps — scene stages read `participant.stageProgress`
(written by SceneStage via `reportStageProgress`), positioning reads
`campPosition`, deliberation reads "has a proposal" — so the teacher knows
when to advance. Participant count is students only (AI raters filtered).

**Student** (`/join/<code>`, anonymous): lobby (marker on the era map) →
scenes (framing/perspectives/needs, self-paced, dialogue reveals) → **needs
board** (both characters' needs side by side; reachable later via one tap
everywhere) → positioning (slider labeled with character names + camp) →
**deliberation: the personal-lap square** (`views/Deliberation.ts` — propose →
weigh a few classmates' → help someone, in laps; ownership said
conversationally) → results.

Key deliberation mechanics (NOTE: the "chat-guided square" described below was
REVERTED on 2026-08-05 and its code deleted on 2026-08-16 — the places UI is
what ships. Kept for the reasoning; see feedback-cycle.md for what runs. The
"places" UI (placeBanner scenes, shell washes, travel splashes, delib-nav
tabs, the 5-lap cycle) is GONE; students still couldn't reliably separate
"mine" from "others", so ownership is now stated CONVERSATIONALLY. A
scripted guide persona (🦉, `chat.guide_name`, i18n templates with rotating
phrasings — NOT AI-generated) drove `views/DeliberationChat.ts` (deleted):
1. intro → proposal composer (needs board one tap away),
2. thanks → deals classmates' proposals ONE AT A TIME as rate cards, each
   verbally framed "a classmate's 📙 + number"; the student's echoed
   words/ratings sit in blue --mine bubbles on their side,
3. any rating below +1 (everything except 😍) → "how could it improve?"
   quick-reply → optional improvement composer (this is now the main path
   into helping; there is no separate help lap),
4. after a soft goal of 3 ratings (guided opening auto-deals) → the MENU:
   rate more (live count) / what my proposal received (badge = open
   suggestions) / improve mine / ask the characters (stale dot) / proposals
   I helped (change badge) — options appear conditionally, plus one nudge
   line (priority: opening ratings → fresh feedback → unasked characters →
   under-rated proposals → generic).
Engine was `lib/chatFlow.ts` (deleted with the view; its lesson — a pure
state machine, no Mithril/Firestore, tested in node — survives as
`lib/flows/deliberationFlow.ts`, which runs the shipping square's laps) —
module singleton, sessionStorage persistence
(`agora_{sessionId}_chatflow` + `_chatlog`, transcript stores i18n KEYS so
a language switch re-renders the whole log; resolved variant keys replay
the same phrasing after refresh). `state.dealtIds` guards against the
evaluations-snapshot lag re-dealing a just-rated proposal. Bootstrap waits
for `statementsLoaded && evaluationsLoaded` (new flags in proposals.ts);
with no stored chat but an existing proposal → "welcome back" straight to
the menu. Cards in the transcript persist only REFS and re-render from
live state (old cards inert via `.chat-card--inert`, rate cards stay
readable with the chosen emoji highlighted). Typing indicator (550ms per
guide line, view-only, instant under reduced-motion), auto-scroll only
when already near the bottom. `JourneyStrip` + `StageTransition` +
`ScoreHud` unchanged (HUD step mapped from chat phase).
- **My proposal card** (menu → improve mine): my proposal in an
  ALWAYS-EDITABLE box (live text pre-filled; "Update
  proposal" enabled only when changed, celebrates + verdicts go stale).
  **My feedback card** (menu → my feedback): scoreboard panel (camp
  columns + bridge-power meter + aggregate ratings-moved line) →
  "suggestions received" stream, newest first, with
  "I'll implement / Thanks / No thanks" (declined — quiet, no points;
  accepting celebrates the suggester with a glitter popup; the edit box is
  right above for weaving the idea in) → ask-the-characters buttons
  (in-character AI verdicts, score 0–100 + advice; their rating enters the
  REAL evaluation pipeline as 3 camp raters each; stale after edit → "text
  changed") → collapsible needs board.
  **Pedagogy rule (Tal, 2026-07-13): the AI never WRITES for students** —
  the improve-my-wording and phrase-my-suggestion buttons were removed
  ("otherwise they will not think"). AI opinions/critique live only in the
  in-character reviews. The numbers-only reception forecast
  (`agoraEstimateReception`) was ALSO removed from the client (Tal,
  2026-07-28 — it duplicated the character reviews' scores); the callable
  plus `agoraWritingAssistant` remain deployed but uncalled (keep both in
  source or deploys will demand a functions:delete).
- **The collaboration loop (2026-07-13)**: helper B and owner A iterate.
  B's sent suggestions live in the "Proposals I helped" menu branch: live
  status chips (the acknowledgment), the proposal's
  CURRENT text with an "improved since your idea" marker (compared against
  suggestion.createdAt — NOT lastUpdate, which resolution bumps), an inline
  compact re-rate scale (overwrites the evaluation; the onWrite bridging
  trigger diffs before/after) and a FREE follow-up box.
  B gets a local toast + a menu badge when a helped proposal is
  edited (client-side detection, sessionStorage watermark — no backend).
  A sees an AGGREGATE-ONLY "N ratings updated since your last improvement"
  line in the scoreboard (studentEvalTimes from ONE session-wide
  evaluations listener; AI raters excluded via isAgoraAiUid; individual
  votes stay anonymous by design — Tal's decision).
- **Rate**: five-level emoji scale (−1…+1 half steps), least-rated-first
  candidate ordering with per-student tiebreak (now `lib/squareOrder.ts`);
  the guided opening asks for 3, then rating continues
  through the menu while candidates remain.
- **Helping** now happens through the improvement prompt after a
  below-top rating ("How could this proposal serve BOTH camps better?" +
  don't-attack hint) and through follow-ups in the helped branch.
- **Results**: three outcomes — success / honest disagreement (dignified
  "dusk" map + achievement framing) / collapse — plus a warm AI class
  debrief (what went well / what to try next time). Class score = 0.45
  bridging + 0.25 points + 0.3 plausibility, threshold 70.

**Game feel — "Festival Day" theme (2026-07-13, replaced Era-of-Lanterns
night look)**: light, playful, for ages 12-15. Day-sky page background with
cloud puffs + a 5-hue sparkle field; white cards, navy ink text;
"candy-press" buttons (solid ledge underneath, squashes on tap); the era map
is a sunny meadow scene (sun, sand plaza, purple-pennant palace, teal-roof
assembly); rating emojis wiggle on hover; done-pips are little suns;
celebration confetti bursts in all five theme hues. A panoramic world-strip
of the era map still crowns every in-game screen; HUD with 5 lap-pips +
step chips + fuse + points.

**Ownership identity system (2026-07-13/14, playtest-driven — students
couldn't tell "mine" from "others")**: BLUE = MINE (📘), ORANGE = A
CLASSMATE'S (📙), used consistently everywhere: card ribbons
(`border-inline-start`, RTL-safe), owner chips (`.owner-chip--mine/--peer`
with `delib.owner_mine`/`delib.owner_peer` labels), delib-nav active tabs
(Mine=blue / Others=deep orange `#b05e0d` for AA), an ambient fixed
3px mode strip (`.shell--mode-mine/--mode-peer` sets `--mode-accent`),
mobile bottom-bar edge, scoreboard chips, the rate card (chip + proposal
number), helped items, suggestion-stream items, and even map dots
(my idea-dot blue, classmates' orange). CRITICAL COLOR RULES: camps are
royal purple (`--camp-left`) vs teal (`--camp-right`) and must NEVER share
hues with ownership blue/orange; notification badges are danger-red, never
a camp color. Tokens: `--lantern*` values were REDEFINED to the mine-blue
family (name kept — ~100 usages mean "primary accent = mine");
`--mine*`/`--peer*` aliases exist for new ownership CSS. Every `*-glow`
token now holds the DARK text-safe shade of its family (light-theme role
flip); all pairs measured WCAG AA. Anonymity unchanged: proposals by
number, never names.

## Architecture cheat-sheet

- **Client**: `apps/agora/src` — `views/GameController.ts` (student stage
  router + world strip), `views/Deliberation.ts` (the square: my proposal /
  the market / helped threads) + `lib/flows/deliberationFlow.ts` (pure lap
  state machine; cycle state in sessionStorage) + `views/ThreadChat.ts`
  (per-helper threads), `views/teacher/TeacherSession.ts`,
  `lib/session.ts` (single session+participants listener; **filters `isAI`**),
  `lib/proposals.ts` (deliberation listeners + writes), `lib/celebration.ts`
  + `components/Celebration.ts`, `components/NeedsBoard.ts`, `components/EraMap.ts`
  (svg map; `crop:'bottom'` for the strip), local i18n dicts in `lib/i18n.ts`
  (6 languages — every new string goes into ALL of them).
- **Functions**: `functions/src/agora/` — `fn_agoraCharacterReview.ts`
  (in-character review + 3 synthetic raters per character, uids
  `agora-ai--{charId}--{1..3}`, seeded as `isAI` participants at session
  creation), `fn_onAgoraEvaluation.ts` (bridging trigger, camp read
  server-side), `classScore.ts` (results batch: plausibility + health
  metrics + outcome rule + debrief), `fixtureTopicPackage.ts` (deterministic
  French-Revolution package when `OPENAI_API_KEY` absent).
- **Shared types**: `packages/shared-types/src/models/agora/` — constants
  (`AGORA_CYCLE`, `AGORA_AI_REVIEW`, `AGORA_OUTCOME`…), `agoraOutcome.ts`
  (pure outcome rule, unit-tested), `agoraCharacterReview.ts`,
  `agoraBridging.ts`. Proposals/ratings reuse `statements` + `evaluations`
  (deterministic eval ids `${uid}--${statementId}`); evaluations MUST carry
  the `evaluator` object or the shared pipeline throws.

## How to run / verify

**Start here: `npm run fast`.** It builds a session that is ALREADY at the
stage you want — bot classmates enrolled, positioned across both camps, their
proposals posted — and prints a join URL you can open in any browser. ~4
seconds, versus the minutes it takes to click a teacher and two students
through framing → perspectives → needs → positioning to reach the same screen.

```bash
npm run fast                              # deliberation, 4 classmates, 3 proposals → join URL
npm run fast -- --stage=positioning       # any stage
npm run fast -- --open --mine --shot=x    # drive a student there, give them a proposal, screenshot
npm run fast -- --open --keep --lang=en   # leave a real browser open to poke at
```

`--mine` matters: the classmates' side (rate / feedback / helped) is gated
behind having written your own proposal, so without it most of the
deliberation is unreachable. Flags: `--students`, `--proposals`, `--position`,
`--lang`, `--mobile`, `--no-seed`.

Every script here now starts with `preflight()` (`scripts/lib/preflight.mjs`),
which checks the emulators, the functions bundle, vite and the seed BEFORE
doing any work — and auto-seeds when the topic package is missing. A stack
problem now fails in seconds with the command that fixes it, instead of
surfacing minutes later as an unrelated-looking stack trace. Run it alone with
`npm run preflight`.

For the full honest path (real UI, every stage, assertions), it is still
`node scripts/walkthrough.mjs` — fastlane skips SETUP, never the thing under
test.

1. Emulators (auth 9099, firestore 8081, functions 5001) — usually already
   running from the repo root; functions hot-reload after
   `cd functions && npm run build`. `functions/.env` HAS an OpenAI key →
   real AI; remove env to get deterministic fixtures.
2. Dev server: `cd apps/agora && npx vite --port 3009` (detach with
   nohup if a background task might be killed).
3. Seed demo topic: `FIRESTORE_EMULATOR_HOST=localhost:8081 npx tsx scripts/seed.ts`.
4. **Full e2e**: `node scripts/walkthrough.mjs` — drives teacher + 2 students
   through the whole game via the real UI with assertions + screenshots into
   `walkthrough-shots/`. Let vite settle a few seconds after source edits
   before running (cold-transform race); the script retries teacher-home once.

## Gotchas (hard-won)

- **Mithril keyed fragments**: never spread `...list.map(keyed)` among
  unkeyed siblings. Symptom: the whole screen goes blank mid-redraw
  ("In fragments, vnodes must either all have keys or none have keys"),
  which reads as a data bug — the ClassPicture went blank for a whole
  session this way, because the empty state has no keys and so nothing
  fails until the FIRST row appears. Hit 4×. The reliable fix is a
  wrapper element around the keyed children (`m('.thing-list', items.map(…))`),
  not a nested array in place — the wrapper also gives the group somewhere
  to hang its own spacing.
- Stale browser tabs after code changes look like data bugs (e.g. teacher
  showing 8 participants = 6 AI raters unfiltered by old JS). Hard-refresh.
- **PWA service worker poisoning (2026-07-13)**: a production-build SW once
  registered on localhost:3009 serves its stale precache FOREVER (dev
  changes "never arrive", even across restarts — teacher saw removed
  stages). Fixed twice over: dev server serves a kill-switch /sw.js
  (vite.config plugin) and src/index.ts unregisters SWs in dev. One plain
  reload heals a poisoned browser.
- **Firestore emulator OOM**: after ~a day of walkthrough runs the java
  emulator hits `OutOfMemoryError: Java heap space` — browsers time out
  ("offline mode") while curl still answers, export fails. Rescue small
  collections via REST (`Authorization: Bearer owner`), restart emulators
  (`firebase emulators:start --only hosting:dev,firestore,auth,functions,storage,database
  --project freedi-test` — the --project flag matters if the shell's active
  project is wizcol-app), PATCH the docs back, re-run seed. Sessions/auth
  users are wiped; topic packages are the only data worth rescuing.
- AI-rater pollution: any student-facing count/metric must filter
  `participant.isAI` / `isAgoraAiUid(evaluatorId)` (outcome stats do).
- With 2 students, honest-disagreement is mathematically unreachable
  (needs ≥2 proposals rated by BOTH camps); fine for real classes.
- Emulator REST list calls need `?pageSize=300` once data accumulates.
- Dialogue scenes need the '···' reveal clicks before the continue button.
- **`signInWithRedirect` can never finish on agora-wizcol.web.app
  (2026-08-26)**: the redirect handler runs on `wizcol-app.firebaseapp.com`
  and leaves the credential in THAT domain's storage; the app reads it back
  through a hidden iframe there, which third-party storage partitioning hands
  an empty store. `getRedirectResult()` resolves to null, so the teacher
  watches Google's screen take over the tab and lands back signed out.
  Reported from production as "the Google screen appeared again in the main
  window and pressing it did nothing". Popup is unaffected (it postMessages
  the credential home and needs no storage). Never make redirect a fallback
  here — `canCompleteRedirectSignIn()` in `lib/firebase.ts` guards it.
- **A returning teacher's link ALWAYS fails**: their Google identity is
  already its own account, so `linkWithPopup` on today's anonymous visit
  throws `auth/credential-already-in-use`. That is the normal path, not an
  edge case. The error carries the credential (`linkWithPopup` sends
  `returnIdpCredential: true`, so the backend answers 200 + errorMessage +
  `oauthIdToken`), so `GoogleAuthProvider.credentialFromError()` →
  `signInWithCredential()` finishes it with no window and no user gesture.
  Note `linkWithCredential` does NOT send that flag, so a probe built on it
  gets `credentialFromError() === null` and misleads.
- **The functions emulator serves whichever worktree launched it.** Work on a
  second tree and its new callables are simply 404 on 5001, which reads as an
  app bug rather than as the wrong emulator. Either restart the suite from your
  tree, or run a second one on free ports and point the scripts at it — every
  host is env-overridable:

  ```bash
  # firebase.e2e.json = firebase.json with auth 9098 / functions 5011 /
  # firestore 8091, no UI, no hosting/storage/database. Gitignored.
  firebase emulators:start --only firestore,auth,functions \
    --project freedi-test --config firebase.e2e.json
  npx vite --port 3010
  AGORA_AUTH_HOST=http://localhost:9098 \
  AGORA_FIRESTORE_HOST=http://localhost:8091 \
  AGORA_FUNCTIONS_HOST=http://localhost:5011 \
  AGORA_VITE_HOST=http://localhost:3010 npx tsx scripts/e2e-challenge.mjs
  ```

  The contrast and type audits take the URL as argv[1] and otherwise default to
  3009 — i.e. to the OTHER tree's mock page, which they will happily pass.
- e2e scripts import `scripts/lib/fastlane.ts`, so they need `npx tsx`, not
  bare `node`, whatever the older docs say.
- A REST PATCH with no `updateMask` REPLACES the document. On a session doc
  that wipes `teacherId` and the rules refuse it — silently, unless the script
  reads the response.
- Neutral runs reorder in Hebrew: "42 / 1500" becomes "1500 / 42" and "+3"
  becomes "3+". Isolate the RUN (`direction: ltr; unicode-bidi: isolate`), not
  the block — on the block it also flips which side `text-align: end` lands on.
  `@include type-meta` clears itself on descendants, so if you split a mark
  into a child span the exemption has to move down with it.

## Next steps (agreed direction)

1. ~~Workshop-screens redesign via Google Stitch~~ — DONE 2026-07-13 (shared
   skeleton, tabbed work area, unified feedback inbox, declined status).
   Not adopted from the Stitch export: sentiment-emoji rows on the help
   screen (rating stays its own step) and the fixed bottom nav.
2. ~~Mine-vs-others distinction~~ — DONE 2026-07-13/14 in two passes
   (ownership chips/ribbons, then the full Festival Day blue/orange
   re-theme). Worth a real-classroom re-test, incl. whether 📘/📙 emoji
   render on school Chromebooks (fallback pair if not: 💙/🧡).
3. **Update `../DESIGN.md`** — still documents the retired Era-of-Lanterns
   night direction; rewrite around Festival Day (palette + rules live in
   `src/styles/tokens.scss` comments and the HANDOFF game-feel section).
4. **Diverging camp bars** — show opposition (from baseline) vs support;
   "3 rated" with an empty bar currently hides active rejection (offered,
   not yet approved).
5. **Artwork generation** (`agoraGenerateArtwork`, gpt-image-1): painterly
   backdrops, character portraits, per-location vignettes — the biggest
   remaining "wow" upgrade; plan sketch in plans/agora-deliberative-game-plan.md.
   Prompts must now target the DAYTIME festival look, not night.
6. From the script's open questions: interactive needs check ("say it back
   until the Count agrees he's been understood"), teacher cards, narrator
   interstitials, evidence cards, bias-events deck, expanding-agreement
   (~80% net support) as the success verdict, two-lesson arc.
7. ~~Ops: agora functions not yet deployed anywhere~~ — DONE: 13 functions
   live on `wizcol-app` (see Status at the top).

### Deploying

The hosting site exists: **`agora-wizcol`** on project `wizcol-app`
(https://agora-wizcol.web.app), created 2026-08-14. Note the order of the
words — `.firebaserc` originally mapped the `agora` target to `wizcol-agora`,
which was never created, so the mapping was corrected to match the real site.

`.firebaserc` holds the target → site mapping and is gitignored, so a fresh
clone cannot deploy even after the site exists. Copy `.firebaserc.example`
(committed, same content minus anything machine-specific) to `.firebaserc`.

### A hot-reloaded functions emulator stops firing triggers

**Measured 2026-09-06 — it is latency, not death.** Requiring the functions
bundle takes ~12 s (`time node -e "require('./functions/lib/functions/src/index.js')"`),
longer than the emulator's default 10 s discovery window, so a fresh
`emulators:start` may report "User code failed to load" — start it with
`FUNCTIONS_DISCOVERY_TIMEOUT=90`. And every statement write fans out to a
dozen `statements/{id}` triggers that the emulator runs one at a time, so
after a run that wrote many statements an evaluation's event can wait
40–90 s for its turn (a single timed write on an idle suite: 41 s), while
every fastlane/e2e deadline is 45–60 s. The data is right when it lands;
the scripts just stop waiting. Run the heavy suites (`e2e-voting`,
`e2e-teacher-console`) alone on a drained suite, and read `firebase-debug.log`
(`Beginning execution` lines) before blaming a trigger. A Firestore emulator
that "never answers" preflight is the OOM gotcha below — restart that suite.

If Firestore triggers seem not to run — scores never appear, points never move —
check whether the functions emulator reloaded since the last one fired:

```bash
grep -c 'Beginning execution of "me-west1-onAgoraEvaluationWritten"' <emulator log>
grep 'Loaded functions definitions from source' <emulator log>
```

A `Loaded functions definitions from source` line AFTER the last execution means
the emulator hot-reloaded (any `npm run build` in functions/ will do it) and
quietly stopped dispatching background triggers. Callables keep working, which
makes it look like an app bug rather than an environment one.

The only fix is a full restart of the emulator suite. Measured either side of
one, on identical code: 10 writes/sec with zero triggers before, 2,417
writes/sec with every trigger firing after.

### Load smoke

`npx tsx scripts/load-smoke.ts [--students=30] [--proposals=10]` seeds a class,
has every student rate every proposal at once, and waits until each score
accounts for every rating it received. This is the "teacher says now rate them
all" case — the one where the trigger fan-out has to keep up.

Baseline 2026-08-16: 30 students, 10 proposals, 290 ratings accepted in 0.1s,
all scores settled 21.2s after the first write, nothing mis-counted.

### Indexes are NOT deployed by any script

`firestore.indexes.json` never reaches production on its own. `deploy:rules:prod`
deploys rules and storage only, and a plain `firebase deploy --only
firestore:indexes` would try to PRUNE the indexes that exist on wizcol-app but
not in the repo file — several of which other apps depend on. So indexes are
created surgically, one at a time:

```bash
gcloud firestore indexes composite create --project=wizcol-app \
  --collection-group=agoraSessions \
  --field-config=field-path=code,order=ascending \
  --field-config=field-path=createdAt,order=ascending
```

Agora's five (all created 2026-08-14, after a live session failed with
FAILED_PRECONDITION because none of them existed):

| collection | fields |
|---|---|
| agoraSessions | code + createdAt  ← blocks agoraCreateSession |
| agoraSessions | code + status |
| agoraSessions | status + lessonEndsAt  ← the hourly sweep |
| evaluations | agoraSessionId + evaluatorId |
| statements | agoraSessionId + statementType  ← the deliberation listener |

The last one backfills the whole statements collection and takes materially
longer than the others. Check state with:

```bash
gcloud firestore indexes composite list --project=wizcol-app
```

CI (`.github/workflows/agora.yml`) deliberately does NOT deploy: it runs lint,
typecheck, tests and build only. Deploying from CI would need a service-account
secret in GitHub, which nobody has set up, and the e2e scripts need an emulator
suite the workflow does not start.

## Recent commit trail (newest last)

Previous iteration:
- `62950a426` character reviews + three endings + debrief (+ evaluator-object fix)
- `460dbe14c` walkthrough script
- `0fb18696f` needs board + remove value-identification + scale labels
- `94881b35c` auto-start deliberation round
- `93fc41b6f` glitter celebrations
- `c07d9fd19` personal 5-lap cycles + pin always visible
- `ef5a13bd5` five-level rating scale
- `9122a0c83` my-proposal workshop redesign (UX-agent spec)
- `8f51a6f87` game-feel pass (world strip, HUD pips, stars, gold buttons)
- `0da1f7ac9` stale verdicts + improve-stays-on-screen
- `221c18c1c` Stitch brief

This iteration (2026-07-13/14, on `main-sign`):
- `7e18b7038` help screen — classmate's proposal + suggestion workshop in one box
- `6480732d0` collaboration loop findable — helped section on rate step, honest badge
- `3f6da4636` helped card order — proposal first, rate scale, then my ideas
- `d7b7bc084` proposals shown by number, not author name
- `67dea3b5b` characters judge by NEEDS with fair calibration
- `cfe9713ab` ownership identity v1 (gold lantern vs moon-silver scroll)
- `5e3ed9668` **"Festival Day" light re-theme — blue=mine / orange=classmate**
  (tokens rewrite, day sky, candy-press buttons, sunny EraMap, camps →
  purple/teal, 📘/📙 icons, WCAG-verified palette)
- `3504c7a35` removed accidentally-tracked .claude/worktrees gitlinks
