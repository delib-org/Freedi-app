# join-class: Tables inside Class (registration and table-paced discussion) — IA spec

Status: draft (direction approved by Tal, 2026-11-11; decisions in section 9 are open)
Date: 2026-11-11
Supersedes: the routes, host home and "Room screen" label of [shared-table-assignment.md](shared-table-assignment.md). Its objects, privacy rules, participant steps and Hebrew copy stay approved and are not repeated here.
Builds on: [join-class-lesson-plan.md](join-class-lesson-plan.md) (plan, game, lesson, class home), [agora-classroom.md](agora-classroom.md) (lesson status, console, projector), [join-class-no-device.md](join-class-no-device.md).
Hosts: class.wizcol.com (`apps/join-class`). `apps/tables` is retired after cutover (section 5).

Two use cases, one product:
1. **Pre-registration**: people register before an event and get a table. A discussion afterwards is optional.
2. **Free discussion**: a lesson where each table moves at its own speed.

They are independent. Registration is about *who sits where*; pace is about *who moves the steps*. Any lesson can have either, both or neither.

## 1. Audiences

| Audience | One-line goal | Must never see |
|---|---|---|
| Host: a teacher (school) or an event host (community). Google sign-in | Seat people, start the discussion, see which table needs help, open the vote | A person's position or topic choices, in any lesson that used registration; other hosts' work |
| Participant: a student (12–15) or an adult. Anonymous, name only, own phone | Know where to sit; then talk, write and rate with the table without waiting for anybody | Other people's position or choices; a draft seating; the host's controls |
| The room: a projector driven by the host's browser | Join by QR or code; find a name at a table; see how the room is doing | Positions, choices, a child's refused text |

## 2. Object model

| Object | Meaning | Relations | Lifecycle |
|---|---|---|---|
| Lesson (`Statement`, question, with `statementSettings.lessonPlan`) | One live discussion with one group | 0..1 table assignment; n tables; 1 game snapshot | live / paused / open / ended (unchanged) |
| Table assignment (`TableAssignment`) | Registration and seating for one event | 0..1 lesson (`contextStatementId` = lesson id; the field exists and no client reads it today); n topics, registrations, runs | draft → registrationOpen → registrationClosed → published → ended (unchanged) |
| Topic (`TableAssignmentTopic`) | What a table is about; chosen **before** seating | 1 assignment; 0..n tables | unchanged |
| Guiding question (`Statement`, `classRole: guiding`) | A question a table picks **after** seating, at Table talk | lesson 0..n; a table picks one at a time | unchanged |
| Challenge question (`Statement`, `classRole: challenge`) | The one question the whole room writes proposals for | lesson 1 | unchanged |
| Registration = name card + private answers | A person in an assignment | 1 per browser identity and assignment | unchanged; adds "returned by name after publishing" (decision 4) |
| Run (`TableAssignmentRun`) | One computed seating | 1 published at a time | unchanged |
| Table | A numbered place where people sit and work | 1 topic (0 without registration); 2..8 members when a discussion is attached | planned (in a run) → at work (a `ClassTable`) → finished |
| Member (workspace subscription) | A person inside a lesson | 1 table (`tableId`) | unchanged |
| Position (`position` in private answers; `side` + `camp` on the subscription) | Where a person stands between two poles, 0–100. One concept, two stores | 1 per person | see the privacy rule |
| Pace (NEW, on the lesson) | Who moves the steps: the host, or each table | 1 per lesson; default host | changeable while the lesson runs (decision 9) |
| The table's step (NEW, on `ClassTable`) | Where this table is inside the free stretch | 1 per table, table pace only | tableTalk → proposals → allProposals |

Rules of the model:

