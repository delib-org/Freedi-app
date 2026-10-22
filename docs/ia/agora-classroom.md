# Agora: Classroom process (hybrid physical-digital lesson) — IA spec

Status: draft (section 9 answered by Tal 2026-10-21)
Date: 2026-10-21
Supersedes, for the classroom flow only: `agora-student-clarity.md` (every student screen: the stages it lists are replaced by the eight screens in section 7; its address and writing rules in 11.16 and its icon policy in section 12 are kept), `agora-notes.md` (the village, booths, desk/board, reading pile, ideas and conversations are deleted; the word פתק is retired, see section 3), `agora-results-board.md` (the results screen is replaced by the Summary in section 7; class points are deleted). Kept and still binding: `agora-teacher-home.md` (everything outside the live lesson: `/teach`, scenarios, classes, past lessons), `agora-teacher-sidebar.md` (the side bar; its "השיעור הזה" group now lists the console rows in section 5), `agora-lesson-builder.md` (the step list on `/teach/start`; this spec fixes which kinds the classroom template holds, section 2.3). Not touched: `agora-linked-app-stations.md` (the `linked` kind stays in the engine, it is not in the classroom template).

Scope: one 45-minute lesson, grades 7-9, 25-35 students on phones at physical tables, one teacher on a laptop with a projector. Source: Tal's process doc "Agora Classroom Deliberation — Hybrid Physical-Digital Process" and the hard-reset decision (keep the engine, rebuild the UI in Join's visual language). Method: read `agoraEnums.ts`, `stagePlan.ts`, `agoraSession.ts`, `agoraParticipant.ts`, `rounds.ts`, `agoraClassroom.ts`, `votingStage.ts`, `fn_agoraAdvanceStage.ts`, `fn_agoraSetRound.ts`, `stageNav.ts`, `TeacherSession.ts`, `GameController.ts`, `Positioning.ts`, and the Join routes.

## 1. Audiences
| Audience | One-line goal | Must never see |
|---|---|---|
| Student (12-15, Hebrew, phone, at a table) | Know what my table is doing right now and do the one thing asked of me | Classmates' real names; other tables' private step state; evaluation numbers while voting; anything the teacher has not opened |
| Student without a device, or late joiner | Be at a table and take part through a tablemate's device | A dead end ("no table") with no instruction |
| Teacher (non-technical, laptop) | Move the class through the steps, see every table at a glance, fix a table that is stuck | Engine ids, stage kind names, scoring formulas, student real names anywhere but the roster |
| Projector (no one; the class looks at it) | Show the one thing the class needs now | Private data, per-student numbers, anything that needs a tap |

Least expert reader: a 13-year-old on a phone with the teacher talking. Every student screen carries one instruction of at most 7 words.

## 2. Object model

### 2.1 Nouns
| Object | What it is | Cardinality | Lifecycle |
|---|---|---|---|
| Lesson (`AgoraSession`) | One run of one scenario with one class | 1 per run | open (code shown) → live → ended |
| Step (`AgoraStagePlanItem`) | One class-level beat; the teacher opens them in order | 8 per classroom lesson (2.3) | upcoming → current → done |
| Student (`AgoraParticipant`) | One person on one device; or a roster-only member without a device (`noDevice: true`, no uid), added by the teacher to a table | 25-35 per lesson | joined → placed at a table → (removed) |
| Side (`AgoraCamp` via `campPosition`) | Which of the two characters the student feels closer to; center allowed | 1 per student, picked at the Side step; picked again at the Summary | none → chosen → chosen again (end) |
| Table (`AgoraTable`, NEW) | 3-5 students at one physical table, mixed sides | 6-10 per lesson | proposed → set → (changed by teacher) |
| Table step (`AgoraTableStep`, NEW) | What one table is doing inside the Table talk and Proposals steps: `pick` → `talk` → `write` → `rate` | 1 per table | moves at the table's own pace; the teacher can move it |
| Turn (`AgoraTableTurn`, NEW) | One pass of the loop at one table: one asker, one question, every tablemate speaks, the table writes | 1-3 per table per Table talk step | current → done |
| Speaking time (on the table doc) | The current speaker and the moment their minute ends | 1 per table | running → over → next speaker |
| Question (guiding question) | A question the table talks about: the teacher's, or added by a student | 3-8 from the teacher + any number by students | teacher-written → used at table n (greyed at that table) |
| Answer | What a table writes to a question: one for the table, or one per student | 1 per table per turn, or 1 per student per turn | sending → sent → changed → rated |
| Proposal | What a student writes at the Proposals step | at most 1 per student | sending → sent → changed → rated → (on the ballot) → (decided) |
| Rating | One student's reaction to an answer or a proposal, 5 faces, -1..+1. A student's own proposal and their own table's answers are not in their list: the server writes a +1 rating by them for each (every co-author of a shared answer) | at most 1 per student per item | none → saved (or auto +1) → changed |
| Vote | One pick on the ballot | 1 per student | none → cast → changed (until closed) |
| Ballot (`session.voting`) | The proposals the class votes on, frozen when the Vote step opens | 1 | frozen |
| Decision | The ballot winner (or the most agreed proposal when no vote) | 1 | written once at the Summary |
| Side shift | Each student's side at the Side step vs at the Summary, summed for the class | 1 per lesson | computed when the Summary opens |

Deleted from the classroom UI (the engine keeps the fields; no screen reads them): village and world, booths, looks and themes, points, coins, inbox, notifications, toasts, celebrations, notes lottery (`agoraHands`), ideas and conversations on a note, cast and opening film, challenge round (`votingGame`), civic track, supervision links from the lesson, stage catch-up (`stageNav`: a student always sees the current step; the Table talk and Proposals steps are reached by table step, not by stepping back).

### 2.2 Mapping onto the Statement tree
```
root question Statement (session.rootStatementId)
  Table talk question Statement           item.statementId of the `question` item, kind 'inquiry'
    guiding question Statement (QUESTION) creatorId = teacher (from the plan) or a student (agoraTable set)
      answer Statement (option)           creatorId = the typist; agoraTable = {tableId, shared}
        evaluation docs                   ratings, -1..+1, shared pipeline → statement.consensus
  challenge question Statement            session.challengeQuestionId (deliberation item)
    proposal Statement (option)           creatorId = the student; agoraTable = {tableId, shared:false}
      evaluation docs                     ratings → agoraScores C_p (existing), bridging across sides
```
Not Statements: Lesson, Step, Student, Side, Table, Table step, Turn, Ballot, Decision, Side shift. Tables live in their own docs, `agoraTables/{sessionId}--{n}` (one listener per student for their own table, one query for the teacher); the student's `tableId` is also written on their participant doc so the existing session+participants listener tells a student where they belong. Both are written server-side in one transaction (`agoraAssignTables`, `agoraMoveStudent`, `agoraTableStep`: three new callables). Writing one shared answer records authorship as `creatorId` = the device that typed, `agoraTable.shared = true`, and the table's `memberUids` at send time as `agoraTable.coAuthors`. Nothing else is new on a Statement.

### 2.3 The four phases on the stage plan (fixed)
| Phase (Tal's doc) | Plan item kind | What the engine already does | What is new |
|---|---|---|---|
| 1.1 question, 1.2 dilemma video | `framing` | `SceneStage` intro + YouTube, `libraryVideo` follows the teacher | Only the intro and the dilemma scene are shown; `perspectives` and `needs` scenes are not in the template |
| 1.3 stance | `positioning` | `campPosition` 0..100 → `camp` left/right/center, written by the student | UI label "side"; the two ends are the two characters (as today) |
| 1.4 tables | `tables` (NEW kind) | — | `agoraAssignTables` proposes mixed tables from `camp`; the teacher moves students; students see their table |
| 2 table inquiry loop | `question` with `kind: 'inquiry'` (NEW question kind) | question Statement, answers as options, ratings, `selection` carries the top answers forward as context | guiding questions as child QUESTION Statements; table steps and turns; speaking timer; shared vs each writing |
| 3 proposals | `deliberation` | proposals under `challengeQuestionId`, ratings → C_p, bridging across sides, `votingTrigger` | table steps `talk` (screens down) → `write` → `rate`; `roundPhase` reused: `propose` = tables working, `improve` = plenum (4.1) |
| 4.2 ballot | `voting` | ballot frozen by `prepareVotingStage`, votes, win threshold | nothing |
| 4.3 reflection + decision | `results` | decision, tally, ranked proposals written once | the Summary opens with "pick a side again" (`campPositionEnd`, new participant field, optional) and shows the decision at once and the side shift as soon as anyone picked again, with "n מתוך m בחרו שוב" (a shared-types function over participants) |

New kinds: one stage kind, `tables`; one question kind, `inquiry`. Both are picklist values in shared-types: deploy shared-types to functions and rules before any client writes them (the strict-parse trap). Retired from the classroom template (kept in the enum for old sessions and other tracks): `perspectives`, `needs`, `valueIdentification`, `linked`, question kinds `story`/`needs`/`vision`, `AgoraRoundPhase.rate`, `votingGame`, `stageProgress`, `whereabouts`, `villageCall`, `villageNavigation`, `world`, `theme`. The classroom template (`AgoraStagePlanPreset`, new value `classroom`) is exactly: lobby → framing → positioning → tables → question(inquiry) → deliberation → voting → results. `validateStagePlan` gains: `tables` requires a `positioning` before it; `inquiry` requires `tables` before it.

### 2.4 Who moves what (fixed)
- Class-level steps: only the teacher, through `agoraAdvanceStage` (server transaction, forward only). One control, always the same place on the console.
- Table steps and turns: the **asker** (the student whose turn it is to pick the question) holds the table's forward control on their own device; the teacher can move any table or all tables from the console. Not any tablemate: one finger per table keeps the room calm, and the asker already reads the question aloud. Exception: when the speaking minute is over, any tablemate's device shows "הבא בתור" so a table is never stuck on a missing asker. The first asker of a table is the student with the earliest `joinedAt`; the asker rotates per turn.
- Speaking timer: 60 s per speaker (`AGORA_TABLE.SPEAK_MS`, teacher-adjustable per lesson); the table's step timer for `talk` = speakers × 60 s; the `talk` step of Proposals has one table timer (default 4 min) and no speaker order. Timers are moments (`speakerEndsAt`, `stepEndsAt`) written once on the table doc; every device counts down from the same clock. The end of a timer never advances anything on its own: it shows "הזמן נגמר" and the forward control.
- Writing mode (Table talk only): at the `write` step the asker chooses once per turn: "תשובה אחת לשולחן" (this device writes for the table; the others see the draft read-only and help aloud) or "כולם כותבים" (each writes their own, tablemates help aloud). Default: everyone writes. Proposals: everyone writes, always (Tal 3.2). A choice can be changed before the first send of that turn, not after.
- Rating: the class's answers (and, at Proposals, the class's proposals) are reachable from every table step through a sheet, at any time during the step; a student rates whenever they want. The table's `rate` step only moves the table's attention there, it is not a gate. The list is whole-class and keeps growing while other tables write. The teacher's "כל השולחנות: מדרגים" moves every table there.
- "שאלה משלנו": anyone at the table may add one at the `pick` step; the asker still picks which question the turn uses.
- A student without a device: the teacher adds them to a table from the Tables board ("בלי מכשיר"); they speak in turn like everyone; tablemates write for them (a shared answer, or a tablemate typing their answer); the teacher's console can rate on their behalf ("לדרג בשם …") from the What they wrote view. Low priority: build after the first lesson runs without it.

## 3. Labels
One name per concept across UI, i18n, routes and code. HE is primary and gender-neutral plural (per clarity spec 11.16). Strings live in `apps/agora/src/lib/locales/{he,en,ar,es,de,nl}.ts`; every key below is written in all six. Key families marked NEW are new; the rest reuse existing keys. Hebrew marked (?) needs a native read.

