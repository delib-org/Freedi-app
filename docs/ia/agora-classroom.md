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