- **Topic is not a question.** A topic is a label the table carries from registration ("Table 4 · Transport"). Guiding questions and the challenge stay lesson-wide. Proposals already carry their table (`ClassTableMarker.tableId`), so a proposal's topic is derived, never stored twice. A lesson with no registration has no topics. Decision 3 holds the richer alternative.
- **Position and side are one concept.** Both are 0–100 between two named poles (`TableAssignmentParticipant.position` already uses `SideValueSchema`). Asked once: in registration when there is one, otherwise at the lesson's Side step.
- **Privacy, the stricter rule.** A position answered in registration stays in the private answers. It is never copied to `side` / `camp` on the subscription. So in a lesson that used registration: the host, the tablemates and the projector see names only; My table shows no side marks; "support by side" in the Summary is off (decision 5). A lesson without registration keeps today's behaviour.
- **One table, two records, one owner at a time.** Before the lesson starts, the published run owns "who sits where". When the lesson starts, the server copies it into the lesson's tables (table number = run index + 1) and from then on the lesson's tables own it: the host's "move to another table", people without a phone and latecomers all act there. My table and the projector read the current owner.
- **Room step and table step.** `lessonPlan.stepIndex` is the room's step. Steps before Table talk (waiting, opening, side, tables) and from Vote on (vote, summary) are room steps in both paces. In table pace the room stays on Table talk through the free stretch and each table carries its own step (tableTalk, proposals, allProposals). What a participant sees: the room step when it is a room step, otherwise their table's step. No new step keys (a new picklist value breaks deployed clients); today `isTableTalk(table, lessonStep)` reads the room step, and in table pace it reads the table's.
- **One seating engine.** `@freedi/table-assignment` seats both. A lesson without registration calls it at the Tables step with one implicit topic and each student's side. It must keep Class's promises: 2..8 per table, sizes differ by at most one, nobody alone, people without a phone stay put, "re-seat" gives a new plan.
- **Statement tree:** unchanged. Assignment, topics, registrations, runs and tables are operational records. The lesson is the only Statement; the assignment points at it.

Three shapes and their lifecycle:

| Shape | Lesson steps | What starts it | What ends it |
|---|---|---|---|
| A. Registration only | none (no lesson, no Statement) | host opens registration | host ends the assignment |
| B. Registration, then discussion | waiting, opening, tableTalk, proposals, allProposals, vote, summary. No side, no tables | publishing makes My table; "start" copies the seating into the lesson's tables | ending the lesson ends the assignment |
| C. Discussion, no registration (today's Class) | all nine, unchanged | class code | unchanged |

In shape B, "waiting" is shown to a registered person as My table. A discussion can be added to shape A at any time before the assignment ends, making it shape B.

## 3. Labels

One name per concept. Four nouns switch by the lesson's audience (school or community); nothing else does. Reason: "חכו למורה" is wrong for an adult at a community evening, and the school words were chosen on purpose (Trello mqqqRWqT). (?) marks Hebrew proposed here.

| Concept | EN label | HE label | i18n key | Route segment | Code type | Synonyms to retire |
|---|---|---|---|---|---|---|
| Audience switch | Who is it for? School / Community | למי זה? בית ספר / קהילה (?) | NEW `audience.label`, `.school`, `.community` | — | NEW `audience` on lesson and assignment | — |
| Host | Teacher / Host | מורה / מארח | base key / NEW `<key>.community` | `t` (kept) | `host` (new code); `teacher*`, `hostUid` stay as they are | מנחה, מנהל |
| Participant | Student / Participant | תלמיד / משתתף | same pattern | `m` (kept) | `member`; `student*` stays | נרשם as a role name |
| Lesson | Lesson / Gathering | שיעור / מפגש | same pattern | — | `lessonPlan`, `classLesson` (wire, kept) | session, סשן, event |
| Position | Choosing a side / My position | בחירת צד / העמדה שלי | `step.side`, `side.*` / `tableAssignment.position*` | `position` | `position`; `side`, `camp` (wire, kept) | score, "side" in new code |
| Table assignment | Table assignment | חלוקה לשולחנות | `tableAssignment.session` → rename `tableAssignment.name`; `step.tables` (kept) | `tables` | `TableAssignment` | session (route, key), "שיבוץ" as the object's name |
| Registration (the phase) | Registration | הרשמה | `tableAssignment.status.*` (kept) | — | `status` | — |
| Topic | Topic | נושא | NEW `tableAssignment.topic` (named in the old spec, absent from the locale files) | — | `TableAssignmentTopic` | question, table (as content) |
| Guiding question | Guiding questions | שאלות חקירה | `step.tableTalk` (kept) | — | `classRole: guiding` | topic |
| Challenge | The question to solve | השאלה לפתרון | `plan.challenge.title` (kept) | — | `classRole: challenge` | topic |
| Table | Table | שולחן | `table.header`; `tableAssignment.table` (delete, use `table.header`) | `table` | `ClassTable`; `TableAssignmentRunTable` | group, room |
| My table | My table | השולחן שלי | `tableAssignment.myTable` (kept) | `my-table` | — | — |
| My choices | My choices | הבחירות שלי | NEW `tableAssignment.choices` (same) | `choices` (was `preferences`) | `preferences` (wire) | preferences in UI or URL |
| The crowd | The room | החדר | NEW `tableAssignment.room` (same) | — | — | "room" for the projector |
| Projector | Projector | מקרן | `projector.title` (kept); delete `tableAssignment.roomScreen`; `.roomScreen.show` → value "הצגה במקרן" (?) | `screen` | — | Room screen, מסך החדר |
| Pace | Who sets the pace? | מי קובע את הקצב? (?) | NEW `plan.pace.label` | — | NEW `pace: 'host' \| 'table'` | free mode (taken by seating) |
| Pace: host | Everyone together | כולם יחד, לפי המורה / לפי המארח (?) | NEW `plan.pace.host` (+ `.community`) | — | `'host'` | — |
| Pace: table | Each table at its own speed | כל שולחן בקצב שלו (?) | NEW `plan.pace.table` | — | `'table'` | — |
| Lesson step | Step | שלב | `step.*` (kept) | — | `LessonStepKey` | — |
| The table's step | Where the table is | איפה השולחן (?) | NEW `console.table_at` | — | NEW `ClassTable.lessonStep` | "step" alone for this |
| Part of a turn | (no label; shown as the strip) | — | — | — | `TableStep` (pick, talk, write, rate) | "step" in new copy |
| Registration step | Step 1 of 3 | צעד 1 מתוך 3 | `tableAssignment.steps.label` (kept) | — | — | שלב here |
| Move on | Move on | לעבור הלאה | `turn.move_on*` (kept) | — | `moveOn` | skip |
| Table finished | We finished | סיימנו (?) | NEW `turn.table_done` | — | table step `allProposals`, nothing left to rate | — |
| Gather everyone | Pause for everyone | עצירה לכולם (?) | `console.pause` (value changes in table pace) | — | lesson status `paused` | freeze |
| Open the vote | Open the vote for everyone | פתיחת ההצבעה לכולם (?) | NEW `console.open_vote_all` | — | room step → `vote` | — |
| Start the discussion | Start the discussion | התחלת הדיון (?) | NEW `console.start_discussion` | — | room step leaves `waiting` | — |
| Add a discussion | Add a discussion | הוספת דיון (?) | NEW `tableAssignment.addDiscussion` | — | sets `contextStatementId` | — |
| Register ahead | Registration before the lesson / gathering | הרשמה מראש (?) | NEW `console.register_ahead` | — | creates the assignment | — |
| To my table (on the day) | To the table | לשולחן (?) | NEW `tableAssignment.myTable.enter` | — | — | — |
| Already registered | I already registered | כבר נרשמתי (?) | NEW `tableAssignment.returnByName.late` | — | `tablesRegister` with `nameMatch: 'claim'` after publishing | login |
| Latecomer | Waiting for a table | מחכים לשולחן (?) | `tableAssignment.waiting.late.*` (kept) | — | stage `waitingForSeat` | — |

i18n work, every language file:

- `tableAssignment.*` moves from `apps/tables/src/lib/locales/{he,en,ar}.ts` into `apps/join-class/src/lib/locales/tableAssignment/{he,en,ar,de,es,fa,nl}.ts` (the pattern of `challenge/`, `vote/`, `allProposals/`). German, Spanish, Persian and Dutch do not exist for any of these keys today.
- Community variants, key + `.community`, in all 7 files, for every participant-facing key that names a role. Verified in `he.ts`: `step.waiting`, `lesson.code.unknown.body`, `a11y.language.locked`, `opening.video_failed`, `opening.name_hint`, `table.not_placed`, `turn.no_table`, `turn.proposals_done`, `turn.questions_used`, `question.teacher_list`, `lesson.paused.title`, `lesson.paused.body`, `lesson.ended.title`, `lesson.code.unknown.title`, `lesson.not_lesson`, `proposal.hidden_mine`, `voting.paused_hint`. `he.ts` has 13 lines with מורה, 20 with תלמיד, 50 with שיעור, 24 with כיתה across both roles; the host-facing ones wait (decision 2).
- Renamed: `tableAssignment.session` → `tableAssignment.name`. Deleted: `tableAssignment.table`, `tableAssignment.roomScreen`, `tableAssignment.back.toList`, `tableAssignment.screen.hostList` (the list is now a section of the home).

## 4. Hierarchy (per role)

Role: Host. Home: `/t`. One home, three groups, each by one scheme: open now (by status), lesson plans (by plan), table assignments (by status). A group with nothing in it goes below the groups that have items.

```text
0 Home                                             /t
1   Lesson plan                                    /t/plans/:planId            (unchanged)
2     Game questions                               /t/plans/:planId/games/:gameId
2     Lesson (console)                             /t/:lessonId
3       Questions of this lesson                   /t/:lessonId/plan
3       Table sheet                                /t/:lessonId/table/:n
3       Its table assignment, by status            /t/tables/:id               (same screen as below)
-       Projector (own window)                     /t/:lessonId/screen
1   Table assignment, by status                    /t/tables/:id               (new: /t/tables/new)
      draft → Setup | registrationOpen → Registration open
      registrationClosed → Assignment preview | published, ended → Published assignment
2     Assignment preview                           /t/tables/:id/preview
2     Published assignment                         /t/tables/:id/assignment
2     Registered participants (names)              /t/tables/:id/participants
-     Projector (own window)                       /t/tables/:id/screen        (shape A only; shape B uses the lesson's)
      modal: Fix details, Remove from the list, Delete
```

Role: Participant. One home per phase; each sends the person to the other when the phase changes.

```text
0 Front door (code box)                            /            → /c/:code
0 Before the discussion: the assignment link       /tables/:id
      not open | name | "is this you?" | waiting | waiting, closed | waiting for a table
      | cancelled | removed | closed, not registered | ended | My table
1   Step 2: Rank topics / Choose a table           /tables/:id/choices
1   Step 3: My position                            /tables/:id/position
1   Step 1 again, when editing                     /tables/:id/name
1   My table                                       /tables/:id/my-table
0 During the discussion: my table at work          /m/:lessonId
      room step → that step's screen | free stretch → my table's own step
      paused | ended | no table yet (latecomer) → back to /tables/:id
```

Role: The room. One projector per event: shape A `/t/tables/:id/screen` (join by QR, then who sits where); shapes B and C `/t/:lessonId/screen` (the same two views until the discussion starts, then the lesson's stages).

## 5. Navigation model

- **Global:** host header on `/t` (unchanged). Participants have no menu; language and accessibility on every screen.
- **Local, host:** an assignment with a lesson has the lesson's console as its parent; one without has the home. The console shows one entry to the assignment ("הרשמה מראש", then its status and count); the assignment's stage screen shows one entry to the lesson ("הוספת דיון", then "לשיעור" / "למפגש").
- **Local, participant:** registration steps run forward, one primary button each (unchanged). During the discussion the screen is the table; there is no route per step.
- **Contextual:** in table pace the console's table cards carry the table's step and "move this table on"; the bar carries "עצירה לכולם" and "פתיחת ההצבעה לכולם".
- **Back paths:** `/t/tables/:id/*` → `/t/tables/:id` → the console when attached, else `/t`. A participant's back inside registration goes one step back and keeps unsaved choices; `/m/:lessonId` has no back (the code box is its only parent).
- **Entry points:**
  - registration link and QR: `/tables/:id`;
  - class code: `/c/:code`. A lesson with an assignment sends a person who has no seat to `/tables/:id` (they register as a latecomer) and a seated person to `/m/:lessonId`;
  - host: `/t/tables/:id`, `/t/:lessonId`.
- **Old Tables links.** Anonymous identity does not cross from tables.wizcol.com to class.wizcol.com, so a plain redirect makes every registered person a stranger. Rule (decision 8): tables.wizcol.com serves the Class app at the old participant paths until every assignment created before cutover has ended; host paths redirect at once (Google identity crosses).

| Old route (tables.wizcol.com) | Now |
|---|---|
| `/`, `/host` | → class.wizcol.com`/t` |
| `/host/new` | → `/t/tables/new` |
| `/host/sessions/:id` and `/preview`, `/assignment`, `/participants`, `/screen` | → `/t/tables/:id` and the same segment |
| `/host/sessions/:id/topics`, `/settings` | → `/t/tables/:id` |
| `/sessions/:id`, `/name`, `/position`, `/my-table` | served in place as `/tables/:id/...` during the transition; redirected after |
| `/sessions/:id/preferences` | same, as `/tables/:id/choices` |
| `/sessions/:id/topics`, `/topics/:topicId` | same, as `/tables/:id` |

## 6. Task flows

Role: Host, task: register people for an event, seating only (shape A): 6 steps, as today.
1. Home — "חלוקה חדשה".
2. Setup — name, audience, mix or sit, topics, position question → "פתיחת ההרשמה".
3. Registration open — share link and QR.
4. Registration open — "סגירה וחלוקה לשולחנות".
5. Assignment preview — "פרסום השיבוץ".
6. Published assignment — "הצגה במקרן".

Role: Host, task: add a discussion to a registration (A becomes B): 3 steps.
1. Any stage screen of the assignment — "הוספת דיון".
2. Choose a game (and a class, for a school); choose the pace.
3. Lands on the lesson's console at "waiting". Seats per table above 8 block this step with the reason (decision 6).

Role: Host, task: run a table-paced discussion on the day: 3 steps.
1. Console — "התחלת הדיון" (after the opening, if any). The seating becomes the lesson's tables; every table starts Table talk.
2. Console — watch the tables (section 7); help where a table is marked stuck.
3. Console — "פתיחת ההצבעה לכולם". If tables are still writing, a confirm names how many. Then Summary, as today.

Role: Host, task: gather everyone: 1 step. Console — "עצירה לכולם": every phone shows the paused screen, timers stop; "המשך" resumes each table where it was.

Role: Host, task: a table is stuck: 2 steps. Console — the table's card shows its step, the time on it and the stuck mark → "move this table on" on the card, or open the Table sheet.

Role: Host, task: seat latecomers: 2 steps. Published assignment or console — "N מחכים לשולחן" → "חישוב מחדש" seats only them; seated people stay.

Role: Participant, task: register (unchanged): 3 steps, 2 without a position question or with one topic.

Role: Participant, task: get to my table on the day, same phone: 1 step. Link or code — My table; when the discussion has started, "לשולחן" (or the screen moves by itself).

Role: Participant, task: different phone or browser on the day: 3 steps.
1. Link, QR or code — name screen, "כבר נרשמתי".
2. Type the full name. One seated registration under that name: "is this you?".
3. Yes — My table; the old browser's registration shows "removed, continued elsewhere". No match or two matches: registered as a latecomer, "waiting for a table".

Role: Participant, task: latecomer: 3 registration steps, then "מחכים לשולחן" until the host seats them; the screen changes by itself.

Role: Participant, task: cancel: 2 steps before closing (unchanged). After publishing a seated person cannot cancel; the host removes them ("הסרה מהרשימה") or, during the discussion, moves them. The table's "move on" count adjusts by itself when a tablemate leaves (`moveOnIfReached`).

Role: Participant, task: our table finished early: 1 step. After the last proposal the table moves itself to All proposals: read and rate other tables' proposals as they arrive. Nothing left: "סיימנו", with what happens next and no "wait for the teacher".

Role: Participant, task: our table is stuck: 1 step. "לעבור הלאה" — two tablemates (all of them at a table of two) move the table on. In table pace the same press also moves the table from Table talk to Proposals when its questions are used up.

## 7. Screen inventory

Kept = same job, moved into Class. All Tables screens keep the states of shared-table-assignment.md section 7.

| Screen | Was | Route | Single job | Verdict and states that change |
|---|---|---|---|---|
| Home | Class TeacherHome + Tables HostList | `/t` | Find or start a plan, a lesson or an assignment | Merged. HostList retired as a screen. Empty: both "start" actions |
| Setup | Tables HostSetup | `/t/tables/new`, `/t/tables/:id` | Describe the event, open registration | Kept. Adds the audience choice. Attached to a lesson: seats per table 2..8 |
| Registration open | Tables HostLive | `/t/tables/:id` | Share the link, watch the count | Kept. Adds "הוספת דיון" |
| Assignment preview | Tables HostPreview | `…/preview` | Decide whether to publish | Kept |
| Published assignment | Tables HostAssignment | `…/assignment` | See the tables, seat latecomers | Kept. Once the lesson starts it reads the lesson's tables |
| Registered participants | Tables HostParticipants | `…/participants` | Check names, remove a person | Kept |
| Fix details, Remove, Delete | Tables modals | modal | — | Kept |
| Lesson console | Class TeacherConsole | `/t/:lessonId` | Run the lesson | Kept. Table pace: the step rail shows room steps, the free stretch as one segment with counts per table step |
| Table card / Table sheet | Class TableCard, TableSheet | console, `/t/:lessonId/table/:n` | See and help one table | Kept. **Host sees per table:** number, topic, names (who is present), the table's step, part of the turn, questions asked of total, proposals written, time on the current step and the stuck mark, "move on" presses of needed. **Never:** positions, choices, which side |
| Questions of this lesson | Class PlanScreen | `/t/:lessonId/plan`, game route | Plan questions and settings | Kept. Adds "מי קובע את הקצב?" |
| Projector | Class TeacherProjector + Tables RoomScreen | `/t/:lessonId/screen`, `/t/tables/:id/screen` | Join, then who sits where, then the stages | Merged. RoomScreen's two views become the projector's first two. Free stretch: who sits where plus room progress. No permission: host sign-in |
| Front door, code | Class FrontDoor, ClassCode | `/`, `/c/:code` | Get in by code | Kept. New branch: no seat in a lesson with an assignment → `/tables/:id` |
| Link home (all states) | Tables ParticipantHome | `/tables/:id` | Show the one thing that fits | Kept. New: "כבר נרשמתי" on the name state after publishing |
| Rank topics / Choose a table | Tables RankedPreferences, DirectPicker | `…/choices` | Pick topics or a seat | Kept; route renamed |
| My position | Tables ParticipantPosition | `…/position` | Answer or decline | Kept |
| Waiting, Cancelled, Removed, Waiting for a table | Tables | `/tables/:id` | Say what happens next | Kept |
| My table | Tables ParticipantMyTable + Class TablesView | `…/my-table`; in shape C the Tables step of `/m/:lessonId` | Know where to sit | Merged. With registration: names and topic, no side marks. Done: "לשולחן" once the discussion starts. Shape C keeps side marks |
| Waiting step | Class WaitingView | `/m/:lessonId` | Wait for the start | Kept for shape C. Shape B shows My table instead |
| Side step | Class SideView | `/m/:lessonId` | Choose a side | Kept for shape C. Absent in shape B |
| Table at work | Class TableFlow and its parts | `/m/:lessonId` | Talk, write, rate | Kept. Table pace: every "חכו למורה" state gets an action or a "what happens next" line. Paused: lesson paused screen |
| All proposals, Vote, Summary | Class | `/m/:lessonId` | Rate, vote, see the result | Kept. Lists group by topic when the lesson has topics. Support by side: off with registration |
| Table finished | NEW | `/m/:lessonId` | Say the table is done and what comes next | New. Empty: nothing more to rate. Done: flips to Vote by itself |
| Tables app shell, Placeholder, HostGate | Tables | — | — | Retired |

## 8. Findability

- Home: three groups; plans keep their class filter; table assignments active first, ended after, search by name.
- Console in table pace: tables sorted by number, with a filter "stuck / at questions / at proposals / finished"; the count per table step is always visible.
- Registered participants, Published assignment: search by name (kept). Projector: paged by table number (kept).
- All proposals, Vote, Summary with topics: grouped by topic, then today's order.
- Participants never search: they land on their own state.

## 9. Open decisions (for Tal) and assumptions

1. **When does the vote open in table pace?** Recommended: tables go freely through questions and proposals, a finished table reads and rates the others' proposals, and the host opens the vote once for everyone. Alternative: each table votes when it gets there. Cost of the alternative: early tables vote on an unfinished list, results are not comparable, and the shortlist can no longer be frozen once.
2. **One set of words or two?** Recommended: two small sets (teacher / host, student / participant, lesson / gathering, choosing a side / my position), chosen per lesson. First round: everything a participant reads, plus the registration screens. The console and the plan screens keep school words until a community host runs a discussion. Alternative: one neutral set (מנחה, משתתפים, מפגש) everywhere; cost: teachers lose the school words they asked for.
3. **What is a topic during the discussion?** Recommended: a label on the table; everyone still answers the same question to solve, and lists are grouped by topic. Alternative: each topic has its own question to solve and its own vote; cost: a ballot per topic and a longer Summary.
4. **A different phone on the day.** Today "return by full name" works only while registration is open (`fn_tablesRegister`), so a person who registered in WhatsApp's browser and scans the QR with the camera has no seat. Recommended: allow "כבר נרשמתי" after publishing, once per registration, marked for the host. Risk: someone types another person's name and takes the seat; the real person then shows as a latecomer and the host sorts it out.
5. **"Support by side" in the Summary** needs each person's side. Recommended: off in lessons that used registration. Alternative: totals only, and only for groups above a minimum size.
6. **Seats per table.** Tables allows 3–20 (default 7); a table that talks in turns allows 2–8 (default 6). Recommended: 8 at most whenever a discussion is attached.
7. **Can a table start before the host presses start?** Recommended: no; one "start" for the room.
8. **Old links.** Recommended: keep the old address working in place until running assignments end (section 5). Alternative: redirect at once; cost: everyone already registered loses their place.
9. **Changing the pace during a lesson.** Recommended: the host may take the pace back (table → host; every table goes to the room's step), not the other way mid-lesson.

Assumptions: Tables and Class use the same Firebase project and Google accounts. A person without a phone is added at the table during the discussion (existing); there is no such path in registration only. "Sit where you like" seating works with a discussion: tables fill live. An assignment attached to a lesson with no topics typed gets one topic named after the game, and the rank step is skipped.

## 10. Handoff to UX

Fixed by this spec: the objects and who owns table membership when; the room-step / table-step rule; the three shapes; the label table and the four switching nouns; the routes and the old-link table; one home with three groups; what the host sees per table and what never; the privacy rule; every participant state in table pace has an action or a next-step line.

Yours to decide (ux-ui-architect, ui-design-system-architect): how the home's three groups look and collapse; how the free stretch reads on the step rail and the projector; the table card's layout for the new facts; where "הוספת דיון" and "הרשמה מראש" sit; the "סיימנו" screen; how topic grouping looks in lists; the wording of every (?) label; whether My table and the table header share one component.

## 11. IA defects found (fix in the merge, or do not carry over)

1. **"Session" was retired as a label but lives on** in `/sessions/:id`, `tableAssignment.session`, `sessionId`, `tablesCreateSession`. Fix the route and the key; wire fields stay.
2. **Four things are called "step":** the lesson step, the part of a turn (`TableStep`), the registration step (צעד), and now the table's own step. Section 3 names each.
3. **Class dead ends in table pace:** `table.not_placed`, `turn.no_table`, `turn.proposals_done`, `lesson.paused.body` all say "wait for the teacher". With nobody pacing, each needs an action.
4. **No path for a second browser after publishing** (decision 4). The merge raises the cost: the seat now opens the live table.
5. **Class reads more than it shows.** The console client loads every student's `side` and `camp` (`consoleHelpers`) and hides which; tablemates see side marks (`TablesView`); Tables promises "not shown to the host or the table". Do not carry Class's reading into lessons with registration.
6. **Two labels for the big screen** ("מקרן", "מסך החדר"), and "room" means both the crowd and the screen.
7. **Tables' bare address opens the host sign-in** (`DEFAULT_ROUTE = '/host'`); a participant without a link has no home. Class's code box fixes it.
8. **The lesson link exists in data, not in navigation:** `contextStatementId` is written by `tablesCreateSession` and read by no screen.
9. **Table number is 0-based in a run (`index`) and 1-based in a lesson (`n`).** One number in the UI; the copy adds one.
10. **Two size ranges and two guarantees** (decision 6). The engine takes a largest table size only; Class promises nobody sits alone.
11. **Tables has three languages, Class seven.**
12. **shared-table-assignment.md drifted:** its header says "not implemented yet" (the app is live) and its open question 1 is answered (`tablesRemoveParticipant`). Update its status line when this spec is agreed.