| Concept | EN | HE | i18n key | Route segment | Code type | Synonyms to retire |
|---|---|---|---|---|---|---|
| Lesson | Lesson | שיעור | teacher.title, dashboard.* (kept) | /teach/session/:id | AgoraSession | משחק, מסע, game, journey (`teacher.start_journey` → `console.start`) |
| Step (class-level) | Step n of 8 | שלב n מתוך 8 | teacher.step_of (kept) | — | AgoraStagePlanItem | stage, station, תחנה, ביתן |
| Open next step | Open the next step | פתיחת השלב הבא | teacher.open_next (kept) | — | agoraAdvanceStage | advance, skip_to_next |
| Opening | Opening | פתיחה | NEW opening.* | — | AgoraStage.framing | framing, scene, film, intro, מנהרת הזמן |
| Dilemma video | Watch together | צופים ביחד | opening.watch | — | libraryVideo | film.* |
| Side | Side | צד | NEW side.* (title "לאיזה צד אתם קרובים?") | — | AgoraCamp, campPosition | stance, עמדה, camp, מחנה, positioning in UI text |
| Pick a side again (reflection) | Where do you stand now? | לאיזה צד אתם קרובים עכשיו? | NEW side.again | — | campPositionEnd | rerate.* |
| Table | Table n | שולחן n | NEW table.* | /table/:n (teacher) | AgoraTable | group, team, קבוצה, צוות |
| My table | My table | השולחן שלי | table.mine | — | participant.tableId | — |
| Tablemates | At my table | מי בשולחן שלי | table.members | — | AgoraTable.memberUids | — |
| Split into tables | Split into tables | חלוקה לשולחנות | NEW console.split | — | agoraAssignTables | assign, grouping |
| Move a student | Move to another table | העברה לשולחן אחר | console.move | — | agoraMoveStudent | — |
| Table step | Now: … | עכשיו: … | NEW table.step_pick / step_talk / step_write / step_rate | — | AgoraTableStep | phase, mode, מצב |
| Pick a question | Pick a question | בחרו שאלה | table.step_pick | — | 'pick' | — |
| Talk (screens down) | Screens down. Talk. | מסכים למטה. מדברים. | table.step_talk | — | 'talk' | brainstorm, verbalize |
| Write | Write | כותבים | table.step_write | — | 'write' | — |
| Rate | Rate | מדרגים | table.step_rate, rate.* (kept) | — | 'rate' | evaluate, score, שקלו, הוקירו |
| Turn | Turn n | סבב n | NEW turn.* | — | AgoraTableTurn | round, סיבוב, הקפה |
| Asker | It's Dana's turn to ask | התור של דנה לשאול | turn.asker | — | AgoraTable.askerUid | active student, leader, מוביל, השואל (?) |
| Speaker | Dana is speaking | דנה מדברת (?) | turn.speaker | — | AgoraTable.speakerUid | — |
| Next speaker | Next speaker | הבא בתור | turn.next_speaker | — | agoraTableStep('next') | הדובר הבא, skip_speaker |
| Speaking time | Time to talk | זמן לדבר | turn.speak_time | — | speakerEndsAt | timer, טיימר, שעון |
| Time is up | Time's up | הזמן נגמר | turn.time_up | — | — | — |
| Table time | Table time | זמן השולחן | turn.table_time | — | stepEndsAt | — |
| Question (guiding) | Question | שאלה | NEW question.* (replaces today's question.* values) | — | Statement (question) | guiding question, שאלה מנחה (teacher text may say it once, in the builder) |
| Teacher's questions | The teacher's questions | השאלות של המורה | question.teacher_list | — | item.guidingQuestions | — |
| Add our own question | Our own question | שאלה משלנו | question.add_own | — | creatorId = student (anyone at the table) | — |
| Answer | Answer | תשובה | NEW answer.* | — | Statement (option) under a question | note, פתק, text, טקסט |
| One answer for the table | One answer for the table | תשובה אחת לשולחן | answer.mode_table | — | agoraTable.shared = true | shared device, team |
| Everyone writes | Everyone writes | כולם כותבים | answer.mode_each | — | agoraTable.shared = false | individual |
| Send | Send | שליחה | answer.send, proposal.send | — | — | שמירה, הוספה |
| Sent | Sent | נשלח | answer.sent, proposal.sent | — | isProposalConfirmed | על הלוח, נשמר |
| Class answers | The class's answers | התשובות של הכיתה | answer.class_list | — | — | הלוח, הכיכר, כל הפתקים |
| Proposal | Proposal | הצעה | NEW proposal.* | — | Statement (option) under challengeQuestionId; code already says `proposal` (`AgoraProposalScore`, `fn_onAgoraProposal`), so UI, i18n and code agree | פתרון, solution, פתק, בית המלאכה |
| My proposal | My proposal | ההצעה שלי | proposal.mine | — | — | הפתרון שלי, בית המלאכה |
| Class proposals | The class's proposals | ההצעות של הכיתה | proposal.class_list | — | — | הכיכר, כל ההצעות |
| Plenum | Everyone together | כולם ביחד | NEW console.plenum, projector.plenum | — | AgoraRoundPhase.improve | מליאה (teacher may say it; UI does not), open_floor |
| Top proposals | Top proposals | ההצעות המובילות | projector.top | — | agoraScores C_p order | leaders, הלוח |
| Vote | Vote | הצבעה | voting.* (kept; title "בחרו הצעה אחת") | — | AgoraStage.voting | ballot in UI, בחירות |
| Decision | The decision | ההחלטה | results.agreement_decision (kept) | — | voteWinnerStatementId | winner, המנצח |
| No device | No device | בלי מכשיר | table.no_device | — | participant.noDevice | — |
| Rate on behalf of | Rate for … | לדרג בשם … | console.rate_for | — | evaluation by proxy (teacher) | — |
| Summary | Summary | סיכום | NEW summary.* | /teach/report/:id (teacher, kept) | AgoraStage.results | results, תוצאות, מועצת הכפר, recap |
| Side shift | What changed | מה השתנה | summary.shift | — | sideShift() (shared-types) | convergence, התכנסות |
| Teacher console | The lesson | השיעור | console.* NEW family for console-only rows | /teach/session/:id | TeacherSession | board, panel, לוח המורה |
| Tables board | Tables | שולחנות | console.tables | ?view=tables | — | class view, הכיתה, roster |
| What they wrote | What they wrote | מה כתבו | console.texts | ?view=texts | — | panel_texts "טקסטים", proposals |
| All tables to a step | All tables: … | כל השולחנות: … | console.all_tables_to | — | agoraTableStep (teacher, all) | — |
| Projector | Projector | מקרן | teacher.open_projector (kept) | /teach/screen/:id | ProjectorScreen | screen, board |
| Join code | Code | קוד | teacher.session_code, home.* (kept) | /join/:code | session.code | PIN |
| Waiting for the teacher | Waiting for the teacher | ממתינים למורה | lobby.waiting (kept) | — | AgoraStage.lobby | lobby in UI |
| End the lesson | End the lesson | סיום השיעור | teacher.end_game (kept, value unchanged) | — | status ended | — |

Rule: the word for the written thing is תשובה at the Table talk step and הצעה at the Proposals step, and never anything else; the kind is the screen's title, never a tag on the card.

## 4. Hierarchy (per role)
Role: student. Home = `/play/:id`, which always shows the current class step and, inside Table talk and Proposals, my table's current table step. Max depth 2.
```
0 /                      enter the code
1   /join/:code          my name (real name for the teacher only, as today)
0 /play/:id              one screen, the step the teacher is on
1   Waiting              (lobby)
1   Opening              (framing: the question, the dilemma video)
1   Side                 (positioning: two characters, a slider, confirm)
1   My table             (tables: "שולחן 3", who sits with me, "go and sit")
1   Table talk           (question/inquiry: table step pick → talk → write → rate; turns)
2     The class's answers   (rate: whole-class list; sheet from the rate step)
1   Proposals            (deliberation: table step talk → write → rate; then plenum)
2     The class's proposals (rate: whole-class list)
1   Vote                 (voting: the ballot)
1   Summary              (results: side again → decision → what changed)
```
Role: teacher. Home = `/teach` (teacher-home spec). The live lesson is one screen. Max depth 3 from `/teach`.
```
0 /teach                                   חדר המורה (unchanged)
1   /teach/session/:id                     השיעור: step rail + one forward control + Tables board (default) | What they wrote
2     /teach/session/:id/table/:n          one table: members, side of each, table step, timers, the turn, move / next speaker / move table to step
3       student row actions                move to table …, remove from the lesson (existing), message (existing)
2     /teach/session/:id?view=texts        answers and proposals by step, hide / restore (existing moderation)
1   /teach/screen/:id                      מקרן (projector; opens in its own window, no navigation of its own)
1   /teach/report/:id                      סיכום השיעור (after the lesson; unchanged route)
```

## 5. Navigation model
- Global (student): none. The student never navigates; the teacher's step and the table's step decide the screen. The only persistent chrome is a one-line header: step name, and inside a table step "שולחן 3 · סבב 2 · עכשיו: כותבים". Settings (language) stay behind the existing cog.
- Global (teacher): `TeacherNav` and the side bar as in the sidebar spec. The side bar's "השיעור הזה" group lists exactly: שולחנות, מה כתבו, מקרן, קוד (QR), הגדרות. Nothing else.
- Local (student): inside Table talk and Proposals the table step is the local position; the asker's device shows the forward control ("סיימנו, לכתוב" / "הבא בתור" / "לדרג"), other devices show the same step without it. The rate step's whole-class list is a sheet with a labelled close that returns to the table screen.
- Local (teacher): the console has one two-option switch, שולחנות | מה כתבו. The step rail (8 steps, current marked, done greyed, upcoming plain) sits above both and is the same component on every step. The forward control ("פתיחת השלב הבא: …") is always the last thing on the rail; it names the step it opens; at the last step it reads "סיום השיעור".
- Contextual (teacher): a table card → the table sheet (depth 2); a table card's quick actions without opening it: "הבא בתור", "לכתיבה", "לדירוג". The Tables step adds "חלוקה לשולחנות" (first time) and "חלוקה מחדש" (after). Deliberation adds "כולם ביחד" (opens the plenum) and the existing voting settings; the Summary adds "לסיכום השיעור" (the report).
- Back paths: student: a sheet closes to the table screen; nothing else goes back (there is no earlier screen to go to; a refreshed phone lands on the current step). Teacher: table sheet → console (same view); console → `/teach` or the class (sidebar); projector is its own window and has "חזרה ללוח המורה" only as a link, as today; report → its class.
- Deep links and URL shape: `/join/:code` (QR on the projector and the console), `/play/:id`, `/teach/session/:id`, `/teach/session/:id?view=texts`, `/teach/session/:id/table/:n`, `/teach/screen/:id`, `/teach/report/:id`. Redirect `/teach/session/:id/class` → `/teach/session/:id` (the roster lives on the Tables board now). Unknown or ended session: the existing `join.session_ended` and `game.refresh_*` screens.
- Late joiner: joins at any step; before Tables they go where the class is; after Tables they see "עוד אין לכם שולחן. חכו למורה" and the teacher's console shows them in a "ללא שולחן" strip at the top of the Tables board with one action, "לשולחן …". The teacher places them by hand; the system proposes nothing.

## 6. Task flows
Role: student, task: join and be ready (3 steps). 1. `/` type the code. 2. `/join/:code` type a name. 3. Waiting: "ממתינים למורה".
Role: student, task: take a side (2). 1. Side: move the slider toward a character. 2. "אישור" → "נשמר", wait.
Role: student, task: find my table (1). 1. My table: read "שולחן 3" and the names, go and sit. (No tap.)
Role: student, task: one turn at the table, as the asker (5). 1. Pick: tap one of the teacher's questions or one a tablemate added ("שאלה משלנו": anyone at the table can type one). 2. Talk: read it aloud; "התחלה" starts the first speaker's minute. 3. Talk: when the minute ends, "הבא בתור" (×3-4). 4. Write: choose "תשובה אחת לשולחן" or "כולם כותבים"; type; "שליחה". 5. Rate: the class's answers, 5 faces each, whenever they want; "סבב הבא" when the table is done.
Role: student, task: one turn at the table, not the asker (3). 1. Talk: screen shows "מסכים למטה" + the speaker + the countdown; speak when it is me. 2. Write: type my answer (everyone writes) or help the typist aloud (one for the table). 3. Rate: the class's answers.
Role: student, task: proposals (3). 1. Talk: "מסכים למטה" + the table timer. 2. Write: "ההצעה שלי", "שליחה"; edit allowed until the Vote opens. 3. Rate: the class's proposals.
Role: student, task: vote (1). 1. Vote: tap one proposal. (Change until closed.)
Role: student, task: summary (2). 1. Read the decision. 2. "לאיזה צד אתם קרובים עכשיו?" → "אישור" (optional; the decision is never behind it).
Role: teacher, task: run the lesson (8 taps of one control). On `/teach/session/:id`: "פתיחת השלב הבא" × 7, then "סיום השיעור". Everything else is optional.
Role: teacher, task: seat the class (2 taps + fixes). 1. Tables step: "חלוקה לשולחנות" → the board fills (3-5 per table, sides mixed, `camp` round-robin, center spread). 2. Say it aloud; students read their table. Fix: drag a student card to another table, or table sheet → "העברה לשולחן אחר". "חלוקה מחדש" asks before replacing. A student without a phone: "בלי מכשיר" on a table card → type their name → they appear on the table like everyone.
Role: teacher, task: see where every table is (0 taps). Tables board: one card per table with its step, its timer (and "הזמן נגמר" when over), the turn count and the asker. No automatic "stuck" judgement: the teacher reads the room.
Role: teacher, task: unstick a table (1 tap). Table card → "הבא בתור" or "לכתיבה" or "לדירוג"; or "כל השולחנות: מדרגים" on the rail to bring the room together before opening Proposals.
Role: teacher, task: plenum and ballot (3). 1. Proposals step: "כולם ביחד" → projector shows the top proposals; authors may still edit; everyone may re-rate. 2. "פתיחת השלב הבא: הצבעה" → ballot frozen (existing). 3. "פתיחת השלב הבא: סיכום" → projector shows the decision and the side shift with "n מתוך m בחרו שוב".

## 7. Screen inventory
Student: one route, `/play/:id`; the row is the step. Teacher rows are routes.
| Screen | Route | Single job | Empty | Loading | Error | No permission | Done |
|---|---|---|---|---|---|---|---|
| Code | / | type the code | — | — | invalid code | — | → join |
| Join + Waiting | /join/:code → /play/:id | name, then wait | — | joining | ended, removed | removed (existing) | "ממתינים למורה" + count |
| Opening | /play/:id | read the question; the video plays on the projector, and on the phone only if the student taps play | no video: text only | video loading | video failed: "המורה מקרין" | — | teacher opens Side |
| Side | /play/:id | pick a side | — | sending | save failed + retry | — | "נשמר" |
| My table | /play/:id | know my table and go sit | not placed yet: "עוד אין לכם שולחן. חכו למורה" | — | — | — | table number + names |
| Table talk | /play/:id (table step inside) | pick / talk / write / rate, per the table step | pick: no questions left → "שאלה משלנו"; rate: "עוד אין תשובות" | sending | send failed + retry; language gate refusal (existing) | not the asker: no forward control (by design, not an error) | turn done → next turn or "חכו לשאר השולחנות"; the class's answers sheet is open at every table step |
| Proposals | /play/:id (table step inside) | talk / write / rate; plenum | rate: "עוד אין הצעות" | sending | same as above | — | plenum: "ההצעות המובילות על המקרן" |
| Vote | /play/:id | one vote | empty ballot: "אין מה להצביע" (existing) | saving | save failed + retry | closed | "הצבעתם" |
| Summary | /play/:id | decision, side again (optional), what changed | no vote held: most agreed proposal; nobody re-picked yet: "עוד אף אחד לא בחר שוב" | computing (existing) | — | — | ended |
| Console | /teach/session/:id | move the class; see every table | before Tables: roster only; no students: "עוד לא הצטרפו" (existing) | skeleton | advance failed (existing) | not my lesson → /teach | last step: "סיום השיעור" |
| Table sheet | /teach/session/:id/table/:n | fix one table | table with no members | — | move failed | — | — |
| What they wrote | /teach/session/:id?view=texts | read, hide, restore | "עוד לא כתבו" | — | moderation failed (existing) | — | — |
| Projector | /teach/screen/:id | show the one thing the class needs | per step: code; video; the two sides; the table map; counts; top proposals; tally; decision + shift | — | — | — | — |

## 8. Findability
- The class's answers (rate step): 25-35 answers per turn, up to ~100 over three turns. Order: unrated first, newest first within; my own table's answers are not listed (auto +1, section 2.1); already rated collapse under "דירגתם n". No search: scanning a list of 40 short lines is faster on a phone than typing.
- The class's proposals: ≤34 (my own is not listed, auto +1), same rule. At the plenum the list order becomes C_p rank with the top ones pinned.
- Teacher's questions at the pick step: ≤8, used ones at this table greyed and last.
- Tables board: ≤10 cards in table order; a "ללא שולחן" strip on top when anyone is unplaced; a student search box only when the class exceeds 30 (name typed → their card highlighted).
- What they wrote: grouped by step, then by table; filter chips: table, hidden (existing). Reuse the existing teacher search (`teacher.w_search`).

## 9. Decisions (Tal, 2026-10-21) and assumptions
1. Own items: a student does not rate their own proposal or their own table's answers; the server records a +1 rating by them for each (every co-author of a shared answer), so the author's agreement counts in C_p and the list is shorter.
2. Turns at Table talk: default 2 in the lesson settings; the teacher may always open the next step. An unfinished turn's draft is sent as is or dropped (one-line confirm).
3. A student without a device: the teacher adds them to a table as "בלי מכשיר" (roster-only participant, no uid); tablemates write for them; the teacher may rate on their behalf from the console. Low priority, after the first lesson.
4. Late joiners after tables form: the teacher places them by hand from the "ללא שולחן" strip. No automatic proposal.
5. The written thing at the Proposals step is "הצעה" / "Proposal", as decided on 2026-10-20 (`agora-notes.md` Q2) and as the code already says. "פתרון" is retired everywhere.
6. Opening: the question text is on the phone and on the projector; the video plays on the projector, and a student may tap to play it on their phone (never autoplay, see 9b).
7. "שאלה משלנו": anyone at the table may add one; the asker picks which question the turn uses.
8. "Pick a side again" is optional and never gates the decision; the shift shows with "n מתוך m בחרו שוב" from the first re-pick.
9. No "stuck" mark on the Tables board; the teacher reads the timers and the room.
10. Rating is open whenever the student wants, through the class list sheet at any table step; the table's `rate` step and the teacher's "כל השולחנות: מדרגים" only direct attention.
11. Side stays a slider (0..100, center allowed); the two ends are the two characters.

Assumptions: Hebrew marked (?) needs a native read ("דנה מדברת" is gendered by the name's verb, "השואל"). Phone and projector share one clock (server timestamps). A class of 36 with tables of 4 is 9 tables; the console shows 9 cards on a laptop without scrolling. Team-size at join ("כמה אתם ליד המכשיר?") is removed: sharing a device is now a table choice per turn, not a join choice (deviceMode stays `individual`). The engine's `AgoraRoundPhase.propose` and `improve` are reused for "tables working" and "plenum"; `rate` is retired for this flow. Points keep being computed server-side; no classroom screen shows them, and the report may (teacher-home spec, unchanged).

## 9b. Device and network budget (fixed)
Some students have old, weak phones and some classrooms have slow or patchy cellular reception. Measured 2026-10-21 (uncompressed JS before the first screen): Join ≈ 0.95 MB (453 kB app + 467 kB Firebase + 31 kB Hebrew), Agora ≈ 1.3 MB + 572 kB village + 97 font files (2.7 MB), main app ≈ 2.6 MB. The rebuilt student client must land at Join's weight or below:
- First screen ≤ 300 kB gzipped total; one Hebrew font (variable, two weights), no icon fonts, no 3D, no per-student theme fonts.
- The phone never autoplays the dilemma video; it shows the text and "צופים ביחד" while the projector plays, with a play button for a student who wants it on their own phone.
- Every listener goes through Join's `resilientOnSnapshot` pattern (wake resync, backoff rebuild); Firestore offline persistence on; a send that fails is kept as a local draft and retried, never lost.
- Timers are server moments, so a phone that drops for 30 s shows the right countdown when it returns.
- PWA shell precached after the first visit; the lesson keeps working on a 2G-class connection with only text writes.
- Tested on the slow-4G + 4× CPU DevTools preset and on one real low-end Android before the next teachers' test.

## 10. Handoff to UX
Fixed by this spec: the eight student screens and their order; one route per role; the step order (lobby → opening → side → tables → table talk → proposals → vote → summary) and that it is the teacher's single forward control, always in the same place, naming the step it opens; the four table steps (pick → talk → write → rate) and that only the asker's device carries the table's forward control; the talk step shows a prompt, the speaker and a countdown and never an editor; the writing-mode choice is one tap with "כולם כותבים" as default; rating is 5 faces, -1..+1, separate in word and screen from the vote, reachable at any table step and never listing the student's own items; the side is a slider; the decision never waits for the re-pick; the labels in section 3 and the writing rules of the clarity spec; every state in section 7 has a place; the Tables board is the console's default view during Table talk and Proposals; the projector shows one thing per step.
Yours to decide: how the step rail looks and how the current step stands out; the table card's layout, the timer's drawing, how "over" reads without colour alone; the drag-to-move interaction on the Tables board and its keyboard equivalent; how the asker's device marks itself; the countdown's size on a phone lying face down (it must be readable from 60 cm); the side slider's drawing with two characters; how the shift is drawn (before/after of two sides and a center) for both phone and projector; the 5-face scale's adaptation from Join; the sheet pattern for the class lists; motion, colour, spacing, type. Questions for you: should the talk step dim the screen to signal "screens down"; should the projector's table map mirror the physical room (the teacher draws it once) or stay a grid.

## 11. Revision after Tal's simulation review (2026-10-21)
Tal played the interactive simulation and asked for five changes. They override the sections above where they conflict.
1. **The step rail is also a control.** Every step on the teacher's rail is a button; pressing one moves the whole class to that step (forward or back). The one forward control stays as the primary path; the rail is the shortcut. `agoraAdvanceStage` therefore needs a `toIndex` (today it is forward-only).
2. **Proposals are written during Table talk too, Join-style.** At the `write` step of Table talk a student writes the table's answer AND may write a proposal for a solution ("הצעה לפתרון", optional). Writing is broadcast live to the class as in Join's `liveDrafts` (RTDB, opt-out checkbox "משדרים את הכתיבה לכיתה"), and the class list at the `rate` step shows answers and proposals together, each rated on the same 5-face −1..+1 scale. Phase 3 (Proposals) keeps its own write step; proposals from phase 2 carry into it.
3. **The countdown is per person in both phases, and the next speaker is chosen, not ordered.** The talk screen reads "הדוברת: דנה · זמן נותר: 34 שניות" above the large digits. Under the countdown, chips of the tablemates: the asker (or anyone once the minute is over) taps who speaks next; a tablemate who spoke is marked ✓. "סיימנו, לכתוב" is the asker's exit at any time and everyone's once all have spoken. This replaces the fixed speaker order in §2.4 and the table-wide timer at Proposals.
4. **The gate on the teacher's screen and the projector.** At Proposals (and at Table talk once proposals exist) the console shows "הצעות מול השער": one bar per proposal with its consensus score and a gate line at the lesson's threshold (`votingSettings`, as Agora's gate works today), with "עברה את השער" / "עוד 0.12" per row. The projector shows the same bars before the plenum.
5. **The summary asks for support of the decision, not a side.** "עד כמה אתם תומכים בהצעה?" on the 5-face −1..+1 scale. The system groups the support by the side each student picked in Phase 1 (קרובים ליונתן / באמצע / קרובים לנועה) and states whether the sides came closer: both sides' mean support ≥ the gate → "הצדדים התקרבו", else "הצדדים עוד לא התקרבו". `campPositionEnd` and the side-shift drawing are dropped; the new participant field is `decisionSupport` (−1..+1).
6. **A student may move between the screens of the current step.** Inside Table talk and Proposals the phone carries a strip of the step's screens (שאלה · מדברים · כותבים · מדרגים); tapping one shows that screen without changing the table's official step (the table doc still moves only by the asker or the teacher). This replaces "nothing else goes back" in §5 for the table steps; the class-level step is still the teacher's alone.

## 12. Host decision revised: `apps/join-class`, a copy of Join (Tal, 2026-10-21)
Tal's decision, overriding the "keep Agora's engine" premise in the header: **copy `apps/join` to a new app `apps/join-class` and build the classroom there.** Join's code is the one that has run the most lessons with adults and is the most tested; the classroom becomes a sibling app with its own hosting target, port and env, and Join itself is never changed. Nothing in sections 1-11 about objects, labels, step order, screens or Tal's decisions changes; only where things live:

| Spec object | In join-class |
|---|---|
| Lesson | Join **workspace** (main statement). The teacher's "lesson" = one workspace per class per scenario; the join code is a Join share link / QR (`/m/:mid`), plus a short code route if 13-year-olds must type it |
| Step (class-level) | the workspace's **follow-me** path (`joinFollowMe`), one route per step; the teacher's step rail writes it; the 8-step order is a `lessonPlan` array on the main statement's settings |
| Guiding question | a **sub-question** of the workspace (`createSubQuestion`), authored in the new planning screen (§12.1); a student-added question is a sub-question with `creatorId` = the student and the table id |
| Answer / Proposal | an **option** under its question (Join's `createSuggestion`), with `agoraTable: {tableId, shared, coAuthors}` → renamed `classTable` in join-class; proposals written at Table talk are options under the lesson's challenge question |
| Rating | Join's 5-face **evaluation**, unchanged (already −1..+1 → consensus via the shared Cloud Function) |
| Live broadcast of writing | Join's **liveDrafts** (RTDB), unchanged |
| Side | new field on the student's workspace subscription (`statementsSubscribe`): `side` 0..100 and `camp` |
| Table, table step, turn, speaking time | new collection `classTables/{mainId}--{n}` (fields as §2.2); the student's table id on their subscription; three callables `classAssignTables`, `classMoveStudent`, `classTableStep` |
| Ballot / vote / decision | new: a `vote` on the challenge question (Join has none today; port the main app's `vote/` semantics as a small callable `classCastVote` + `voting` frozen list on the challenge question) |
| Gate | the challenge question's `votingSettings.threshold`; the console's gate bars read each option's `consensus` |
| Decision support | new subscription field `decisionSupport` −1..+1; `supportBySide()` in shared-types |
| Teacher console / projector | new routes in join-class: `/t/:mid` (console), `/t/:mid/screen` (projector), `/t/:mid/plan` (§12.1); Join's `FacilitatorPanel` stays for the knobs behind the cog |

What this costs versus Agora's engine (stated once, decided): the lesson/session, join code, table, timer, ballot and teacher-console layers are written new on Join's model instead of reused from `functions/src/agora`; the gain is one small, trusted codebase and no deletion work.

### 12.1 Teacher screen: plan the questions
- **Audience**: the teacher, before the lesson (laptop or phone). One job: write and order the guiding questions the tables will pick from, and the one challenge question for proposals, then save.
- **Object**: the lesson plan = the workspace's sub-questions in order + one sub-question flagged `role: 'challenge'`. Saving = the sub-questions exist on the workspace (Join's model; no separate "plan" document). A question has: text (≤ 140 chars), optional one-line hint for the table ("מה מחפשים"), order, `role: 'guiding' | 'challenge'`.
- **Labels**: screen "תכנון השאלות" (EN "Plan the questions", key `plan.*` NEW); "שאלה מנחה" appears here only, in the section title "השאלות לשולחנות"; "השאלה לפתרון" for the challenge; "שמירה" / "נשמר"; "סדר" by drag (Join's `ManualReorder`).
- **Route**: `/t/:mid/plan`, reached from the console's cog and from the lesson row on the teacher home; back = the console.
- **Hierarchy (teacher)**: 0 `/t` teacher home (my lessons, + new lesson) → 1 `/t/:mid` console → 2 `/t/:mid/plan` | `/t/:mid/screen`. Depth 2.
- **Task flow, plan a lesson (5 steps)**: 1. `/t` → "+ שיעור חדש" → title (the dilemma's name). 2. `/t/:mid/plan`: "השאלה לפתרון" box, type it. 3. "+ שאלה" under "השאלות לשולחנות", type, Enter adds the next (3-8 questions). 4. Drag to order. 5. "שמירה" → "נשמר" → "לקונסולה". Saving is per field on blur as well (Join's `EditableTitle` pattern), so "שמירה" is a confirmation, never a gate.
- **Screen inventory row**: | Plan the questions | `/t/:mid/plan` | write and order the questions | "עוד אין שאלות. הוסיפו את הראשונה" | skeleton | save failed inline + retry | not the workspace admin → console | "נשמר" |
- **Findability**: ≤ 8 guiding questions, no search; the challenge question is always pinned on top.
- **Reuse from Join**: `createSubQuestion`, `EditableTitle`, `ManualReorder`/`dragReorder`, `MainHub` admin affordances, `setQuestionSetting` for `role` and hint.
- **Open**: can the teacher pick from a shared library of questions (Agora's scenario library)? Not in phase 1; the screen gets a "מהספרייה" button later if Tal wants it.

## 13. Front door, teacher entry and lesson status (Tal, 2026-10-22)

Status: agreed (Tal answered Q1-Q6 on 2026-10-22)

Tal, running join-class locally: "I do not see how the teacher can create classes, and I do not see a teacher screen at enter." Cause: `/` still rendered Join's own home (a workspace list) behind a login, and nothing linked to `/t`. Tal's decisions the same day:
- Delete Join's leftover screens; the app is only the screens in 13.1 ("we need the app as light as possible").
- Teachers sign in with Google only.
- The front door leads with the code.
- The lesson has a language, chosen on the plan screen.
- A lesson can be paused, ended, kept open after class and reopened.

What this section overrides:
- §12's table row "join code is a Join share link". Both entry points are kept: the class code at `/c/:code` and the QR to `/m/:mid`.
- §12.1's "לקונסולה", now "לשיעור" (13.3).
- §2.1's Lesson lifecycle "open → live → ended", now the status model in 13.6.

### 13.1 The app, whole
| Route | Screen | Who |
|---|---|---|
| `/` | Front door: type the code; "אני מורה" | everyone; a Google-signed-in teacher is sent to `/t` |
| `/login` | Teacher sign-in | teachers only (from teacher routes and "אני מורה") |
| `/c/:code` | resolves the code; no screen of its own | students (typed or QR) |
| `/m/:mid` | the lesson, student side (StudentStage: name → waiting → steps; paused / ended screens) | students; the lesson's teacher is sent to `/t/:mid` unless `?student=1` |
| `/t` | Teacher home "השיעורים שלי" | teacher |
| `/t/:mid/plan` | תכנון השאלות (§12.1) + פרטי השיעור (incl. שפת השיעור) | teacher |
| `/t/:mid` | the console "השיעור" | teacher |
| `/t/:mid/table/:n` | table sheet | teacher |
| `/t/:mid/screen` | מקרן | teacher (own window) |

Nothing else is routed. `/q/*`, `/m/:mid/q/*`, `/invite` and any unknown path go to `/`.

### 13.2 Who lands where on `/`
- Signed in with Google → `/t` at once; the front door is not shown.
- Signed out, or anonymous (every student is anonymous via `ensureUser`) → the front door.
- The front door's single job is the code: "הקלידו את הקוד", 6 digits, "כניסה" → `/c/:code`.
- The second door is on the same first screen, without scrolling: "אני מורה" → `/t`, which asks for sign-in when needed.
- A student who tapped "אני מורה" by mistake: the sign-in screen carries "תלמידים לא צריכים להתחבר." and "יש לי קוד" → `/`.
- Unknown code (`/c/:code` finds nothing) → `/` with the code filled in, plus "לא מצאנו שיעור עם הקוד הזה" and "בדקו את ששת הספרות עם המורה ונסו שוב." Focus stays in the input. There is no dead-end screen.
- `/c` with no code → `/`.
- A code of a paused or ended lesson still resolves; the student lands on the paused or ended screen (13.6).

### 13.3 Labels
One name per concept. Every key goes in all seven locale files in `apps/join-class/src/lib/locales`.

| Concept | EN | HE | i18n key | Route | Code type | Retire |
|---|---|---|---|---|---|---|
| Lesson | Lesson | שיעור | teacher.* (kept) | /t/:mid, /m/:mid | main Statement + lessonPlan | כיתה (as the thing created or entered), סביבת עבודה, שאלה (for the lesson), workspace in UI |
| Front door instruction | Type the code | הקלידו את הקוד | NEW door.code.title | / | — | — |
| Enter | Enter | כניסה | NEW door.code.enter | — | — | — |
| Unknown code | We found no lesson with this code | לא מצאנו שיעור עם הקוד הזה | lesson.code.unknown.title (value changes) | — | — | "לא מצאנו את הכיתה הזאת" |
| Unknown code, help | Check the six digits with your teacher and try again. | בדקו את ששת הספרות עם המורה ונסו שוב. | lesson.code.unknown.body (kept) | — | — | — |
| Teacher door | I'm a teacher | אני מורה | NEW door.teacher | → /t | — | — |
| Teacher sign-in | Teacher sign-in | כניסת מורים | login.title (value changes) | /login | — | "ברוכים הבאים ל-WizCol" |
| Sign-in reason | Sign in with Google to create lessons and find them on any computer. | התחברו עם Google כדי ליצור שיעורים ולמצוא אותם בכל מחשב. | login.tagline (value changes) | — | — | "התחברו כדי לקבל החלטות ביחד" |
| Google | Continue with Google | המשך עם Google | login.google (kept) | — | — | — |
| Students don't sign in | Students don't need to sign in. | תלמידים לא צריכים להתחבר. | login.hint (value changes) | — | — | the guest hint |
| I have a code | I have a code | יש לי קוד | NEW login.have_code | → / | — | — |
| Guest sign-in | — | — | delete login.guest, login.or | — | delete signInAsGuest | כניסה כאורח/ת |
| Teacher home | My lessons | השיעורים שלי | teacher.home.title (kept) | /t | — | השאלות שלי |
| New lesson | + New lesson | + שיעור חדש | teacher.new (kept) | — | — | יצירת שאלה חדשה |
| How it works | 1. Name the lesson · 2. Plan the questions · 3. Open the lesson and show the class the code | 1. שם לשיעור · 2. תכנון השאלות · 3. פותחים את השיעור ומראים לכיתה את הקוד | NEW teacher.home.how | — | — | — |
| Empty home | No lessons yet. Name your first one: | עוד אין שיעורים. תנו שם לשיעור הראשון: | teacher.home.empty (value changes) | — | — | — |
| Open the console | Open the lesson | לשיעור | teacher.row.open (kept); plan.to_console value → "לשיעור" | /t/:mid | TeacherConsole | לקונסולה, קונסולה |
| Challenge question | The question to solve | השאלה לפתרון | plan.challenge.title (kept) | — | role 'challenge' | האתגר (lesson.role.challenge is unused: delete) |
| Lesson language | Lesson language | שפת השיעור | NEW plan.details.language | /t/:mid/plan | statementSettings language field (Join's existing one) | — |
| Account | Signed in as {{name}} | מחוברים כ־{{name}} (?) | NEW teacher.account | — | — | — |
| Sign out | Sign out | התנתקות | NEW teacher.signout (value of main.signout) | → / | signOut | — |
| Not your lesson | This lesson belongs to another account | השיעור הזה שייך לחשבון אחר | NEW teacher.denied.title | /t/:mid* | — | — |
| Switch account | Switch account | החלפת חשבון | NEW teacher.denied.switch | → /login?next=… | — | — |
| Not a lesson link | This link doesn't lead to a lesson | הקישור הזה לא מוביל לשיעור | NEW lesson.not_lesson | /m/:mid | — | Join's "not found" copy |

The status labels are in 13.6.

Key families to delete once nothing reads them: main.*, invite.*, facilitator.*, delegates.*, joinForm.*, chat.*, and any solutions.* or mainHub.* keys no surviving view reads. Check each key before deleting it; MainHub's loader still uses a not-found line and a failed line.

### 13.4 Teacher sign-in: Google only (decided)
- Teachers sign in with Google. There is no guest path.
- Reason: a lesson belongs to the account that created it. A guest account lives in one browser, so a teacher who plans at home and teaches at school would find no lessons and no permission.
- Students never sign in; they stay anonymous, as today.
- An anonymous user who reaches `/t` (a student device, or an old guest teacher) gets `/login`. Two cases on sign-in:
  - The anonymous account already owns lessons (from before this change): Google sign-in links it (`linkWithPopup`), keeping the uid and the lessons.
  - The anonymous account owns no lessons: sign-in replaces it with the Google account instead of linking. A student's anonymous identity on a shared computer therefore never becomes a teacher's.

### 13.5 Teacher home (`/t`)
- **Header:** logo; "מחוברים כ־<name>"; "התנתקות" (→ `/`). Required, because school computers are shared.
- **Primary task:** "+ שיעור חדש", always first. It opens the name field inline: label "שם השיעור (הדילמה)", then "יצירה" / "ביטול".
- **Empty state (first-time teacher):** the name field is already open and focused, under "עוד אין שיעורים. תנו שם לשיעור הראשון:". The three-step line "1. שם לשיעור · 2. תכנון השאלות · 3. פותחים את השיעור ומראים לכיתה את הקוד" sits above it.
- **List:** lessons only, meaning statements this teacher created in join-class and marked `openedInClass`; never Join's `openedInJoin`. Ordered most recently opened first.
- **Each row:** the lesson name; the status label (13.6); "תכנון השאלות" (→ `/t/:mid/plan`); and one primary action by status: "לשיעור" (→ `/t/:mid`), or "פתיחה מחדש" on an ended lesson (13.6).
- **What "יצירה" does, in one go:**
  1. Create the main statement.
  2. Write `lessonPlan` with stepIndex 0 (Waiting) and status `live`, so `/m/:mid` is a lesson from its first second.
  3. Create the class code.
  4. Mark `openedInClass`.
  5. Go to `/t/:mid/plan`.
- **Lesson language:** "שפת השיעור" is one select in "פרטי השיעור" on the plan screen. Student screens and the projector follow the lesson language; a student's device language applies only when the lesson language is unset. The cog's language choice on a student phone does not override a set lesson language.

### 13.6 Lesson status (Tal's Q4)
Tal: "By default the class is ended, but the teacher can set it to let the lesson go on... or reopen previous lessons, and the teacher can also pause the lesson."

Reading: ending is the default outcome of "סיום השיעור". The alternative offered at the same moment is to keep it open for students after class, so they can go on writing and rating on their own. An ended lesson can be reopened. A live lesson can be paused and resumed.

| Status | Meaning | Students and projector see | Writes |
|---|---|---|---|
| `live` | the teacher runs the lesson (also before the first step) | the current step (§4) | yes |
| `paused` | the teacher stopped the room for a moment | phone: "השיעור בהפסקה" + "חכו למורה", calm, no controls; projector: "השיעור בהפסקה" + the code | no; an unsent draft stays on the phone and is sent after "המשך" |
| `open` | kept open after class; no teacher driving | the current step, as in `live` | yes |
| `ended` | over | phone: "השיעור הסתיים" + the decision when there is one; projector: the same | no |

Transitions (teacher only, from the console or a home row):
- **live → paused:** "השהיית השיעור" (console bar).
- **paused → live:** "המשך השיעור". Table timers resume where they stopped: the server shifts `speakerEndsAt` and `stepEndsAt` by the pause length.
- **live, paused or open → ended or open:** "סיום השיעור" opens a choice. The default, which has focus, is "סיום". The alternative is "להשאיר פתוח לתלמידים", with the help line "התלמידים יוכלו להמשיך לכתוב ולדרג אחרי השיעור". Then "ביטול". After either choice the teacher goes to `/t`, where the row shows the new status. When the lesson is already `open`, the choice offers only "סיום".
- **ended → live:** "פתיחה מחדש" on the home row, or on the ended console. It returns to the step the lesson ended on (`stepIndex` unchanged) and goes to `/t/:mid`. From there the teacher may move steps as usual (§11.1).
- **open → live:** nothing to press. When the teacher opens the console of an open lesson and moves any step or presses "השהיית השיעור", the status becomes `live` again. The console shows the banner "השיעור פתוח לתלמידים" with "סיום השיעור".

What is fixed:
- While `paused` or `ended`, the step rail and the forward control are disabled. The paused console shows one primary control, "המשך השיעור". The ended console shows the banner "השיעור הסתיים" and "פתיחה מחדש".
- The callables (`classTableStep`, `classAssignTables`, `classMoveStudent`, `classCastVote`) refuse when the status is `paused` or `ended`. The client hides writing on those screens.
- A walk-away lesson (the teacher never pressed "סיום השיעור") stays as it is; there is no automatic end in phase 1.

Data, on `statementSettings.lessonPlan` (all moments in ms):
- `status: 'live' | 'paused' | 'open' | 'ended'`. Absent means `live`, for lessons created before this change.
- `statusAt`: when the status last changed.
- `pausedAt`: set while paused; cleared on resume, after the timers are shifted.
- `endedAt`: the last time it was ended or left open.

If `lessonPlan` is parsed by a shared-types schema, add `status` as an optional field and deploy shared-types to functions and rules before any client writes it (the strict-parse trap).

Status labels:
| Concept | EN | HE | i18n key |
|---|---|---|---|
| Row: not started (live, step 0) | Not started | עוד לא התחיל | NEW teacher.row.not_started |
| Row: live | Step n of 8 | שלב n מתוך 8 | lesson.step_of (kept) |
| Row: paused | Paused · step n | בהפסקה · שלב n | NEW teacher.row.paused |
| Row: open | Open to students | פתוח לתלמידים | NEW teacher.row.open_after |
| Row: ended | Ended | הסתיים | NEW teacher.row.ended |
| Reopen | Reopen | פתיחה מחדש | NEW teacher.row.reopen (row and ended console) |
| Pause | Pause the lesson | השהיית השיעור | NEW console.pause |
| Resume | Resume the lesson | המשך השיעור | NEW console.resume |
| End | End the lesson | סיום השיעור | console.end (kept) |
| End choice, title | End the lesson? | לסיים את השיעור? | console.end_confirm (kept, now the title of a choice, not a browser confirm) |
| End choice, default | End | סיום | NEW console.end_now |
| End choice, keep open | Keep open for students | להשאיר פתוח לתלמידים | NEW console.keep_open |
| Keep open, help | Students can keep writing and rating after class | התלמידים יוכלו להמשיך לכתוב ולדרג אחרי השיעור | NEW console.keep_open_help |
| Cancel | Cancel | ביטול | teacher.new.cancel value, NEW key common.cancel if not present |
| Console banner: open | Open to students | השיעור פתוח לתלמידים | NEW console.open_banner |
| Console banner: ended | The lesson has ended | השיעור הסתיים | NEW console.ended_banner |
| Paused (student, projector) | The lesson is paused | השיעור בהפסקה | NEW lesson.paused.title |
| Paused, line | Wait for the teacher | חכו למורה | NEW lesson.paused.body |
| Ended (student, projector) | The lesson has ended | השיעור הסתיים | NEW lesson.ended.title |
| Ended, line | Thank you for taking part | תודה שהשתתפתם | NEW lesson.ended.body |

Retire: "השיעור נגמר", "סגור" and "מושהה" (if anyone proposes them).

### 13.7 Hierarchy
Teacher (home `/t`, max depth 2):
```
0 /t                      השיעורים שלי
1   /t/:mid/plan          תכנון השאלות (+ פרטי השיעור, שפת השיעור)
1   /t/:mid               השיעור (console; live | paused | open | ended state)
2     /t/:mid/table/:n    שולחן n
1   /t/:mid/screen        מקרן (own window)
```

Student (no home; entry by code or QR, max depth 1):
```
0 /                       הקלידו את הקוד
0 /c/:code                (resolver) → /m/:mid
1   /m/:mid               name → ממתינים למורה → the current step (§4) | השיעור בהפסקה | השיעור הסתיים
```

Signed out: `/` → (אני מורה) → `/login` → back to the path asked for (`?next=`, default `/t`).

### 13.8 Back paths
- `/login`: "יש לי קוד" → `/`; browser back → `/`.
- `/t`: the home; nothing above it. "התנתקות" → `/`.
- `/t/:mid/plan`: "‹ השיעור" → `/t/:mid`; "לשיעור" in the save bar → `/t/:mid`.
- `/t/:mid`: "‹ השיעורים שלי" → `/t`. After "סיום השיעור" (either choice) → `/t`.
- `/t/:mid/table/:n`: close → `/t/:mid`.
- `/t/:mid/screen`: its own window; no navigation (§5). It follows the status by itself.
- Not your lesson: "החלפת חשבון" → `/login?next=<same path>`; "השיעורים שלי" → `/t`; "יש לי קוד" → `/`.
- `/m/:mid` as the lesson's teacher → `/t/:mid` (except with `?student=1`).
- Paused or ended student screen: no navigation. It changes by itself when the teacher resumes or reopens.

### 13.9 Task flows
- **Teacher, first time, from opening the site to the first lesson planned (4):**
  1. `/`: "אני מורה".
  2. `/login`: "המשך עם Google" → `/t`, with the name field open.
  3. Type the name, "יצירה" → `/t/:mid/plan`.
  4. Type "השאלה לפתרון" and 3-8 questions (saved on blur), then "שמירה" → "נשמר". Optional next: "לשיעור".
- **Teacher, returning, from opening the site to the console (1):** `/` goes to `/t` on its own (the Google session is kept); "לשיעור" on the row. If the session expired, add "המשך עם Google" (2).
- **Teacher, pause and resume (1 + 1):** "השהיית השיעור"; "המשך השיעור".
- **Teacher, end (2):** "סיום השיעור" → "סיום" → `/t`, row "הסתיים".
- **Teacher, keep open after class (2):** "סיום השיעור" → "להשאיר פתוח לתלמידים" → `/t`, row "פתוח לתלמידים". Later: open the row's "לשיעור" → "סיום השיעור" → "סיום".
- **Teacher, reopen a past lesson (1):** row "פתיחה מחדש" → console at the step it ended on.
- **Student by QR (2):** scan → `/m/:mid` → name, "הצטרפות" → "ממתינים למורה".
- **Student by typing (3):** `/` type 6 digits, "כניסה" → name, "הצטרפות" → waiting.
- **Student who tapped "אני מורה" by mistake (+1):** "יש לי קוד" → `/`.
- **Teacher on a second computer, signed in with another account (2):** the not-your-lesson screen → "החלפת חשבון" → Google → the same lesson.

### 13.10 Screen inventory
| Screen | Route | Single job | Empty | Loading | Error | No permission | Done |
|---|---|---|---|---|---|---|---|
| Front door | / | type the code | — | — | unknown code: inline line, code kept | — | → /c/:code → /m/:mid |
| Code resolver | /c/:code | turn a code into a lesson | — | splash | unknown → / with the error | — | → /m/:mid (replace) |
| Teacher sign-in | /login | sign a teacher in | — | "מתחבר…" | "ההתחברות נכשלה. נסו שוב." | — | → ?next or /t |
| Teacher home | /t | start, open or reopen a lesson | name field open + three-step line | skeleton | create or reopen failed inline + retry | anonymous → /login | → /t/:mid/plan or /t/:mid |
| Console, paused | /t/:mid | stop the room, then resume | — | — | resume failed inline + retry | not your lesson | "המשך השיעור" → live |
| Console, open | /t/:mid | see the lesson students still use; end it | — | — | — | not your lesson | "סיום השיעור" |
| Console, ended | /t/:mid | look back; reopen | — | — | reopen failed inline + retry | not your lesson | "פתיחה מחדש" → live |
| End choice | on /t/:mid | end, or keep open | — | — | write failed inline + retry | — | → /t |
| Not your lesson | state of /t/:mid, /plan, /screen, /table/:n | explain and offer the way out | — | — | — | (this state is it) | — |
| Lesson, student side | /m/:mid | §7 student rows | — | splash | not found or not a lesson: "הקישור הזה לא מוביל לשיעור" + "יש לי קוד" | — | §7 |
| Paused (student) | /m/:mid | wait calmly | — | — | — | — | returns to the step on "המשך" |
| Ended (student) | /m/:mid | know it is over; see the decision | no decision: the two lines only | — | — | — | returns to the step on "פתיחה מחדש" |
| Projector, paused / ended | /t/:mid/screen | tell the room | — | — | — | — | follows the status |

### 13.11 Findability
- Teacher home: most recently opened first.
- A name filter appears at more than 10 lessons; a teacher with several classes passes that within a term.
- The status is on every row, so a paused or open lesson is visible without opening it.
- No archive in phase 1 (13.12).

### 13.12 Decisions (Tal, 2026-10-22) and what is left
Decided:
1. Teachers sign in with Google only.
2. The front door leads with the code box, with "אני מורה" beside it.
3. Removing a lesson from the list: not in phase 1; later "הסתרה מהרשימה", never delete.
4. Lesson status: live / paused / open / ended as in 13.6.
5. Brand: keep the WizCol logo; titles name the task.
6. "שפת השיעור" lives in "פרטי השיעור" on the plan screen; students follow it, and their device language applies only when it is unset.
7. Join leftovers are deleted, not hidden (13.13).

Still open, each with a default:
- **A.** A lesson left `live` or `open` with nobody pressing anything: should it end on its own (for example, `live` after 12 hours, `open` after 14 days)? [Default: no automatic end in phase 1; the row's status shows it.]
- **B.** While `paused`, may the teacher move steps on the rail (to prepare the next step) before resuming? [Default: no; one control, "המשך השיעור", while paused.]
- **C.** In an `ended` lesson, may students still read the class's answers and proposals (read-only)? [Default: no; the ended screen shows the decision only.]

### 13.13 What the lesson flow still needs from Join (build lane)
This list comes from a static import-graph trace of `index.ts` → the nine routes in 13.1. Run typecheck after each cut.

**Must stay:**
- **Data and engine:**
  - `lib/store.ts`: the main statement load, sub-questions and options listeners. Trim it as listed under "Safe to delete".
  - `lib/firebase.ts` and `lib/popupResolver.ts`
  - `lib/resilientListeners.ts`
  - `lib/user.ts`: drop `signInAsGuest` and add the link-only-if-owns-lessons rule from 13.4.
  - `lib/admin.ts`
  - `lib/i18n.ts` and the locales
  - `lib/sentry.ts` and `lib/sentryClient.ts`
  - `lib/deferWork.ts`
  - `lib/timeFormat.ts`
  - `lib/lesson.ts`, `lib/lessonCore.ts` (gains status), and all of `lib/classroom/*`
- **Rating and live writing:**
  - `components/Evaluation.ts`: RateFaces imports `evaluationThumbs`, and `c3Data` and `userEvaluations` read it. It may be cut down to the faces alone.
  - `lib/userEvaluations.ts`, and `lib/newSolutionsBuffer.ts`, which it imports.
  - `lib/liveDrafts.ts`: TableFlow, WritePanel, LiveWritersCard and serverClock use it.
- **Teacher screens:**
  - `components/QRShare.ts` (console and projector)
  - `lib/dragReorder.ts` (plan screen)
  - `lib/joinSubscriptions.ts`, re-scoped to `openedInClass` (teacher home and planController)
  - `components/BrandLogo.ts`, `components/WizColFooter.ts`, `components/AccessibilityWidget.ts`, `views/Splash.ts`
- **Student screens:** `components/StudentFrame.ts`, `components/SideSlider.ts`, and all of `views/student/**`. Add the paused and ended screens there.
- **MainHub:** keep only as the `/m/:mid` loader. It loads main, checks admin, sends the teacher to `/t/:mid`, shows "not a lesson" for a non-lesson, and otherwise renders StudentStage. Delete its Join hub body: the sub-question list, create form, hide toggles, SummarySection and EditableTitle header.

**Safe to delete:**
- **Views:** `views/Main.ts`, `views/Invite.ts`, `views/Solutions.ts`, `views/Chat.ts`
- **Components:** `components/SolutionCard.ts`, `AddSuggestionModal.ts`, `EditSuggestionModal.ts`, `LimitReachedModal.ts`, `JoinFormModal.ts`, `ChatMessage.ts`, `LiveDraftBanner.ts`, `LiveDraftWatch.ts`
- **Lib, unused:** `lib/myWorkspaces.ts`, `lib/nameGenerator.ts`, `lib/celebrate.ts`, `lib/pointsToast.ts`, `lib/helperPoints.ts`, `lib/improveSuggestion.ts`, `lib/commentVerdicts.ts`, `lib/flipAnimate.ts`, `lib/formatText.ts`, `lib/linkify.ts`
- **Lib, used only by Solutions/Chat:** `lib/facilitator.ts`
- **FacilitatorPanel and its pieces:**
  - `components/FacilitatorPanel.ts` (2108 lines): unmount it from `TeacherConsole.ts`.
  - `components/ManualReorder.ts`, `DelegateActiveList.ts`, `DelegateInviteForm.ts`, `DelegateInviteList.ts`, `lib/facilitatorToast.ts`
  - The console already owns the gate (`gateControl.ts`). The plan screen owns the video and side names (`classSettings.ts`), and now the lesson language.
- **Join hub, after MainHub shrinks:** `components/SummarySection.ts`, `lib/summarize.ts`, `lib/summaryMarkdown.ts`, `components/EditableTitle.ts`, `components/BackButton.ts`
- **Cut out of `lib/store.ts`, then delete:**
  - `lib/delegates/*`
  - `lib/join/joinCallables.ts` and `lib/join/joinFormCache.ts` (join form and Google Sheets sync)
  - `lib/chat/*` (`setMyOptionIds`)
  - `lib/optionDeletion.ts`
  - store.ts's follow-me, allowNavigation and showQR readers, unless a surviving file reads them.
- **Routes:** `/invite`, `/q/:qid`, `/q/:qid/s/:sid`, `/m/:mid/q/:qid`, `/m/:mid/q/:qid/s/:sid`. `/` stops using `requireAuth(Main)` and becomes the front door.
- **Do not touch:** the Cloud Functions that apps/join still uses (join form sync, delegates, invites). Delete only client code inside apps/join-class.

**Other build items from this section:**
- write `lessonPlan` (step 0, `live`) when a lesson is created
- the `openedInClass` marker
- send the teacher from `/m/:mid` to `/t/:mid`
- teacher routes show the not-your-lesson state instead of redirecting to `/m`
- `plan.to_console` → "לשיעור"
- status field, transitions and callable refusals (13.6)
- the timer shift on resume
- the lesson-language select and the rule that students follow it

### 13.14 Handoff to UX
Screens to design:
1. **Front door `/`** (phone first, also laptop): the 6-digit input as the primary task, the inline unknown-code line, and "אני מורה" visible without scrolling.
2. **Teacher sign-in `/login`:** "כניסת מורים", the reason line, one Google button, then "תלמידים לא צריכים להתחבר." and "יש לי קוד".
3. **Teacher home `/t`:**
   - header: account line, "התנתקות"
   - "+ שיעור חדש" with the inline name field
   - the first-time empty state: field open, three-step line
   - the lesson row: name, status label, "תכנון השאלות", and "לשיעור" or "פתיחה מחדש"
   - the name filter at more than 10 lessons
4. **Console status states:**
   - "השהיית השיעור" in the console bar
   - the paused console with "המשך השיעור" and a disabled rail
   - the open banner with "סיום השיעור"
   - the ended banner with "פתיחה מחדש"
   - the end choice: "סיום" as default, "להשאיר פתוח לתלמידים" with its help line, "ביטול"
5. **Student paused and ended screens:** calm, no controls; the ended screen shows the decision when there is one.
6. **Projector paused and ended frames.**
7. **The not-your-lesson state,** shared by the four `/t/:mid*` routes, with three ways out.
8. **The "not a lesson" state** on `/m/:mid`.
9. **"שפת השיעור"** in "פרטי השיעור" on the plan screen.

Fixed by this spec: the routes, the labels, who sees which screen first, the four statuses and their transitions, "סיום" as the default end, and the step counts.

Yours to decide:
- layout and the visual weight of "אני מורה"
- how a paused screen reads as calm, not as an error
- how the end choice is presented
- how the row status reads without colour alone
- motion, colour, type and spacing

Hebrew marked (?) needs a native read.

## 14. Lesson introduction (Tal, 2026-10-22)

> **Decisions at build time (2026-10-22), they override the text below where they differ.**
> - **The text limit is 600 characters** (`INTRO_TEXT_MAX = 600`), not 800. Every "800" below reads 600. At 600 the projector keeps the question at 72 px, so the "shrink the question to 48 px" last step (UX 14.D, 14.J-4) is **dropped**: the text steps 48 -> 40 -> 32 px and stops there.
> - **Editor:** one textarea holding markdown-lite, with the three-button toolbar (UX 14.A / 14.B).
> - **Stored fields** (UX 14.J-8): paragraph children exactly as `createParagraphChildStatement` writes them: top-level `order` and `blockType` (`paragraph` | `li`), and `doc.listType`, `doc.contentHtml`, `doc.paragraphType`. The plain text is `statement`.
> - **"Video failed"** applies only to direct mp4 / webm files (a YouTube embed's own error is invisible to the page). On the phone it reads "המורה מקרין"; on the projector the text comes back with `projector.video_failed`.
> - **Firestore rules (IA 14.12 F):** checked, no change needed. The creator, or an admin of the lesson, may create, update and delete the paragraph children (`tests/rules/join-class-intro.test.mjs`).
> - **One embed reader** is `introVideoEmbed()` in `lib/classroom/introVideos.ts` (not `classSettings.ts`, so the student entry chunk does not carry it).

Status: draft (Tal's decisions below; open questions in 14.12 have defaults)

Tal, on `/t/:mid/plan`: "I am missing the introduction, with the text of introduction and maybe some videos about the challenge ahead." His decisions:
- The introduction appears at the Opening step on the projector and on phones. The projector shows it big, and the teacher plays the videos there for the class. During Opening, students can reread the text and replay the videos on their own phones.
- The content is formatted text (paragraphs, bold, bulleted and numbered lists) plus an ordered list of videos, each with a short title. No images.

What this section overrides:
- §2.3: the framing step showed the question plus one dilemma video. It now shows the question, the introduction text and 0-5 videos.
- §7 Opening row and §13.13: "the plan screen owns the video" now means the introduction owns the videos.
- The single `statementSettings.videoUrl` is retired. There is one concept, the introduction's videos (14.2).

### 14.1 Audiences
| Audience | Goal at this feature | Must never see |
|---|---|---|
| Teacher, before class (plan screen) | Write a short introduction and attach the 1-3 videos the class will watch | Raw embed URLs, ids, an editor with more tools than the 3 asked for |
| Teacher, in class (console) | Choose what the projector shows during Opening: the text, or video n | A control on the projector window itself (UX §6) |
| Student (phone, Opening) | Read the question, reread the introduction, replay a video if I want | A video that plays by itself; a page heavier than the 9b budget |
| Projector | Show the introduction big, or the chosen video | Anything that needs a tap other than the player's own play button |

### 14.2 Object model
| Object | What it is | Cardinality | Where it lives | Lifecycle |
|---|---|---|---|---|
| Introduction | The lesson's opening content: text + videos. Belongs to the **lesson**, not to the challenge question | 0..1 per lesson | (container only; see the two rows below) | empty → written → edited (also during the lesson) |
| Introduction text | Formatted blocks: paragraph, bullet item, numbered item; inline bold only | 0-12 blocks, ≤ 800 characters in total | **Paragraph child Statements of the main statement** (`statementType: paragraph`, `parentId: mid`, `order`, `blockType: paragraph \| li`, `doc.listType: ul \| ol`, `doc.contentHtml` with `<strong>` only), written through `createParagraphChildStatement` | block created → edited → deleted |
| Video | One link with a short title | 0-5 per lesson, ordered | `statementSettings.introVideos: [{ id, title, url }]` on the main statement | added → titled → reordered → deleted |
| On the projector | Which Opening item the projector shows: the text, or one video | 1 per lesson | `statementSettings.lessonPlan.projectorVideoId` (absent or null = the text). Cleared on every step change | text → video n → text |

Why the text is paragraph children and not a settings field:
- The repo rule says a statement's rich body is paragraph child Statements, and `description` is the preview derived from them by `fn_syncParagraphChildrenToDescription`.
- Using children keeps the lesson readable by every other Freedi surface (the main app, the cross-app router, exports) with no join-class special case.
- Bold and lists already have a home on paragraph children (`contentHtml`, `listType`). A settings field would invent a second rich-text format.

Why the children hang on the main statement and not on the challenge question:
- The introduction is about the lesson (the dilemma), and the lesson is the main statement (§12).
- The challenge question's own body stays free for later use at Proposals.
- The plan's sub-question listeners filter on `statementType == question`, so paragraph children never leak into the question lists.

Why the videos are a settings array and not child Statements:
- Nobody rates, answers or moves a video. It is a lesson setting, like `sideNames`.
- The main statement is already listened to by every phone, so the videos cost zero extra reads.
- Order and title travel together in one write.

Reading cost on a phone (9b):
- `main.description` is non-empty only when paragraph children exist. A lesson with no introduction text therefore never queries for paragraphs.
- When it is non-empty, the phone renders `description` as plain text at once. It then makes one `get` of the paragraph children (`parentId == mid`, `statementType == paragraph`, ordered by `order`) and swaps in the formatted version.
- The phone has no listener on the paragraphs. The projector does listen, so a typo the teacher fixes mid-lesson reaches the wall.
- If the `get` fails, the plain `description` stays on screen. The failure is never shown as an error.

Retiring `videoUrl` (one concept, not two):
- **Read:** `introVideosOf(main)` returns `introVideos` when present. Otherwise, a valid `videoUrl` becomes `[{ id: 'legacy', title: '', url }]`. Every reader (phone, projector, console, plan screen) goes through it; `videoUrlOf` is deleted.
- **Write:** the plan screen's first save of the video list writes `introVideos` and deletes `videoUrl` (`deleteField`) in the same write.
- **Schema:** add `introVideos` (optional array) and `lessonPlan.projectorVideoId` (optional), and deploy shared-types to functions and rules before any client writes them (the strict-parse trap). Keep `videoUrl` as optional and `@deprecated` until a one-off count finds no lesson carrying it, then remove it. Agora's `agoraTopicPackage` scene `videoUrl` is a different object and is not touched.
- **One embed reader:** today `youtubeEmbedUrl` (c2Helpers) and `embedUrlOf` (projectorLogic) parse links differently and add different parameters. Both become one `introVideoEmbed(url)` in `classSettings.ts`.

Limits (constants in `lib/classroom`, never magic numbers):
- `INTRO_TEXT_MAX = 800` characters over all blocks. At 40 px on a 1280 × 720 projector this is about one screen. The plan screen shows a live count and refuses to save beyond the limit.
- `INTRO_BLOCKS_MAX = 12`.
- `INTRO_VIDEOS_MAX = 5`. "+ סרטון" disappears at 5 and is replaced by the line "אפשר עד 5 סרטונים".
- `INTRO_VIDEO_TITLE_MAX = 60` characters.
- The URL length stays at today's 500 (`MAX_VIDEO_URL_LENGTH`).

Video safety:
- **https only.**
- **Accepted links:** YouTube (watch, youtu.be, shorts, embed) is embedded through `youtube-nocookie.com/embed/<id>?playsinline=1&rel=0`. A direct https file ending in `.mp4` or `.webm` plays in `<video controls preload="none">`. Anything else (Vimeo, Drive, a web page) is refused at input with an inline line, never saved, and never rendered.
- **No `autoplay`** parameter anywhere.
- **Phone:** no iframe or video element is created until the student taps "לצפות כאן". At most one player is open at a time; opening another closes the first. No thumbnails or posters, because Tal said no images and because of the 9b budget.
- **Projector:** the player for the chosen video loads when the console selects it. The teacher presses the player's own play.
- `referrerpolicy="strict-origin-when-cross-origin"`.
- **Text:** the text is never injected as HTML. The renderer turns `contentHtml` into Mithril nodes and keeps only `<strong>`. Anything else is dropped to plain text.

### 14.3 Labels
"פתיחה" is the step (§3). The content shown at that step is "הקדמה". The plan screen ties the two names together in one help line, and the student and projector never see the word "הקדמה", so the two never compete. "רקע" was rejected because in code "background video" means an autoplaying banner.

Keys go into all seven files in `apps/join-class/src/lib/locales/{he,en,ar,es,de,nl,fa}.ts`.

| Concept | EN | HE | i18n key | Code type | Retire |
|---|---|---|---|---|---|
| Introduction (plan section) | Introduction | הקדמה | NEW plan.intro.title | introduction (paragraph children + introVideos) | — |
| Introduction, help | Shown at the Opening step: big on the projector and on the students' phones. | מוצגת בשלב הפתיחה: גדול על המקרן ובטלפונים של התלמידים. | NEW plan.intro.help | — | — |
| Introduction text | Text | טקסט | NEW plan.intro.text.label | paragraph Statement | — |
| Text placeholder | A few sentences about the dilemma and what lies ahead | כמה משפטים על הדילמה ועל מה שמחכה לכיתה | NEW plan.intro.text.placeholder | — | — |
| Text count | {{n}} of 800 | {{n}} מתוך 800 | NEW plan.intro.text.count | INTRO_TEXT_MAX | — |
| Text too long | Too long. Shorten to 800 characters. | ארוך מדי. קצרו ל־800 תווים. | NEW plan.intro.text.too_long | — | — |
| Bold / list / numbered list (if UX uses a toolbar) | Bold · List · Numbered list | מודגש · רשימה · רשימה ממוספרת | NEW plan.intro.bold, plan.intro.list, plan.intro.numbered | blockType li, listType ul/ol | — |
| Videos | Videos | סרטונים | NEW plan.intro.videos (plan); NEW opening.videos (phone) | introVideos | "סרטון פתיחה" (plan.details.video) |
| Add a video | + Video | + סרטון | NEW plan.intro.video.add | — | — |
| Video link | Link | קישור | NEW plan.intro.video.url (placeholder keeps "https://…") | ClassIntroVideo.url | plan.details.video.placeholder |
| Video title | Video title | שם הסרטון | NEW plan.intro.video.title | ClassIntroVideo.title | — |
| Invalid link | Use a YouTube link or a video file starting with https:// | אפשר קישור YouTube או קובץ וידאו שמתחיל ב־https:// | NEW plan.intro.video.invalid | introVideoEmbed() | plan.details.video.invalid |
| Max videos | Up to 5 videos | אפשר עד 5 סרטונים | NEW plan.intro.video.max | INTRO_VIDEOS_MAX | — |
| Untitled video | Video {{n}} | סרטון {{n}} | NEW opening.video_n (also the iframe title) | — | opening.video_title "סרטון הדילמה", projector.videoTitle "סרטון השיעור" |
| Delete / reorder | Delete · Move | מחיקה · סדר | plan.delete, plan.reorder.* (kept, reused) | — | — |
| Instruction with videos | Watch together | צופים ביחד | opening.watch (kept) | — | — |
| Instruction without videos | Read together | קוראים ביחד | NEW opening.read | — | — |
| Play on my phone | Watch here | לצפות כאן | opening.play (kept) | — | — |
| Video failed | The teacher is projecting it | המורה מקרין | opening.video_failed (kept) | — | — |
| On the projector now (phone tag) | On the projector now | על המקרן עכשיו | NEW opening.on_projector | projectorVideoId | — |
| Console chooser | On the projector: | על המקרן: | NEW console.opening.show | projectorVideoId | — |
| Console chooser: the text | Text | הטקסט | NEW console.opening.text | projectorVideoId = null | — |
| Projector play button | — | — | delete projector.playVideo | — | "להפעיל את הסרטון" |

Changed: `opening.video_failed` stays. The three old names for one video ("סרטון פתיחה", "סרטון הדילמה", "סרטון השיעור") become one, "סרטון", and the teacher's title names each video.

### 14.4 Where it sits on the plan screen
Order of the sections on `/t/:mid/plan` (§12.1, 13.H), top to bottom:
1. פרטי השיעור: lesson language, side names. The video field leaves this card.
2. השאלה לפתרון: pinned, as in §12.1.
3. **הקדמה: text, then סרטונים.** NEW.
4. השאלות לשולחנות.

Reason: sections 2 and 3 mirror the Opening screen from top to bottom (question card, then text, then videos). The teacher therefore writes the Opening in the order the class will see it. The table questions follow because they belong to step 5.

Saving: on blur, per block and per video row, through the existing `runSave` and `fieldError` path (inline "שמירה נכשלה" + retry). "שמירה" in the bar stays a confirmation, never a gate. A video row is saved when its link is valid. An empty title saves too and shows as "סרטון n".

### 14.5 Hierarchy (unchanged depth)
```
0 /t                    השיעורים שלי
1   /t/:mid/plan        תכנון השאלות: פרטי השיעור · השאלה לפתרון · הקדמה (טקסט, סרטונים) · השאלות לשולחנות
1   /t/:mid             השיעור; at Opening the switch band carries "על המקרן: הטקסט · 1 · 2 …"
1   /t/:mid/screen      מקרן; Opening shows the text or the chosen video
student
1   /m/:mid → Opening   question card · text · videos (one level, a scroll; no sub-screen)
```
No new route.

### 14.6 Navigation
- **Teacher:** the console's Opening step actions live in the switch band (UX 13.E) as one single-choice row: "על המקרן:" then "הטקסט", "1. <title>", "2. <title>" and so on.
  - Choosing an item writes `projectorVideoId`.
  - The current item is marked, and so is the projector.
  - With no text, "הטקסט" reads as the question alone. With no videos, the row is not shown.
  - Opening the next step clears the choice.
- **Projector:** no Freedi controls (UX §6). The only interactive thing is the embedded player's own play button, which UX §6 already allows ("the teacher presses play"). Today's "להפעיל את הסרטון" button is removed.
- **Student:** no navigation. The Opening screen scrolls. A video opens in place (no sheet) and closes when another opens. Leaving Opening (the teacher opens Side) closes any open player.
- **Deep link:** none new. A refreshed phone lands on Opening with every player closed.

### 14.7 Task flows
- **Teacher, write the introduction and attach two videos (6 steps):**
  1. `/t/:mid/plan`, section "הקדמה": type the text (bold and lists through UX's tools); blur saves it.
  2. "+ סרטון": paste a link; blur checks and saves it.
  3. Type "שם הסרטון"; blur saves it.
  4. "+ סרטון": link and title for the second video.
  5. Drag a video's handle to reorder (the same `dragReorder` as the questions, with keyboard moves).
  6. "שמירה" → "נשמר".
- **Teacher, see it at Opening (2 taps per video):**
  1. "פתיחת השלב הבא: פתיחה". The projector shows the question and the text, and the phones show the same.
  2. "על המקרן: 1. <title>". The projector loads video 1; the teacher presses play in the player. Then "2. <title>", then "הטקסט" when the class discusses.
  3. "פתיחת השלב הבא: צד".
- **Student, reread and replay (0-1 taps):** the screen already shows the question, the text and the list. "לצפות כאן" on a video plays it on the phone; the video now on the projector carries "על המקרן עכשיו".

### 14.8 Student Opening screen (`/m/:mid`, step 1), in order
1. **Header and instruction:** "פתיחה". Then "צופים ביחד" when the lesson has videos, otherwise "קוראים ביחד".
2. **Question card**, as today: "השאלה של השיעור" + the challenge question (else the lesson name).
3. **Introduction text:** paragraphs, bold, bulleted and numbered lists. No heading of its own; the card above names the lesson.
4. **"סרטונים":** one row per video, in the teacher's order. Each row has its title (or "סרטון n"), "לצפות כאן", and "על המקרן עכשיו" when it is the projector's current video. A tapped row expands into the player.

States:
- **Empty:** no text and no videos gives exactly today's screen, the question card alone and centred.
- **Loading:** `description` is shown as plain text until the formatted text arrives.
- **Error:** paragraph fetch failed: keep `description`, show no error. A video failed: "המורה מקרין" replaces that row's button.
- **Done:** the teacher opens Side.

### 14.9 Projector Opening (`/t/:mid/screen`)
- **Text (default):**
  - The question at the top, at 72 px (UX §6).
  - The introduction text below it, big. UX sets the size between 32 and 48 px; the 800-character limit is what makes it fit on one screen without scrolling.
  - No video list.
- **Video n:** the question shrinks to the eyebrow line and the player fills the stage, loaded but not playing. The video's title sits above it.
- **No introduction:** today's projector (the question), minus the old play button.
- The projector listens to the paragraph children and to `projectorVideoId`, so the teacher's choice and any fix appear at once.

### 14.10 Screen inventory (rows added or changed)
| Screen | Route | Single job | Empty | Loading | Error | No permission | Done |
|---|---|---|---|---|---|---|---|
| Plan: introduction section | /t/:mid/plan | write the text, add and order the videos | text box with placeholder; "+ סרטון" | skeleton (existing) | save failed inline + retry; invalid link inline, not saved; over 800 characters inline, not saved | not your lesson (13) | "נשמר" |
| Opening (student), changed | /m/:mid | read the question and the introduction; replay a video | question card alone, centred (today) | `description` as plain text | video failed: "המורה מקרין"; text fetch failed: plain `description` | — | teacher opens Side |
| Console, Opening step actions | /t/:mid | choose what the projector shows | no videos: row hidden | — | write failed inline + retry | not your lesson | next step clears it |
| Projector Opening, changed | /t/:mid/screen | show the text, or the chosen video | question only | player loading (the player's own) | video failed: the text comes back, with the video's title | — | follows the step |

### 14.11 Findability
At most 5 videos and 12 short blocks. No search, filter or grouping. Order is the teacher's.

### 14.12 Open questions, each with a default
- **A. Screen title.** With the introduction, the plan screen holds more than questions. Should "תכנון השאלות" become "תכנון השיעור" (`plan.title`, the home row action, `teacher.home.how` step 2)? [Default: keep "תכנון השאלות" in phase 1; rename only if teachers miss the introduction there.]
- **B. Other video hosts** (Vimeo, Drive). [Default: refused; YouTube and direct https mp4/webm only.]
- **C. Read-only introduction after Opening.** Should students reach it from later steps, for example a "הקדמה" link in the header? [Default: no; it lives at Opening only, as the step model says (§5).]
- **D. Title required?** [Default: optional, falls back to "סרטון n", with the placeholder nudging a title.]
- **E. Two writers of `description`.** `fn_statement_updates` rewrites the parent's `description` from its last three paragraphs whenever any child is created, including a sub-question. That can shorten the preview that `fn_syncParagraphChildrenToDescription` wrote in full. The phone only uses `description` as a placeholder, so nothing breaks. The build lane should still confirm which one wins, and it should not rely on `description` holding the whole text.
- **F. Firestore rules:** confirm the lesson's creator may create, update and delete paragraph children under their main statement from join-class. [Default: assumed by the existing statement rules; check before building.]

What would change if wrong: if Tal wants the introduction on the challenge question instead (A/C), only `parentId` changes and every label stays. If he wants longer texts, the projector needs paging, which needs a console control. That is a new spec item, not a limit change.

### 14.13 Handoff to UX
Fixed here:
- the content (text blocks + 0-5 titled videos)
- the limits
- the section order on the plan screen
- the student order (question card → text → videos)
- the console as the only way to drive the projector
- no autoplay, no thumbnails, one player at a time on the phone
- the labels in 14.3
- every state in 14.10

Yours to decide:
- the text editor's form on the plan screen: a three-button toolbar, or typing "- " / "1. " / "**" shortcuts, with keyboard and RTL behaviour
- the video row layout on the plan screen and on the phone
- how "על המקרן עכשיו" reads without colour alone
- the projector's text size within 32-48 px and the switch from text to video
- the console chooser's form inside the switch band

Questions for you:
- Should the phone's open player stick while the student scrolls?
- Should the projector show the video's title during play, or only before?

## 15. Projector: one screen or two, full-screen video (Tal, 2026-10-22)

> **Decisions of the orchestrator (2026-10-22), applied while building:**
> - The `<details>` "מקרן" menu stays (UX 15.A); "show control on arrival" in `here` mode is accepted (UX 15.K-2).
> - The IA rule "no button on the projector window ever navigates it to the console" is narrowed to: **a window the console opened never navigates to the console.** If `window.close()` is refused in a window the console did not open, "סגירת המקרן" becomes "חזרה לשיעור".
> - The 64 px video strip stays (UX 15.K-4). The hint is hidden where Fullscreen is unsupported (UX 15.K-7).
> - §14.D's text "player's own full screen only; the app adds no control" is struck: the projector document has its own full screen and control (15.5).
> - Projector-only `preload="metadata"` for file videos; the control's aria label is "כפתורי המקרן"; the projector root is `role="region"`.

Status: draft (Tal's decision below; open questions in 15.11 have defaults)

Tal, running join-class locally, console at the Opening step: "I need that the teacher will be able to show videos on full screen... also when he shows his screen, he doesn't have a way to go back."

Cause, read from the code:
- The bar's "מקרן" (`teacher.screen.title`) is an `m.route.Link` to `/t/:mid/screen` in the **same tab** (`TeacherConsole.ts`, `header()`).
- The projector has no controls by design (§5, §13.8 "own window; no navigation", UX §6). A teacher who mirrors one laptop to the projector lands on a screen with no way back except the browser's back button, which is hidden in a projected browser and unknown to most teachers.
- A video fills only the projector's stage (`OpeningStage.ts`, `videoLayout`), under the question line and the title, above the code band, inside the browser's chrome. Nothing calls the Fullscreen API.

Tal's decision: design for **both** setups.
- **(a) Two screens:** the laptop shows the console; the projector shows the projector screen in its own window.
- **(b) One screen:** one laptop mirrored to the projector. The teacher switches console ↔ projector in one tab and plays videos full screen.

What this section overrides:
- §5 back paths ("projector is its own window and has 'חזרה ללוח המורה' only as a link") and §13.8 (`/t/:mid/screen`: "its own window; no navigation"). The projector now has a **teacher control** (15.4). "חזרה ללוח המורה" is retired; the console is "השיעור" (§13.3), so the way back is "חזרה לשיעור".
- §14.1 "must never see: a control on the projector window itself" now reads: no control that **drives the lesson** on the projector. The console stays the only place that moves steps or picks what the projector shows (§14.13 holds).
- UX 14.D video layout: in video mode the player fills the projector window (15.5). Proportions stay UX's.

### 15.1 Audiences
| Audience | Goal here | Must never see |
|---|---|---|
| Teacher, two screens | Put the projector on the class screen once, full screen, then drive it from the console without touching it again (except the player's play) | A second copy of the console on the wall; a new window per click |
| Teacher, one mirrored laptop | Show the projector, play a video full screen, come back to the console, move on | A screen with no way back |
| Class (looking at the wall) | See the one thing of the step, big | The teacher control when the teacher is not using it; the console's moderation ("מה כתבו", hidden texts) unless the teacher chooses to show the console |

### 15.2 Object model
No new data. Everything here is **per device, per tab**: none of it is written to Firestore, and nothing on the phones changes.

| Object | What it is | Cardinality | Where it lives | Lifecycle |
|---|---|---|---|---|
| Projector screen | The view `/t/:mid/screen`, as in §14.9 and UX §6 | 1 route | route | unchanged |
| Projector mode | How this tab shows the projector: `window` (its own window, opened from the console) or `here` (this tab switched from the console) | 1 per tab | the URL: `?mode=window`, or no parameter = `here` | set when opened; gone when the tab closes or goes back |
| Teacher control | The projector's own small set of buttons for the person at that device: full screen, and back or close | 1 per projector tab | projector view, hidden until used | hidden → shown on pointer move, tap or Tab → hidden after `PROJECTOR_CONTROLS_IDLE_MS` (3 s) idle |
| Full screen | The browser's Fullscreen API on the projector document (`document.documentElement`) | 0..1 per tab | browser | entered only by a click on that device; left by Esc, the control, or (in `here` mode) going back |
| Video mode | The projector at Opening while the lesson doc has a `projectorVideoId` (§14.2): the player fills the window | 0..1 | derived from `lessonPlan.projectorVideoId` | starts and ends with the console's choice; ends on every step change (the server clears the choice) |

Why the mode is in the URL and not guessed from `window.opener`: a refresh, a pasted link or a browser that drops the opener must still give the same controls. The parameter's absence is the safe default: `here` always has a way back.

Fixed rule for the two kinds of full screen:
- **Document full screen** (the projector tab): kept across step changes, video changes and paused/ended screens, because the route does not change.
- **Player full screen** (the YouTube player's or `<video>`'s own button): owned by the player. It ends by itself when the player leaves the page: another video chosen, "הטקסט" chosen, or the next step. A new player cannot re-enter it without a new click on that device. That is why video mode fills the window (15.5) and the teacher does not need the player's own button.

### 15.3 Labels
Every key in all seven files in `apps/join-class/src/lib/locales/{he,en,ar,es,de,nl,fa}.ts`. Hebrew marked (?) needs a native read.

| Concept | EN | HE | i18n key | Route / code | Retire |
|---|---|---|---|---|---|
| Projector (the concept; group label in the console bar; the projector's own title) | Projector | מקרן | teacher.screen.title, projector.title (kept) | /t/:mid/screen | — |
| Open in its own window | Projector in a new window | מקרן בחלון נפרד | NEW teacher.screen.open_window | → /t/:mid/screen?mode=window | the bare same-tab "מקרן" link |
| Help, own window | For two screens: drag the window to the class screen | לשני מסכים: גררו את החלון למסך של הכיתה | NEW teacher.screen.open_window_help | — | — |
| Show in this tab | Show on this screen | הצגה במסך הזה | NEW teacher.screen.show_here | → /t/:mid/screen | — |
| Help, this tab | For one computer connected to the projector. Esc brings you back. | למחשב אחד שמחובר למקרן. Esc מחזיר לשיעור. | NEW teacher.screen.show_here_help | — | — |
| Window blocked | The browser blocked the window. Allow pop-ups for this site, or use "Show on this screen". | הדפדפן חסם את החלון. אפשרו חלונות קופצים לאתר, או בחרו "הצגה במסך הזה". | NEW teacher.screen.blocked | — | — |
| Teacher control (region name for assistive tech) | Projector controls | פקדי המקרן (?) | NEW projector.controls | — | — |
| Full screen | Full screen | מסך מלא | NEW projector.fullscreen | requestFullscreen | — |
| Leave full screen (window mode only) | Exit full screen | יציאה ממסך מלא | NEW projector.fullscreen_exit | exitFullscreen | — |
| Back (here mode) | Back to the lesson | חזרה לשיעור | NEW projector.back | → /t/:mid | "חזרה ללוח המורה" (§5 text; no key exists) |
| Close (window mode) | Close the projector | סגירת המקרן | NEW projector.close | window.close() | — |
| First-open hint (window mode) | Drag this window to the class screen, then press "Full screen" | גררו את החלון הזה למסך של הכיתה ולחצו "מסך מלא" | NEW projector.window_hint | — | — |

Found while reading (fix in the same lane): `console.opening` ("פותחים…") is the busy text for **five** different actions (`StepRail` opening a step, `TeacherConsole` pausing, `LessonBanner` resuming and reopening, `TeacherHome` reopening). While pausing, the button reads "פותחים…". It also shares its prefix with the Opening-step keys `console.opening.show` / `.text`, so "opening" names two things in one key family. Smallest fix: rename the busy key to `console.busy_opening` (value unchanged, for the step rail and reopen), and add NEW `console.busy_pausing` "משהים…" (?) / "Pausing…" and NEW `console.busy_resuming` "ממשיכים…" / "Resuming…".

### 15.4 How the teacher opens the projector, and gets back
**In the console bar** (`/t/:mid`): the single "מקרן" link becomes the group "מקרן" with two actions, always both, in this order:
1. "מקרן בחלון נפרד": opens `/t/:mid/screen?mode=window` as a **separate browser window** (a pop-up window, not a tab, so it can be dragged to the second screen), with a window name per lesson (`projector-<mid>`). Pressing it again brings the same window forward instead of opening a second one. If the browser blocks it: `teacher.screen.blocked` inline in the bar, no navigation.
2. "הצגה במסך הזה": routes this tab to `/t/:mid/screen` **and, in the same click, asks for full screen** (the click is a user gesture in this document, so the browser allows it). One click from console to a full-screen projector.

The two help lines sit with the actions (form is UX's). They are what tells a teacher which one is theirs.

**On the projector, the teacher control:**
- Hidden by default. It appears on pointer move, a tap, or Tab focus on **that device**, and hides again after 3 s with no input. The pointer is hidden while the control is hidden.
- It carries no lesson data and drives nothing: no step, no video choice, no names, no code beyond the band.
- Present on every projector screen: every step, paused, ended, loading and load error. Not on "not your lesson" (it has its own links, §13.8).

| | `here` (one screen) | `window` (two screens) |
|---|---|---|
| Control | "חזרה לשיעור"; "מסך מלא" only while not full screen (refused, unsupported, or left) | "מסך מלא" / "יציאה ממסך מלא" (toggle); "סגירת המקרן" |
| Esc | Leaving full screen by Esc (or by the browser) **returns to the console**, like leaving a slideshow. Esc when not full screen does the same. | The browser's own: leaves full screen, stays on the projector |
| Browser back | → `/t/:mid` (the route was pushed) | nothing to go back to |
| "חזרה לשיעור" / "סגירת המקרן" | leaves full screen and routes to `/t/:mid` | closes the window; the console is untouched. If the browser refuses (`window.close()` only works on a script-opened window), the button becomes "חזרה לשיעור" |
| First load | already full screen (from the console's click) | the hint `projector.window_hint` shows with the control until full screen is entered or 10 s pass |

What the class must never see: the control while the teacher is not using it; a console shown on the wall in `window` mode (no button on the projector window ever navigates it to the console; "סגירת המקרן" closes it). In `here` mode the wall shows the console whenever the teacher is on it; that is the nature of mirroring (15.11 C).

### 15.5 Full-screen video
- **Who triggers full screen:** only a click on the device that shows the projector. The console in another window cannot make the projector full screen; browsers forbid it.
- **Video mode fills the window (fixed):** at Opening with a video chosen, the player takes the whole projector window. The code band and the question line are not shown while a video is chosen; they come back with "הטקסט" or the next step. With the tab in full screen, the video is therefore full screen with no further click, and the console's next choice swaps the video **without losing full screen** (document full screen survives; 15.2). Late joiners get the code back as soon as the video ends and the teacher picks "הטקסט".
- **Play:** still the player's own play button (§14: no autoplay). In `window` mode this is the one click the teacher makes on the class screen per video.
- **Step change during a video:** the server clears `projectorVideoId` (§14.2); the player leaves, the next step's screen shows, full screen stays.
- **Another video picked from the console (window mode):** the new player replaces the old one, loaded but not playing, full screen stays. If the teacher had used the player's own full-screen button, that ends with the old player; the window is still full screen.
- **The video fails (direct files only, §14):** the text comes back with `projector.video_failed`, as today.
- **~~The console never plays a video.~~ Reversed by 15.13: the console plays the introduction videos for the teacher, on the teacher's own computer.** (The original rule follows.) One place plays to the room: the projector. In the one-screen case the teacher picks the video in the console and presses "הצגה במסך הזה". Reasons: no two players with sound on one laptop, no second player in the console's weight budget, and one answer to "where do videos play".
- **Full screen unavailable** (`document.fullscreenEnabled` false, e.g. iPhone Safari, some kiosk browsers): "מסך מלא" is not shown; video mode still fills the window; `here` mode still has "חזרה לשיעור" and Esc.

### 15.6 Routes and URL
- `/t/:mid/screen`: projector, `here` mode (the default, always has a way back).
- `/t/:mid/screen?mode=window`: projector, `window` mode. Written only by "מקרן בחלון נפרד". Any other value of `mode` reads as `here`.
- No new route. `/t/:mid` and the rest of §13.1 unchanged.

### 15.7 Hierarchy (depth unchanged)
```
0 /t                          השיעורים שלי
1   /t/:mid                   השיעור; bar group "מקרן": מקרן בחלון נפרד | הצגה במסך הזה
2     /t/:mid/table/:n        שולחן n
1   /t/:mid/screen            מקרן, here mode  (teacher control: חזרה לשיעור, מסך מלא)  → back to /t/:mid
1   /t/:mid/screen?mode=window מקרן, own window (teacher control: מסך מלא / יציאה ממסך מלא, סגירת המקרן)
```

### 15.8 Back paths (replace the `/t/:mid/screen` line of §13.8)
- `here`: Esc, "חזרה לשיעור", or browser back → `/t/:mid`, same view (`?view=` kept if it was set), full screen left.
- `window`: "סגירת המקרן" closes the window; the console window is where the teacher already is. No path from the projector window to the console.

### 15.9 Task flows
**Teacher, one screen: show the introduction, play video 1 full screen, back, next step (9 actions):**
1. `/t/:mid`: "פתיחת השלב הבא: פתיחה".
2. "הצגה במסך הזה": the projector, full screen, the question and the text big.
3. Esc: back to the console.
4. "על המקרן: 1. <title>".
5. "הצגה במסך הזה": the video fills the screen.
6. The player's play.
7. Esc: back to the console (full screen left, the video stops with the page).
8. "פתיחת השלב הבא: צד".
9. "הצגה במסך הזה": the two sides on the wall.
Shortcut: a teacher who starts with the video picks it at step 1½ and skips 3-4 (7 actions).

**Teacher, two screens: set up once (3 actions):**
1. `/t/:mid`: "מקרן בחלון נפרד": a window opens with the hint.
2. Drag it to the class screen.
3. On it: "מסך מלא". From now on the console drives it.

**Teacher, two screens: introduction and video 1 (5 actions, one of them on the class screen):**
1. "פתיחת השלב הבא: פתיחה": the wall shows the text.
2. "על המקרן: 1. <title>": the video fills the wall.
3. On the class screen: the player's play.
4. "על המקרן: הטקסט": the text and the band come back.
5. "פתיחת השלב הבא: צד".

**Teacher, two screens: done (1 action):** "סגירת המקרן" on the projector window, or close it; or leave it: it follows the lesson to "השיעור הסתיים" by itself.

### 15.10 Screen inventory (rows added or changed)
| Screen | Route | Single job | Empty | Loading | Error | No permission | Done |
|---|---|---|---|---|---|---|---|
| Console bar, "מקרן" group (changed) | /t/:mid | open the projector the way this room needs | — | — | window blocked: `teacher.screen.blocked` inline | not your lesson (§13) | the projector opens (window) or this tab switches (here) |
| Projector, `here` mode (new) | /t/:mid/screen | show the step to the class from this tab, and give the teacher a way back | as §14.9 / UX §6 per step | `projector.loading` + control (back) | `projector.error` + control (back); full screen refused: shown windowed with "מסך מלא" | NotYourLesson (its own links) | back to `/t/:mid` |
| Projector, `window` mode (changed) | /t/:mid/screen?mode=window | show the step on the second screen, driven from the console | as above; first load: `projector.window_hint` | as above + control (close) | as above + control (close); close refused: "חזרה לשיעור" | NotYourLesson | closed by the teacher, or follows to ended |
| Projector, video mode (changed) | either | the chosen video fills the window | — | the player's own | direct file failed: text + `projector.video_failed` | — | "הטקסט" or next step |

### 15.11 Open questions, each with a default
- **A. A forward control on the projector in `here` mode** ("פתיחת השלב הבא: …" inside the teacher control), saving the one-screen teacher 2 actions per step. [Default: no. One forward control, in the console (§5). Revisit if one-screen teachers report the round trip as a burden.]
- **B. Hide the code band during video mode.** [Default: yes (15.5). Alternative: keep a small band and let the video fill the rest.]
- **C. The console on the wall in `here` mode.** Students see whatever the console shows when the teacher returns to it, including "מה כתבו" and hidden texts. [Default: accept, with no extra copy; the help line already says this is one mirrored computer. Add a warning only if teachers raise it. A "hide names" console option would be a separate spec.]
- **D. Remember the setup per device** (put the last used action first, or open it straight away). [Default: no; both actions always shown, same order. A `localStorage` hint is a per-device convenience UX may add.]
- **E. Play from the console** (the console starts the video on the projector). Needs the YouTube IFrame API (rejected in UX 14.J-5) and autoplay with sound, which browsers allow only after a click in the projector document. [Default: no in phase 1; the player's own play.]
- **F. Place the window on the second screen automatically** (Window Management API, Chrome only, permission prompt). [Default: no; drag by hand, the hint says so.]
- **G. Esc in `here` mode goes back** even when the teacher used the player's own full-screen button (Esc then leaves both). [Default: yes; with video mode filling the window the player's own button is not needed.]

What would change if wrong: if Tal wants the projector to be able to drive steps (A), the teacher control gains one button and §5's "one forward control" needs an exception. If Tal wants no full screen in `here` mode by default, "הצגה במסך הזה" just routes and "מסך מלא" is always shown; nothing else moves.

### 15.12 Handoff to UX
Fixed here:
- the two console actions, their order, their labels and help lines
- `?mode=window` vs no parameter; window, not tab; one window per lesson
- "הצגה במסך הזה" enters full screen in the same click; Esc and "חזרה לשיעור" leave it and go back
- the teacher control's contents per mode, its show/hide triggers, its 3 s idle, and that it drives nothing
- video mode fills the window and hides the band; document full screen survives video and step changes
- ~~the console never plays a video~~ (reversed, see 15.13)
- every state in 15.10

Yours to decide:
- the form of the "מקרן" group in the bar (a menu with two items, or two buttons), and where the help lines show
- the teacher control's position and form on the projector, and how it reads on a 4 m wall without catching the class's eye
- the window's opening size
- how video mode handles letterboxing and the title before play (§14.13's question still open)

Questions for you:
- Should the console show that a projector window is open (and offer to bring it forward), or is pressing "מקרן בחלון נפרד" again enough?
- Does the first-open hint need a drawing of "drag to the other screen", or are words enough for teachers?

### 15.13 The introduction on the console board (Tal, 2026-10-22, second request)

Tal, at the Opening step of the console, said: "Again, I want to show the videos FROM THE TEACHER'S COMPUTER, and I don't see how... I would expect them to appear in the bottom part."

What he saw: the board under the switch band showed only the roster card "הכיתה · 2" and a large empty area. The videos could be reached only through "על המקרן:" in the band, which drives the projector and never plays anything on the console.

**What this overrides:**
- **§15.5 "The console never plays a video" is reversed.** The console now plays the introduction's videos for the teacher on the teacher's own computer, and can show one full screen. Delete that bullet from 15.5 and the matching line in 15.12 ("the console never plays a video").
- **§15.9, one-screen flow:** the teacher no longer needs the projector route to play a video. The projector (`here` mode) is still how the text is shown big.
- **§14.13 "the console as the only way to drive the projector" still holds.** Playing a video on the console drives nothing: it writes no field and changes nothing on the projector or on the phones.

#### 15.13.1 Object
There is no new data and nothing is written to Firestore. Everything below is per tab.

| Object | What it is | Cardinality | Where it lives | Lifecycle |
|---|---|---|---|---|
| Opening panel | The console board's view of the introduction at Opening: the text, then the videos | 0..1, only while the step is Opening and the view is "שולחנות" | console board | shows on entering Opening and leaves on the next step |
| Console player | One video playing on the teacher's computer | 0..1 per console tab (opening another closes the first, the same rule as the phone) | inside its row in the panel | closed → open (loaded, not playing) → played by the player's own button → closed by opening another video, leaving Opening, or leaving the route |
| Console full screen | The Fullscreen API on the **row's player frame**, not on the document | 0..1 | browser | starts only with the teacher's click; ends with Esc or the browser |

#### 15.13.2 Rules
1. **Two players, two places.** "לצפות כאן" on the console opens the console player only. It never writes `projectorVideoId`. "על המקרן:" in the band moves the projector only, and never opens or closes the console player.
2. **The same video on both.** If the projector window shows the video the teacher opens on the console, both stay as they are: the app does not pause, mute or sync either one. The row's tag "על המקרן עכשיו" already tells the teacher that the projector is on the same video. With two screens, the projector is what the class watches. The console player is for the one-screen teacher, or for a preview.
3. **One screen.** The teacher plays the video on the console and presses "מסך מלא". The mirrored wall shows the video full screen. Esc returns to the console with the panel exactly as it was. No route change, no projector.
4. **Paused or ended lesson:** the panel and its players stay usable, because they drive nothing. A teacher may pause the lesson in order to show a video. Only "על המקרן:" is disabled while the lesson is held (UX 14.E).
5. **No autoplay.** Opening a row loads the player; the teacher presses the player's own play (the §14 rule, unchanged).
6. **Full screen is the player frame's, not the document's.** The console document never goes full screen. That keeps it separate from the projector's `here` mode, where leaving full screen navigates back (15.4). Leaving the frame's full screen just returns to the panel.

#### 15.13.3 How the roster and the panel share the board at Opening
- The **panel comes first**, in the main column (the start side, right in RTL), because it holds the step's content.
- The **roster card "הכיתה · n"** moves to a narrow side column (the end side). It keeps its chips and its count, so late joiners can still be watched.
- Below 1024 px the two stack: the panel first, then the roster.
- The roster is never collapsed. It is small, and the teacher watches arrivals during Opening.
- In the "מה כתבו" view the panel is not shown. There is nothing written at Opening, and the view stays what it is today.

#### 15.13.4 Labels (all 7 locales; (?) = needs a native read)
| Concept | EN | HE | i18n key | Note |
|---|---|---|---|---|
| Panel heading | Introduction | הקדמה | `plan.intro.title` (reused) | The teacher's name for this content, the same as on the plan screen. Students and the projector still never see the word. |
| Edit link | Edit the introduction | עריכת ההקדמה | NEW `console.intro.edit` | → `/t/:mid/plan?focus=intro` |
| No introduction | This lesson has no introduction. | לשיעור הזה אין הקדמה. | NEW `console.intro.empty` | |
| Add link | Add an introduction | להוספת הקדמה | NEW `console.intro.add` | → `/t/:mid/plan?focus=intro` |
| Videos heading | Videos | סרטונים | `opening.videos` (reused) | |
| Play on this computer | Watch here | לצפות כאן | `opening.play` (reused) | "Here" means this device for both the student and the teacher, so one name. |
| Untitled video | Video {{n}} | סרטון {{n}} | `opening.video_n` (reused) | |
| Projector tag | On the projector now | על המקרן עכשיו | `opening.on_projector` (reused) | |
| Full screen | Full screen | מסך מלא | `projector.fullscreen` (reused) | One concept, one key. The accessible name is "מסך מלא: {label}", composed with no new key. |
| File video failed (console) | This video did not load. Check the link in the plan. | הסרטון לא נטען. בדקו את הקישור בתכנון. | NEW `console.intro.video_failed` | The phone's "המורה מקרין" is wrong for the teacher. |

#### 15.13.5 Screen inventory (row added)
| Screen | Route | Single job | Empty | Loading | Error | No permission | Done |
|---|---|---|---|---|---|---|---|
| Console board at Opening (changed) | /t/:mid | read the introduction, play a video here, full screen | `console.intro.empty` + `console.intro.add` | `description` as plain text until the blocks arrive | text fetch failed: plain `description`, no error; file video failed: `console.intro.video_failed` in its row | not your lesson (§13) | the next step replaces the panel with the table board |

#### 15.13.6 Task flows
**One screen: show the text, then play video 1 full screen (6 actions, was 12 with the menu):**
1. "פתיחת השלב הבא: פתיחה". The board shows the panel.
2. "מקרן ▾" → "הצגה במסך הזה": the wall shows the text big. Esc returns to the console. This step is optional: the teacher can read from the panel.
3. On the panel, video 1: "לצפות כאן".
4. "מסך מלא".
5. The player's play.
6. Esc, then "פתיחת השלב הבא: צד".

**Two screens:** unchanged (15.9). The console player is optional, a preview.

#### 15.13.7 Open questions, each with a default
- **A. Pause the projector's copy when the console plays the same video?** [Default: no. That needs the YouTube IFrame API (rejected in 14.J-5), and the tag already warns.]
- **B. Show the challenge question in the panel?** [Default: no. The bar carries the lesson name and the teacher knows the question. Add it only if teachers read the panel aloud as a script.]

## 16. The table turn, one path per role (Tal, 2026-10-22)

Status: decided and built (Tal, 2026-10-22). The decisions below replace the three open questions of 16.11.
Scope: the student phone inside Table talk (`TableFlow`, the four table steps) and the teacher's table card and sheet, for one turn, the next turn and the last turn. Proposals (talk → write → rate, no asker hand-off) follows 16.4 without the pick and hand-off moments.
Overrides: §11.6 (the strip that switches screens), the pick-step control label in §6 and UX §2.6.1, "סבב הבא" in §6 / UX §2.6.4, and the "after the last turn" line of UX §2.6.4. Everything else in §2.4, §3 and §11.3 stays.
Method: read `TableFlow.ts`, `SubStepStrip.ts`, `QuestionPick.ts`, `TalkScreen.ts`, `WritePanel.ts`, `RatedList.ts`, `c3Logic.ts`, `tableTransitions.ts`, `fn_classTableStep.ts`, `fn_classAllTablesTo.ts`, `tableMembership.ts`, `TableCard.ts`, `TableSheetPanel.ts`, `locales/he.ts`.

### Decisions of Tal, 2026-10-22 (final; they override anything below that differs)
1. **Every tablemate with a device asks once.** Whose turn it is to ask is visible on every phone (the askers row: asked / asking now / not yet; the asker's own phone says "התור שלכם לשאול"). A student who has asked cannot ask again: the server enforces it with the optional `askedUids` on `ClassTable`.
2. **The next asker is the first to tap.** At the rate step every student who has not asked sees the hand-off card ("אחרי הדירוג: אפשר לשאול" and "להתחיל את התור שלי"); the first claim wins; a lost race shows no error, only whose turn it is. When one student is left it reads "התור שלכם לשאול" and only they have the button. When everyone has asked: "דרגו, ואז חכו לשאר השולחנות" and no button. "Table done" is derived (all device members in `askedUids` or the current asker at rate): no stored `finished`, no `turnsPerTable`.
3. **The first speaker is chosen by the asker only** (as built). After a minute ends any tablemate may tap the next name (as built).
4. **The strip (שאלה · מדברים · כותבים · מדרגים) stays a tappable peek, not read-only.** The phone defaults to the official step and returns to it; the official pill is marked "עכשיו" in words (not by colour alone); on a non-official screen EVERY control is disabled (chips, buttons, editors' send, the claim) and one short line says what the table is doing now ("השולחן עדיין בשלב השאלה") with the one live control "חזרה לעכשיו"; when the official step changes the phone jumps to it.
5. **Teacher:** the Tables card shows "סבב n מתוך max", who the table waits for and one next-step button (infinitive verbs); the table sheet has every step verb, "לדבר עכשיו" per member at talk and "להעביר את התור ל…" per not-yet member at pick (built as `passAsker`, E3).
6. **Gender-neutral strings** ("התור של {{name}} ל…"), no slash forms.

### 16.1 What Tal found, and why (diagnosis)
**Finding 1: a screen that looks live but is not the table's step.** The table was at `pick`. Tal tapped "מדברים" in the strip, got the full talk screen (dark, "1:00", name chips) and, as the asker, tapped a name. The server refused (`nextSpeaker` is allowed only from `talk`), and the screen showed nothing, or at best "זה לא עבד".
- D1 (severe). **The strip makes two "current" screens.** `resolveSubstep` lets a phone show any of the four screens while the table doc is elsewhere. Every screen is drawn with its real controls (chips, "לקרוא בקול ולהתחיל", "שליחה", "סבב הבא"), enabled by role alone, never by the official step. Principle broken: one place per state; a state must look like what it is. The "official" pill differs from the "viewed" pill only by a style.
- D2 (severe). **The header lies.** `turn.header` is filled from the viewed step (`view.current`), not the official one, so "עכשיו: מדברים" appeared while the table was at `pick`. "עכשיו" is the one word on the screen that promises truth.
- D3. **"Start" twice.** The pick control reads "לקרוא בקול ולהתחיל" (read aloud and start), but it only moves the table to `talk`; nothing starts. The asker then has to tap a name chip ("מי מדבר ראשון?") to start the first minute. A 13-year-old who read "ולהתחיל" expects a clock to run.
- D4. **Instructions are step names, not instructions.** `turn.instr_write` = "כותבים", `turn.instr_rate` = "מדרגים", and `turn.instr_pick` = "בחרו שאלה" is shown to tablemates who cannot choose.

**Finding 2: "when the first question was answered by all, how do the others start their turn to ask?"**
- D5 (severe). **The turn's end has no place.** There is no moment called "the turn is over". The rate step simply holds a button "סבב הבא" on the current asker's phone. Nobody else sees that a hand-off is coming, who gets it, or what to do. Tablemates get no sign that the table is waiting for one tap.
- D6. **"סבב הבא" hides who is next.** After the tap, the next asker gets only one small line, "התור שלכם לשאול", on top of a pick screen that looks like the one before. The table cannot tell from the phones whose finger moves it now.
- D7. **The wrong person holds the hand-off.** The student who wants to act ("my turn to ask") has no control. The student who has the control has finished their own part and is the one most likely to stop paying attention.
- D8. **The turn limit does not exist.** §9 item 2 says 2 turns by default. Nothing in the engine or the settings counts them, so "סבב הבא" works forever. "חכו לשאר השולחנות" (UX §2.6.4) has no state to show it in.
- D9. **The teacher cannot finish a turn.** The table card and sheet offer "לכתיבה" and "לדירוג" only. The engine already lets an admin run `nextTurn`, but no screen offers it. If the asker is out at `rate`, the table is stuck.

Labels that mislead today: "לקרוא בקול ולהתחיל" (D3); "סבב הבא" (D6); "כותבים" / "מדרגים" as instructions (D4); "השואל בוחר את הדובר הבא" (`turn.asker_picks_next`: gendered, and §3 already flagged "השואל"); the pills "שאלה · מדברים · כותבים · מדרגים" as buttons (D1).

### 16.2 Decision: the strip becomes a peek that cannot act (replaces "a progress line, not a switch")
The four pills stay a **tappable peek** (Tal's decision 4): where the table is now, what came before, what comes next. The phone defaults to and returns to the table's official step; the official pill says "עכשיו" in words. A peeked screen has every control disabled and one line says what the table is doing now, with "חזרה לעכשיו". The header's "עכשיו:" always names the official step. (The first draft proposed a read-only line; Tal kept the peek, so the rule below is what makes it safe.)
The peek's cost, accepted: a 13-year-old reads a screen by its controls, not by a banner, so a peeked screen is drawn with all controls disabled (dimmed), a one-line reason and one live control, "חזרה לעכשיו", at the bottom where the forward control normally sits.
Why not remove it: the line is the only thing that tells the table that a turn has four parts, and where they are in it. It costs one row.
What §11.6 was for, and where it lives now:
- The question → stays on top of the talk and write screens.
- The class's answers → the sheet "הכיתה כותבת", open at every step (§2.4).
- My own sent answer → shown on the rate screen as "התשובה שלי", with an edit action there (UX decides the shape).
Nothing else from an earlier screen is useful after the table has left it.
Rule for any off-step view: it must never offer a control that writes to the table doc; the only live control is "חזרה לעכשיו".

### 16.3 Who moves the table: one finger per moment
| Moment (official step) | Forward control | On whose phone | Fallback if that student does not tap |
|---|---|---|---|
| A. Choose (`pick`) | "בחרנו, לדבר" | asker | teacher: "לשיחה" (?) on the card (admin `toTalk`), or move the asker on (16.6) |
| B. Before the first speaker (`talk`, nobody speaking) | a name chip ("מי מדבר ראשון?") | asker | teacher. **Pending, Tal decides:** any tablemate may tap the first chip (16.9) |
| C. Speaking (`talk`, minute running) | a name chip, for the next speaker | asker | when the minute is over, any tablemate (exists) |
| D. Everyone spoke (`talk`, all ✓) | "סיימנו, לכתוב" | asker at any time; anyone once all have spoken (exists) | teacher "לכתיבה" |
| E. Write (`write`) | "שלחנו, לדרג" | asker | teacher "לדירוג" |
| F. Rate, then the hand-off (`rate`) | "להתחיל את התור שלי" | **the next asker** (new) | teacher "סבב הבא" (new on the card) |
| G. Last turn done (`rate`, `finished`) | none | — | teacher may give an extra turn: "סבב נוסף" |

Every student's own action stays open to them at every step, outside this table: "+ שאלה משלנו" (A), "שליחה" (E), and rating in the sheet (any step).

### 16.4 The path, per role
Format: what each phone shows · the one ≤7-word instruction · the forward control. Names are examples: Dana is the asker of turn 1, Noa is next, Omri and Lior are tablemates.

**Turn 1** (the first asker = earliest `joinedAt`, as built)
1. A. Choose (`pick`)
   - Dana: the teacher's questions, tappable; "+ שאלה משלנו" · "בחרו שאלה לשולחן" · "בחרנו, לדבר" (enabled once one is chosen)
   - Tablemates: the same list, read-only; the chosen one fills live; "+ שאלה משלנו" · "התור של דנה לבחור שאלה" · none
   - Teacher card: "שולחן 3 · סבב 1 מתוך 2 · בוחרים שאלה · התור של דנה"
2. B. Before the first speaker (`talk`). The screen turns dark. The question is on top. "1:00" is shown faint.
   - Dana: chips are enabled · "קראו בקול. מי מדבר ראשון?" · tap a chip
   - Tablemates: chips are visible but disabled · "מקשיבים לשאלה. מסכים למטה."
3. C. Speaking (`talk`, minute running)
   - Speaker's phone: "התור שלכם לדבר"
   - Everyone else: "מסכים למטה. מדברים."
   - Dana: chips stay enabled, so a speaker who finishes early can be moved on
   - Minute over → "הזמן נגמר. מי הבא בתור?" on every phone; chips are enabled for everyone
4. D. Everyone spoke (`talk`, all ✓)
   - Every phone: "כולם דיברו" · "סיימנו, לכתוב" (Dana could tap it at any time before this)
5. E. Write (`write`)
   - Dana: the mode switch (default "כולם כותבים") and the box · "כתבו תשובה לשאלה" · "שליחה", then "שלחנו, לדרג"
   - Tablemates: the box · same instruction · "שליחה". In "תשובה אחת לשולחן" mode they see the draft read-only · "עוזרים בקול לדנה"
6. F. Rate and hand-off (`rate`)
   - Every phone: the class's answers inline, "התשובה שלי" on top, and a table line "שלחו 3 מתוך 4" (answers by this table this turn; information, never a gate)
   - Noa (next asker): the line "אחרי הדירוג: התור שלכם לשאול" · "דרגו, ואז התחילו לשאול" · **"להתחיל את התור שלי"**
   - Dana and the others: "דרגו את התשובות של הכיתה" · line "בסבב הבא שואלת: נועה" (?) · none
   - Teacher card: "מדרגים · הבא בתור לשאול: נועה" · quick action "סבב הבא"

**Turn N+1** (Noa taps "להתחיל את התור שלי"; the engine runs `nextTurn`: turn + 1, asker = Noa, step `pick`)
7. A again. The header reads "שולחן 3 · סבב 2 · עכשיו: בוחרים שאלה". The progress line resets.
   - Noa: "התור שלכם לשאול" (the asker line) · "בחרו שאלה לשולחן" · "בחרנו, לדבר". Questions used at this table are greyed and last (built).
   - Others: "התור של נועה לבחור שאלה"
   - Steps 2-6 repeat with Noa as asker. At F the next asker is the one after Noa in seating order.

**Last turn** (turn = the lesson's turns per table, default 2)
8. F on the last turn: nobody gets "להתחיל את התור שלי". Every phone shows the line "זה היה הסבב האחרון".
   - Noa (the asker of this turn): "סיימנו" (closes the table's turns; new). The engine sets `finished`, and the step stays `rate`.
   - Fallback: the teacher's "סבב הבא" on this table does the same thing.
9. G. Finished (`rate`, `finished`)
   - Every phone: "חכו לשאר השולחנות" as the instruction · the class list stays open and ratable · no forward control
   - Teacher card: "סיימו 2 סבבים" · quick action "סבב נוסף" (admin `nextTurn`: turn + 1, next asker, `finished` cleared)
   - The class moves on only through the teacher's "פתיחת השלב הבא".

Step counts. Asker, one turn: 4 taps (question, "בחרנו, לדבר", first chip, "שלחנו, לדרג") + 1 per speaker + their own send. Next asker: +1 ("להתחיל את התור שלי"). Tablemate: send + ratings. Teacher: 0 taps when tables move themselves.

### 16.5 The hand-off moment, fixed
- Name: **"התור שלכם לשאול"** for the student who gets the turn, and "התור של נועה לשאול" for the others. One name, already in §3 (`turn.asker`); there is no new noun.
- Where it lives: inside the `rate` step of turn N, not in a new table step. The rate step is when the table has stopped talking and writing, so the next asker can see their turn coming without a screen jump.
- Who sees what:
  - The next asker gets a heads-up line plus the control.
  - Everyone else gets "בסבב הבא שואלת: נועה".
  - The teacher's card names the next asker.
- After the tap, the pick screen of turn N+1 is itself the confirmation: the header's סבב number and the asker line change on every phone at once.
- The asker rotates in seating order (`nextAsker`, built). Students without a device are never askers: `memberUids` holds only uids.
- When does a turn end: when the next asker taps, or when the teacher does. The engine does not count who wrote or rated. The line "שלחו n מתוך m" is the cue to wait; the teacher reads the room (§9 item 9).

### 16.6 Stuck cases
| Case | What the table sees | Who unsticks it, how |
|---|---|---|
| Asker absent, no device, or not tapping, at A or E | the step does not move; the instruction names them ("התור של דנה לבחור שאלה") | Teacher: card action ("לשיחה" / "לדירוג"), or sheet → "להעביר את התור ל…" (E3: moves the asker without using a turn). Absent for the lesson: sheet → "הסרה", and the asker passes on (built in `tableMembership`) |
| Asker not starting the first speaker (B) | dark screen, faint "1:00", "מקשיבים לשאלה" | Teacher, from the sheet, taps a member to start. Option pending for Tal (16.9) |
| A tablemate never spoke (absent, silent) | "סיימנו, לכתוב" stays on the asker's phone only; others need everyone ✓ | Asker taps "סיימנו, לכתוב" (always allowed), or the teacher taps "לכתיבה". No rule change: a silent student is a teacher matter, not a lock |
| Next asker absent at F | nobody has "להתחיל את התור שלי" | Teacher "סבב הבא" (the asker after them is skipped to); or the teacher removes the absent student first |
| Teacher moves the table (card, sheet, or "כל השולחנות: מדרגים") | every phone follows the official step at once; an unsent draft gets "לשלוח כמו שזה?" (UX §2.6.3) | — . No local view can survive a move, because there is none (16.2) |
| Turn limit reached | "זה היה הסבב האחרון" → "חכו לשאר השולחנות" | Teacher: "סבב נוסף" on that table, or "פתיחת השלב הבא" for the class |
| Asker taps on a stale phone (server refuses) | inline "זה לא עבד. לנסות שוב" + the screen redraws to the real step | — . Can no longer come from the strip |

### 16.7 Labels (new or changed; join-class `locales/*.ts`, all 7 files: he, en, ar, es, de, nl, fa)
| Concept | HE | EN | i18n key | Change |
|---|---|---|---|---|
| Confirm the question, go to talk | בחרנו, לדבר | We chose, let's talk | `question.read_start` → rename `turn.to_talk` | replaces "לקרוא בקול ולהתחיל" |
| Write → rate | שלחנו, לדרג | We sent, let's rate | `turn.to_rate` | replaces "לדרג" |
| Start my turn (next asker) | להתחיל את התור שלי | Start my turn | `turn.start_mine` NEW | replaces "סבב הבא" on students' phones |
| Heads-up for the next asker | אחרי הדירוג: התור שלכם לשאול | After rating: your turn to ask | `turn.next_is_you` NEW | |
| Who asks next (others) | בסבב הבא שואלת: {{name}} (?) | Next turn's asker: {{name}} | `turn.next_is` NEW | gender: maybe "בסבב הבא: התור של {{name}}" (safer) |
| Close the last turn | סיימנו | We're done | `turn.finish_turns` NEW | |
| Last turn notice | זה היה הסבב האחרון | That was the last turn | `turn.last_turn` NEW | |
| Finished, wait | חכו לשאר השולחנות | Wait for the other tables | `turn.wait_others` NEW | |
| Table sent count | שלחו {{n}} מתוך {{m}} | {{n}} of {{m}} sent | `turn.sent_count` NEW | |
| Instr. pick, asker | בחרו שאלה לשולחן | Choose a question for the table | `turn.instr_pick` | value changed |
| Instr. pick, others | התור של {{name}} לבחור שאלה | It's {{name}}'s turn to choose | `turn.instr_pick_other` NEW | |
| Instr. before first speaker, asker | קראו בקול. מי מדבר ראשון? | Read it aloud. Who speaks first? | `turn.instr_read` NEW (absorbs `turn.who_first`) | |
| Instr. before first speaker, others | מקשיבים לשאלה. מסכים למטה. | Listen to the question. Screens down. | `turn.instr_listen` NEW | |
| My minute | התור שלכם לדבר | Your turn to speak | `turn.speak_mine` NEW | (in UX §3, never keyed) |
| Minute over | הזמן נגמר. מי הבא בתור? | Time's up. Who's next? | `turn.time_up` | value extended |
| All spoke | כולם דיברו | Everyone spoke | `turn.all_spoke` NEW | |
| Instr. write | כתבו תשובה לשאלה | Write an answer to the question | `turn.instr_write` | value changed |
| Instr. write, table mode, others | עוזרים בקול ל{{name}} | Help {{name}} out loud | `turn.instr_help` NEW | |
| Instr. rate | דרגו את התשובות של הכיתה | Rate the class's answers | `turn.instr_rate` | value changed |
| Hint under chips, not asker | {{name}} בוחר/ת מי הבא | {{name}} chooses who's next | `turn.asker_picks_next` | value changed, names the asker; drops "השואל" |
| Progress line label (screen reader) | איפה השולחן עכשיו | Where the table is now | `turn.strip_label` | value changed; pills `turn.pill_*` kept as text |
| Teacher: turn count | סבב {{n}} מתוך {{max}} | Turn {{n}} of {{max}} | `console.turn_n` | value changed (+max) |
| Teacher: next asker | הבא בתור לשאול: {{name}} | Next to ask: {{name}} | `console.next_asker` NEW | |
| Teacher: to talk | לשיחה (?) | To talking | `console.quick_talk` NEW | noun form, like "לכתיבה" / "לדירוג" |
| Teacher: next turn | סבב הבא | Next turn | `console.quick_next_turn` NEW | the label moves here from the student phone |
| Teacher: extra turn | סבב נוסף | One more turn | `console.extra_turn` NEW | |
| Teacher: table finished | סיימו {{n}} סבבים | Done: {{n}} turns | `console.turns_done` NEW | |
| Teacher: pass the asker | להעביר את התור ל{{name}} | Give the turn to {{name}} | `console.pass_asker` NEW | E3 |
| Lesson setting | סבבים לכל שולחן | Turns per table | `plan.turns_per_table` NEW | default 2 |
Retired: `turn.next_turn` on student phones ("סבב הבא" lives on the console only); `turn.who_first` folded into `turn.instr_read`; `question.read_start`. Note: the console's quick actions are nouns ("לכתיבה", "לדירוג"), so the talk one is "לשיחה" (?) to match; the UX agent picks one form for all three, but it must be one form.

### 16.8 Engine changes (functions + shared-types), minimal
- E1. **The next asker may run `nextTurn`, from `rate` only.** In `assertMayAct`: role `member` and `uid === nextAsker(memberUids, askerUid)` and `step === 'rate'`. The asker keeps the right in the engine, with no UI. Why: D7. The transaction makes a double tap harmless: the second call fails `ALLOWED_FROM` because the step is `pick` by then.
- E2. **Turn limit.**
  - New lesson setting `turnsPerTable` (main statement settings, default 2, range 1-5).
  - New optional `finished?: boolean` on `ClassTableSchema`. It is optional, not a picklist value, to avoid the strict-parse trap.
  - `nextTurn` by a non-admin when `turn >= turnsPerTable` writes `{ finished: true }` and keeps `step: 'rate'`.
  - `nextTurn` by an admin always starts a new turn and clears `finished`.
  - `finished` blocks every non-admin action except rating, which is not a table action.
  - The callable reads the limit; the pure machine takes it in `TransitionContext`.
- E3. (small, can follow) **`passAsker`** action: admin only, at `pick`. Sets `askerUid = nextAsker(...)` without touching `turn` or `usedQuestionIds`. Why: skip an absent or unwilling asker without using one of the two turns.
- E4. **No change** to `nextSpeaker`, `toWrite` or `everyoneSpoke`.
- Pending, Tal decides, not specified here: let any tablemate start the first speaker. That would be one clause in `assertMayAct`: member, `nextSpeaker`, `step === 'talk'`, no `speakerUid` yet.

### 16.9 Pending option, not decided: who may start the first speaker
- (a) Asker only (built). One finger, but an absent asker stalls step B until the teacher acts.
- (b) Any tablemate, once the table is at `talk` with no speaker. No stall, and it matches the rule after each minute ("anyone, once the minute is over"). Risk: two tablemates tap different chips at once. The transaction keeps the first; the second tap becomes "next speaker" only if the minute is over, otherwise it is refused and shown as "זה לא עבד".
- (c) Any tablemate after a grace period (for example 20 s with no speaker). Adds a timer rule to explain.

### 16.10 Screen inventory (rows changed)
| Screen | Route | Single job | States added |
|---|---|---|---|
| Table talk, student | `/m/:mid` (table step inside) | do the table's official step | progress line, read-only; F: hand-off line + control on the next asker; last turn: "זה היה הסבב האחרון"; finished: "חכו לשאר השולחנות" with the list ratable; refusal: inline retry + redraw to the official step |
| Table card / sheet, teacher | `/t/:mid`, sheet | see and fix one table | "סבב n מתוך max"; "הבא בתור לשאול"; actions "לשיחה" (?), "לכתיבה", "לדירוג", "סבב הבא" / "סבב נוסף"; sheet: "להעביר את התור ל…" |
| Plan the questions | `/t/:mid/plan` | + "סבבים לכל שולחן" in the lesson details | — |

Handoff to UX. Fixed here:
- the official step is the only screen
- the progress line is not interactive
- one forward control per moment, held by the student named in 16.3
- the hand-off lives at `rate` and is pulled by the next asker
- the labels in 16.7

Yours to decide:
- how the progress line reads as "not buttons" (and in the dark talk screen)
- how the next asker's phone draws attention without sound or motion that disturbs the room
- whether "שלחו n מתוך m" is text or dots
- the shape of "התשובה שלי" with edit on the rate screen
- whether a teacher's move shows a one-line notice on the phones

### 16.11 Open questions for Tal (ANSWERED 2026-10-22: see the decisions above)
1. **The strip.** May the four pills stop being buttons and become a read-only progress line (16.2), overriding your §11.6? Recommended: **yes**. Your phone test is exactly the failure a switch invites. The question and the class list, the two things worth seeing off-step, are already on every screen.
2. **Who may start the first speaker** (16.9: asker only / any tablemate / any tablemate after 20 s)? Recommended: **(b) any tablemate**. It matches the rule you already have after each minute, and the engine change is one clause. Yours to decide.
3. **Turns vs table size.** With 2 turns and 4 at a table, two students never ask. Keep the default at 2, or make it "one turn per tablemate"? Recommended: **keep 2** (time), shown to the teacher as "סבב 2 מתוך 2", with "סבב נוסף" per table for a table that wants more.

**Answered:** (1) the strip stays a peek (decision 4); (2) the asker only starts the first speaker (decision 3); (3) no turn limit and no "סבב נוסף": every device member asks once (decisions 1-2).
