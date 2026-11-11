# join-class: Tables inside Class (registration and table-paced discussion) — IA spec

Status: agreed; reconciled on 2026-11-11 with the decisions Tal made after the use case 1 design (section 9: decisions 1–15 and the five rules settled by this spec); not implemented yet
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
| Registration = name card + private answers | A person in an assignment | 1 per browser identity and assignment | unchanged; a return by full name moves it to the new browser with its answers kept, before and after publishing (decisions 4, 10) |
| Run (`TableAssignmentRun`) | One computed seating | 1 published at a time | unchanged |
| Table | A numbered place where people sit and work | 1 topic (0 without registration); with registration: the seats the host set (default 7), no cap from the discussion (decision 6); without registration: 2..8, default 6 | planned (in a run) → at work (a `ClassTable`) → finished |
| Member (workspace subscription) | A person inside a lesson | 1 table (`tableId`) | unchanged |
| Position (`position` in private answers; `side` + `camp` on the subscription) | Where a person stands between two poles, 0–100. One concept, two stores | 1 per person | see the privacy rule |
| Pace (NEW, on the lesson) | Who moves the steps: the host, or each table | 1 per lesson; default host | changeable while the lesson runs (decision 9) |
| The table's step (NEW, on `ClassTable`) | Where this table is inside the free stretch | 1 per table, table pace only | tableTalk → proposals → allProposals |

Rules of the model:

- **Topic is not a question.** A topic is a label the table carries from registration ("Table 4 · Transport"). Guiding questions and the challenge stay lesson-wide. Proposals already carry their table (`ClassTableMarker.tableId`), so a proposal's topic is derived, never stored twice. A lesson with no registration has no topics. Decision 3 holds the richer alternative.
- **Position and side are one concept.** Both are 0–100 between two named poles (`TableAssignmentParticipant.position` already uses `SideValueSchema`). Asked once: in registration when there is one, otherwise at the lesson's Side step.
- **Privacy, the stricter rule.** A position answered in registration stays in the private answers. It is never copied to `side` / `camp` on the subscription. So in a lesson that used registration: the host, the tablemates and the projector see names only; My table shows no side marks; "support by side" in the Summary is shown as server-computed totals only (decision 5). A lesson without registration keeps today's behaviour.
- **One table, two records, one owner at a time.** Before the lesson starts, the published run owns "who sits where". When the lesson starts, the server copies it into the lesson's tables (table number = run index + 1) and from then on the lesson's tables own it: the host's "move to another table", people without a phone and latecomers all act there. My table and the projector read the current owner.
- **Room step and table step.** `lessonPlan.stepIndex` is the room's step. Steps before Table talk (waiting, opening, side, tables) and from Vote on (vote, summary) are room steps in both paces. In table pace the room stays on Table talk through the free stretch and each table carries its own step (tableTalk, proposals, allProposals). What a participant sees: the room step when it is a room step, otherwise their table's step. No new step keys (a new picklist value breaks deployed clients); today `isTableTalk(table, lessonStep)` reads the room step, and in table pace it reads the table's.
- **One seating engine.** `@freedi/table-assignment` seats both. A lesson without registration calls it at the Tables step with one implicit topic and each student's side. There it must keep Class's promises: 2..8 per table (default 6), sizes differ by at most one, nobody alone, people without a phone stay put, "re-seat" gives a new plan. A lesson with registration is seated by the assignment's own seats per table and is not held to 2..8 (decision 6).
- **Audience (school or community).** One value per object, set in one place each: on an assignment in Setup ("מי המשתתפים?"); on a lesson in "פרטי השיעור" on Questions of this lesson. When the two are attached, the object that existed first keeps its value and gives it to the other ("הוספת דיון": the assignment's; "הרשמה מראש": the lesson's). From then on the pair has one value: changing it on either changes both. Removing the discussion leaves each with that value. It changes words only, never data. A stored record with no value reads as school for a lesson and community for an assignment (the words each shows today).
- **Removing a discussion.** Allowed until the discussion starts (the room step is still "waiting"), from the assignment's discussion card. Both objects survive: the assignment goes back to shape A with its registrations and seating untouched (`contextStatementId` cleared); the lesson stays with the host as a lesson without registration (shape C, all nine steps, its own class code). After the start it cannot be removed; ending the lesson ends both.
- **"Sit where you like" has no publish step.** In that mode read "registration closed" wherever this spec makes "published" the condition for My table as the way into the discussion and for "התחלת הדיון" (decision 15). A person still sees the table they chose as soon as they choose it and may change it until registration closes (unchanged).
- **Statement tree:** unchanged. Assignment, topics, registrations, runs and tables are operational records. The lesson is the only Statement; the assignment points at it.

Three shapes and their lifecycle:

| Shape | Lesson steps | What starts it | What ends it |
|---|---|---|---|
| A. Registration only | none (no lesson, no Statement) | host opens registration | host ends the assignment |
| B. Registration, then discussion | waiting, opening, tableTalk, proposals, allProposals, vote, summary. No side, no tables | publishing (in "sit where you like": closing registration) makes My table and enables "start"; "start" copies the seating into the lesson's tables | ending the lesson ends the assignment |
| C. Discussion, no registration (today's Class) | all nine, unchanged | class code | unchanged |

In shape B, "waiting" is shown to a registered person as My table. A discussion can be added to shape A at any time before the assignment ends, making it shape B, and removed again until the discussion starts (rule above).

## 3. Labels

One name per concept. Four nouns switch by the lesson's audience (school or community); nothing else does. Reason: "חכו למורה" is wrong for an adult at a community evening, and the school words were chosen on purpose (Trello mqqqRWqT). (?) marks Hebrew proposed here.

| Concept | EN label | HE label | i18n key | Route segment | Code type | Synonyms to retire |
|---|---|---|---|---|---|---|
| Host home | Home | דף הבית | `teacher.home.title` (value changes); also the name the back bar gives `/t` | `t` | — | "מערכי השיעור שלי" as the page's name. "מערכי השיעור" stays, as the name of the group of lesson plans only |
| Audience switch | Who is taking part? School students / People in a community | מי המשתתפים? תלמידים בבית ספר / אנשים בקהילה | NEW `audience.label`, `.school`, `.community`, `.hint` | — | NEW `audience` on lesson and assignment | "למי זה?" |
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
| Seats per table | Seats per table | מקומות בשולחן | `tableAssignment.setup.seats` (kept) | — | assignment: `settings`, default `TABLE_ASSIGNMENT_TABLE_SIZE_DEFAULT` (7); lesson without registration: `tableSize`, `DEFAULT_TABLE_SIZE` (6) | — |
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
| Add a discussion | Add a discussion | הוספת דיון | NEW `tableAssignment.addDiscussion` | `discussion` | sets `contextStatementId` | — |
| Remove the discussion | Remove the discussion | הסרת הדיון (?) | NEW `tableAssignment.removeDiscussion` | — | clears `contextStatementId` | — |
| Register ahead | Registration before the lesson / gathering | הרשמה מראש (?) | NEW `console.register_ahead` | — | creates the assignment | — |
| Enter the discussion (from My table, on the day) | Join the discussion | כניסה לדיון | NEW `tableAssignment.myTable.enter` | — | — | "לשולחן": too close to `tableAssignment.stage.seeMyTable` "לשולחן שלי", which is a different jump (waiting screen → My table) and stays |
| Already registered | I already registered | כבר נרשמתי | NEW `tableAssignment.returnByName.late` | — | `tablesRegister` with `nameMatch: 'claim'`, at any status that accepts people | login; the host switch "לאפשר חזרה לפי שם מלא"; the tag "המשיך בשם" |
| Latecomer | Waiting for a table | מחכים לשולחן (?) | `tableAssignment.waiting.late.*` (kept) | — | stage `waitingForSeat` | — |

i18n work, every language file:

- `tableAssignment.*` moves from `apps/tables/src/lib/locales/{he,en,ar}.ts` into `apps/join-class/src/lib/locales/tableAssignment/{he,en,ar,de,es,fa,nl}.ts` (the pattern of `challenge/`, `vote/`, `allProposals/`). German, Spanish, Persian and Dutch do not exist for any of these keys today.
- Community variants, key + `.community`, in all 7 files, for every participant-facing key that names a role. Verified in `he.ts`: `step.waiting`, `lesson.code.unknown.body`, `a11y.language.locked`, `opening.video_failed`, `opening.name_hint`, `table.not_placed`, `turn.no_table`, `turn.proposals_done`, `turn.questions_used`, `question.teacher_list`, `lesson.paused.title`, `lesson.paused.body`, `lesson.ended.title`, `lesson.code.unknown.title`, `lesson.not_lesson`, `proposal.hidden_mine`, `voting.paused_hint`. `he.ts` has 13 lines with מורה, 20 with תלמיד, 50 with שיעור, 24 with כיתה across both roles; the host-facing ones wait (decision 2).
- Renamed: `tableAssignment.session` → `tableAssignment.name`. Value changed: `tableAssignment.list.search` → "חיפוש לפי שם" / "Search by name" (the home serves both audiences, so no variant). `tableAssignment.state.notHost` keeps its one text. Deleted: `tableAssignment.table`, `tableAssignment.roomScreen`, `tableAssignment.back.toList`, `tableAssignment.screen.hostList` (the list is now a section of the home).
- Deleted with decisions 4 and 10: `tableAssignment.returnByName` (the switch), `tableAssignment.setup.return.title`, `.body`, `.warning`, `tableAssignment.participants.claimedByName`, `tableAssignment.returnByName.body` (replaced by NEW `.bodyOpen` and `.bodyPublished`, which no longer say "answer again"), `tableAssignment.removed.title` and `tableAssignment.removed.body` (the `…MaybeMoved` pair is the only wording now).
- Moved `tableAssignment.*` keys that name a role, verified in `apps/tables/src/lib/locales/he.ts` and `en.ts`. They were written for a community, so the pattern holds with the texts swapped: the base key gets the NEW school text, key + `.community` keeps today's text. Each cell reads school / community. Class's own copy avoids gendering the teacher ("המורה הסתירו"), so the verb after "המורה" is marked (?) for the copy pass.

| Key (`tableAssignment.` +) | Hebrew: school / community | English: school / community |
|---|---|---|
| `notOpen.thanks` | תודה שהקדמתם. המורה יפתח (?) / המארח יפתח את ההרשמה בקרוב. | Thanks for coming early. The teacher / The host will open registration soon. |
| `position.privacy` | התשובה פרטית. היא לא תוצג לאף אחד, גם לא למורה / למארח או ליושבי השולחן. | Your answer is private. It will not be shown to anyone, not to the teacher / the host and not to the people at your table. |
| `waiting.step.closing` | המורה סוגר (?) / המארח סוגר את ההרשמה | The teacher / The host closes registration |
| `waiting.closedNote` | ההרשמה נסגרה, ולכן אי אפשר לשנות פרטים. כדי לבטל השתתפות, כדאי לדבר עם המורה / המארח. | Registration has closed, so details can no longer be changed. To cancel your participation, talk to the teacher / the host. |
| `cancel.claimed` | אי אפשר לבטל רישום שהמשיך בשם מלא. כדאי לדבר עם המורה / המארח. | A registration continued by full name cannot be cancelled. Talk to the teacher / the host. |
| `cancelled.bodyClosed` | הפרטים והבחירות שלכם נמחקו. ההרשמה כבר נסגרה. רוצים בכל זאת להצטרף? כדאי לדבר עם המורה / המארח. | Your details and choices were deleted. Registration has closed. Still want to join? Talk to the teacher / the host. |
| `removed.bodyMaybeMoved` | ההרשמה המשיכה במכשיר אחר לפי השם המלא, או שהמורה הסיר (?) אותה. אם זו טעות, כדאי לדבר עם המורה. / … או שהמארח הסיר אותה. אם זו טעות, כדאי לדבר איתו. | The registration continued on another device by full name, or the teacher / the host removed it. If this is a mistake, talk to the teacher / the host. |
| `error.nameLocked` | השולחנות כבר פורסמו, ולכן אי אפשר לשנות שם. אם יש טעות, כדאי לדבר עם המורה / המארח. | The tables are published, so a name can no longer be changed. Talk to the teacher / the host if it is wrong. |
| `error.nameClaimed` | המשכתם את הרישום הזה בשם מלא, ולכן אי אפשר לשנות את השם. אם יש טעות, כדאי לדבר עם המורה / המארח. | You continued this registration by full name, so the name cannot be changed. Talk to the teacher / the host if it is wrong. |
| `waiting.late.lead` | השולחנות כבר פורסמו. הבחירות שלכם נשמרו, והמורה ישבץ (?) / והמארח ישבץ אתכם. | The tables are already published. Your choices are saved, and the teacher / the host will seat you. |
| `waiting.late.note` | השולחנות פורסמו לפני שנרשמתם. המורה ישבץ (?) / המארח ישבץ אתכם, והשולחן שלכם יופיע בדף הזה. אפשר לסגור אותו ולחזור בקישור. | The tables were published before you registered. The teacher / The host will seat you, and your table will appear on this page. You can close it and come back with the link. |
| `setup.name` (host) | איך קוראים לשיעור? / איך קוראים למפגש? | What is the lesson / the gathering called? |
| `setup.summary.title` (host) | מה יקרה בשיעור / מה יקרה במפגש | What will happen in the lesson / at the gathering |
| `fixDetails.name` (host) | שם השיעור / שם המפגש | Lesson name / Gathering name |
| `setup.problem.name` (host) | עוד לא נשמר: חסר שם לשיעור. / … חסר שם למפגש. | Not saved yet: the lesson / the gathering has no name. |

## 4. Hierarchy (per role)

Role: Host. Home: `/t`, labelled "דף הבית". One home, three groups, each by one scheme: open now (lessons only, by status), lesson plans (by plan), table assignments (by status). An assignment lives only in its own group, also while its registration is open; there it is listed first (decision 14). A group with nothing in it goes below the groups that have items.

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
2     Add a discussion                             /t/tables/:id/discussion    (leads to the lesson's console)
-     Projector (own window)                       /t/tables/:id/screen        (shape A only; shape B uses the lesson's)
      modal: Fix details, Remove from the list, Delete, Remove the discussion
```

Role: Participant. One home per phase; each sends the person to the other when the phase changes.

```text
0 Front door (code box)                            /            → /c/:code
0 Before the discussion: the assignment link       /tables/:id
      not open | name | already registered | "is this you?" | waiting | waiting, closed | waiting for a table
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
- **Local, host:** an assignment with a lesson has the lesson's console as its parent; one without has the home. The console shows one entry to the assignment ("הרשמה מראש", then its status and count); the assignment's stage screen shows one entry to the lesson ("הוספת דיון", which opens `/t/tables/:id/discussion`; once attached "לשיעור" / "למפגש", with "הסרת הדיון" beside it until the discussion starts).
- **Local, participant:** registration steps run forward, one primary button each (unchanged). During the discussion the screen is the table; there is no route per step.
- **Contextual:** in table pace the console's table cards carry the table's step and "move this table on"; the bar carries "עצירה לכולם" and "פתיחת ההצבעה לכולם".
- **Back paths:** `/t/tables/:id/*` → `/t/tables/:id` → the console when attached, else `/t`, which the back bar names "דף הבית". A participant's back inside registration goes one step back and keeps unsaved choices; `/m/:lessonId` has no back (the code box is its only parent).
- **Entry points:**
  - registration link and QR: `/tables/:id`;
  - class code: `/c/:code`. A lesson with an assignment sends a person who has no seat to `/tables/:id` (they register as a latecomer) and a seated person to `/m/:lessonId`;
  - host: `/t/tables/:id`, `/t/:lessonId`.
- **Old Tables links.** Anonymous identity does not cross from tables.wizcol.com to class.wizcol.com, but nobody is registered on Tables at cutover (decision 8), so every old path redirects at once.

| Old route (tables.wizcol.com) | Now |
|---|---|
| `/`, `/host` | → class.wizcol.com`/t` |
| `/host/new` | → `/t/tables/new` |
| `/host/sessions/:id` and `/preview`, `/assignment`, `/participants`, `/screen` | → `/t/tables/:id` and the same segment |
| `/host/sessions/:id/topics`, `/settings` | → `/t/tables/:id` |
| `/sessions/:id`, `/name`, `/position`, `/my-table` | → `/tables/:id/...` |
| `/sessions/:id/preferences` | → `/tables/:id/choices` |
| `/sessions/:id/topics`, `/topics/:topicId` | → `/tables/:id` |

## 6. Task flows

Role: Host, task: register people for an event, seating only (shape A): 6 steps, as today.
1. Home — "חלוקה חדשה".
2. Setup — name, audience, mix or sit, topics, position question, seats per table (default 7) → "פתיחת ההרשמה".
3. Registration open — share link and QR.
4. Registration open — "סגירה וחלוקה לשולחנות".
5. Assignment preview — "פרסום השיבוץ".
6. Published assignment — "הצגה במקרן".

Role: Host, task: add a discussion to a registration (A becomes B): 3 steps.
1. Any stage screen of the assignment after Setup — "הוספת דיון".
2. Add a discussion (`/t/tables/:id/discussion`) — choose a game (and a class, for a school); choose the pace. The lesson takes the assignment's audience.
3. Lands on the lesson's console at "waiting". The number of seats per table never blocks this step (decision 6).

Role: Host, task: remove a discussion from a registration (B back to A): 2 steps, until the discussion starts.
1. The assignment's stage screen — "הסרת הדיון".
2. Confirm. The assignment stays as it was; the lesson stays in the home as a lesson without registration.

Role: Host, task: run a table-paced discussion on the day: 3 steps.
1. Console — "התחלת הדיון" (after the opening, if any), enabled once the seating is published; in "sit where you like", once registration is closed. The seating becomes the lesson's tables; every table starts Table talk.
2. Console — watch the tables (section 7); help where a table is marked stuck.
3. Console — "פתיחת ההצבעה לכולם". If tables are still writing, a confirm names how many. Then Summary, as today.

Role: Host, task: gather everyone: 1 step. Console — "עצירה לכולם": every phone shows the paused screen, timers stop; "המשך" resumes each table where it was.

Role: Host, task: a table is stuck: 2 steps. Console — the table's card shows its step, the time on it and the stuck mark → "move this table on" on the card, or open the Table sheet.

Role: Host, task: seat latecomers: 2 steps. Published assignment or console — "N מחכים לשולחן" → "חישוב מחדש" seats only them; seated people stay.

Role: Participant, task: register (unchanged): 3 steps, 2 without a position question or with one topic.

Role: Participant, task: get to my table on the day, same phone: 1 step. Link or code — My table; when the discussion has started, "כניסה לדיון" (or the screen moves by itself).

Role: Participant, task: different phone or browser, before or after publishing: 3 steps.
1. Link, QR or code — name screen, "כבר נרשמתי".
2. Type the full name. One registration under that name: "is this you?".
3. Yes — the registration continues here and the old browser shows "removed, continued elsewhere". Before publishing: the waiting screen; the topics and the position are not asked again, the saved answers stay and are not shown on this phone, and "לענות מחדש" is there for anyone who wants it. After publishing: My table, or "waiting for a table" if not seated yet.

The name is not found, or is found twice: the screen says which, and the person can fix the name and try again. Only if they then ask ("הרשמה חדשה בשם הזה") are they registered as a new person: the registration steps, then waiting, or "waiting for a table" after publishing. Nobody is registered silently.

Role: Participant, task: latecomer: 3 registration steps, then "מחכים לשולחן" until the host seats them; the screen changes by itself.

Role: Participant, task: cancel: 2 steps before closing (unchanged). After publishing a seated person cannot cancel; the host removes them ("הסרה מהרשימה") or, during the discussion, moves them. The table's "move on" count adjusts by itself when a tablemate leaves (`moveOnIfReached`).

Role: Participant, task: our table finished early: 1 step. After the last proposal the table moves itself to All proposals: read and rate other tables' proposals as they arrive. Nothing left: "סיימנו", with what happens next and no "wait for the teacher".

Role: Participant, task: our table is stuck: 1 step. "לעבור הלאה" — two tablemates (all of them at a table of two) move the table on. In table pace the same press also moves the table from Table talk to Proposals when its questions are used up.

## 7. Screen inventory

Kept = same job, moved into Class. All Tables screens keep the states of shared-table-assignment.md section 7.

| Screen | Was | Route | Single job | Verdict and states that change |
|---|---|---|---|---|
| Home ("דף הבית") | Class TeacherHome + Tables HostList | `/t` | Find or start a plan, a lesson or an assignment | Merged. HostList retired as a screen. "פתוחים עכשיו" holds lessons only. Empty: both "start" actions |
| Setup | Tables HostSetup | `/t/tables/new`, `/t/tables/:id` | Describe the event, open registration | Kept. Adds the audience choice. Seats per table default 7, the same with or without a lesson attached. Loses the "return by full name" switch and its warning |
| Registration open | Tables HostLive | `/t/tables/:id` | Share the link, watch the count | Kept. Adds the discussion entry: "הוספת דיון", or the attached lesson with "הסרת הדיון" |
| Add a discussion | NEW | `/t/tables/:id/discussion` | Choose the game (a class, for a school) and the pace | New. Empty: no game with questions yet, with the way to make one. Loading; error with the choices kept. No permission: host sign-in. Already attached: goes to the assignment. Done: the lesson's console |
| Assignment preview | Tables HostPreview | `…/preview` | Decide whether to publish | Kept |
| Published assignment | Tables HostAssignment | `…/assignment` | See the tables, seat latecomers | Kept. Once the lesson starts it reads the lesson's tables |
| Registered participants | Tables HostParticipants | `…/participants` | Check names, remove a person | Kept. Loses the "המשיך בשם" tag: nothing marks a return by name |
| Fix details, Remove, Delete, Remove the discussion | Tables modals + NEW | modal | — | Kept. "Remove the discussion" is new and offered only until the discussion starts |
| Lesson console | Class TeacherConsole | `/t/:lessonId` | Run the lesson | Kept. Table pace: the step rail shows room steps, the free stretch as one segment with counts per table step |
| Table card / Table sheet | Class TableCard, TableSheet | console, `/t/:lessonId/table/:n` | See and help one table | Kept. **Host sees per table:** number, topic, names (who is present), the table's step, part of the turn, questions asked of total, proposals written, time on the current step and the stuck mark, "move on" presses of needed. **Never:** positions, choices, which side |
| Questions of this lesson | Class PlanScreen | `/t/:lessonId/plan`, game route | Plan questions and settings | Kept. Adds "מי קובע את הקצב?" |
| Projector | Class TeacherProjector + Tables RoomScreen | `/t/:lessonId/screen`, `/t/tables/:id/screen` | Join, then who sits where, then the stages | Merged. RoomScreen's two views become the projector's first two. Free stretch: who sits where plus room progress. No permission: host sign-in |
| Front door, code | Class FrontDoor, ClassCode | `/`, `/c/:code` | Get in by code | Kept. New branch: no seat in a lesson with an assignment → `/tables/:id` |
| Link home (all states) | Tables ParticipantHome | `/tables/:id` | Show the one thing that fits | Kept. New: "כבר נרשמתי" on the name state at every status that accepts people; the "already registered" state with its two notices (name not found, name found twice) |
| Rank topics / Choose a table | Tables RankedPreferences, DirectPicker | `…/choices` | Pick topics or a seat | Kept; route renamed |
| My position | Tables ParticipantPosition | `…/position` | Answer or decline | Kept |
| Waiting, Cancelled, Removed, Waiting for a table | Tables | `/tables/:id` | Say what happens next | Kept |
| My table | Tables ParticipantMyTable + Class TablesView | `…/my-table`; in shape C the Tables step of `/m/:lessonId` | Know where to sit | Merged, in the Class look (the large number); the Tables drawing of a table with seats is not carried over (decision 13). With registration: names and topic, no side marks. Done: "כניסה לדיון" once the discussion starts. Shape C keeps side marks |
| Waiting step | Class WaitingView | `/m/:lessonId` | Wait for the start | Kept for shape C. Shape B shows My table instead |
| Side step | Class SideView | `/m/:lessonId` | Choose a side | Kept for shape C. Absent in shape B |
| Table at work | Class TableFlow and its parts | `/m/:lessonId` | Talk, write, rate | Kept. Table pace: every "חכו למורה" state gets an action or a "what happens next" line. Paused: lesson paused screen |
| All proposals, Vote, Summary | Class | `/m/:lessonId` | Rate, vote, see the result | Kept. Lists group by topic when the lesson has topics. Support by side: totals from the server with registration (decision 5) |
| Table finished | NEW | `/m/:lessonId` | Say the table is done and what comes next | New. Empty: nothing more to rate. Done: flips to Vote by itself |
| Tables app shell, Placeholder, HostGate | Tables | — | — | Retired |

## 8. Findability

- Home: three groups; plans keep their class filter; table assignments with registration open first, then the other active ones, ended after; search by name.
- Console in table pace: tables sorted by number, with a filter "stuck / at questions / at proposals / finished"; the count per table step is always visible.
- Registered participants, Published assignment: search by name (kept). Projector: paged by table number (kept).
- All proposals, Vote, Summary with topics: grouped by topic, then today's order.
- Participants never search: they land on their own state.

## 9. Decisions (Tal, 2026-11-11) and assumptions

1. **When does the vote open in table pace?** DECIDED: tables go freely through questions and proposals, a finished table reads and rates the others' proposals, and the host opens the vote once for everyone.
2. **One set of words or two?** DECIDED: two small sets (teacher / host, student / participant, lesson / gathering, choosing a side / my position), chosen per lesson. First round: everything a participant reads, plus the registration screens. The console and the plan screens keep school words until a community host runs a discussion.
3. **What is a topic during the discussion?** DECIDED: a label on the table; everyone still answers the same question to solve, and lists are grouped by topic.
4. **A different phone or browser.** DECIDED: the full name is enough, always. "כבר נרשמתי" by full name works before and after publishing, with no limit on how many times. It is not a host setting: the Setup switch "לאפשר חזרה לפי שם מלא", its warning and the tag "המשיך בשם" are retired, and the host is shown nothing about a return. Tal judges the risk of someone typing another person's name as not real. `settings.allowReturnByName` stops being read and written; it stays optional in the schema so stored assignments still parse, and is dropped in a later clean-up. New server work: today `fn_tablesRegister` allows a claim only when the setting is on and registration is open.
5. **"Support by side" in the Summary.** DECIDED: shown in lessons that used registration too. To keep the privacy rule (nobody sees a person's position), the server computes the totals per side from the private answers and the clients receive totals only; the position is still never copied to `side` / `camp` on the subscription. No minimum group size: every side's total is shown, however small (Tal, 2026-11-11).
6. **Seats per table.** DECIDED: default 7 for a table assignment, and the host can change it. Attaching a discussion adds no upper limit: there is no "2–8" cap in a lesson with registration, nothing is blocked and no notice is shown. A lesson with no registration keeps today's default of 6 and today's behaviour (2–8). Technical note: the talk-in-turns machine (`MAX_TABLE_SIZE`, `functions/src/classroom`) is built and tested for 2–8, so the build must extend and test it for larger tables before shape B ships. The assignment's own field keeps today's range (3–20, `TABLE_ASSIGNMENT_TABLE_SIZE_MIN` / `_MAX`).
7. **Can a table start before the host presses start?** DECIDED: no; one "start" for the room.
8. **Old links.** DECIDED: redirect at once. Tables is new and nobody is registered on it, so no identity is lost; tables.wizcol.com does not need to serve the Class app during a transition.
9. **Changing the pace during a lesson.** DECIDED: the host may take the pace back (table → host; every table goes to the room's step), not the other way mid-lesson.
10. **Returning on another phone before publishing.** DECIDED: after "כן, זה אני" the person does not answer topics and position again. The answers stay saved, are not shown on the new phone, and "לענות מחדש" is available. Today a claim makes the person answer again, so this is new server work.
11. **"כבר נרשמתי" with a name that is not found, or found twice.** DECIDED: tell the person and let them fix the name; register as a new person only if they ask.
12. **The host's first page.** DECIDED: "דף הבית" (EN "Home"), in the page title and the back bar. "מערכי השיעור" names the group of lesson plans only.
13. **My table.** DECIDED: the Class look (the large number), not the Tables drawing of a table with seats.
14. **A registration that is open now.** DECIDED: only under "חלוקות לשולחנות", first in the list. "פתוחים עכשיו" is for lessons.
15. **"Sit where you like" with a discussion.** DECIDED: that mode has no publish step, so the condition for My table and for "התחלת הדיון" is "registration closed".

Settled by this spec on 2026-11-11 (Tal: "go ahead"), each stated where it applies:
- Audience: set in Setup (assignment) and in "פרטי השיעור" (lesson); on attaching, the object that existed first keeps its value and the pair shares it from then on (section 2).
- "הוספת דיון" step 2 is a screen, `/t/tables/:id/discussion` (sections 4, 7).
- A discussion can be removed until it starts; both the assignment and the lesson survive (section 2).
- The moved role-naming strings: base key = new school text, `.community` = today's text (section 3).
- "כניסה לדיון" is the label of the jump from My table into the discussion; "לשולחן שלי" keeps its own jump (section 3).

Assumptions: Tables and Class use the same Firebase project and Google accounts. A person without a phone is added at the table during the discussion (existing); there is no such path in registration only. "Sit where you like" seating works with a discussion: tables fill live. An assignment attached to a lesson with no topics typed gets one topic named after the game, and the rank step is skipped. A registration that returned by name still cannot be cancelled or renamed by the person (today's rule, `cancel.claimed`, `error.nameClaimed`); the host can remove it.

Open: in "sit where you like" with a discussion, a person who arrives after registration closed has no seat and no way to take one (the code box sends them to `/tables/:id`, which says "closed"). Proposed: they register by name and wait for a table, as after publishing; the host seats them. Needs Tal.

## 10. Handoff to UX

Fixed by this spec: the objects and who owns table membership when; the room-step / table-step rule; the three shapes; the label table and the four switching nouns; the routes and the old-link table; one home, "דף הבית", with three groups and which objects each holds; what the host sees per table and what never; the privacy rule; every participant state in table pace has an action or a next-step line.

Yours to decide (ux-ui-architect, ui-design-system-architect): how the home's three groups look and collapse; how the free stretch reads on the step rail and the projector; the table card's layout for the new facts; where the entries "הוספת דיון", "הסרת הדיון" and "הרשמה מראש" sit; the "סיימנו" screen; how topic grouping looks in lists; the wording of every (?) label; the layout of the Add a discussion screen. Decided, not open: My table uses the Class look (decision 13). The design for use case 1 is [join-class-registration-design.md](../design/join-class-registration-design.md).

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
10. **Two size ranges and two defaults.** A lesson: 2..8, default 6 (`DEFAULT_TABLE_SIZE`). An assignment: 3..20, default 7. Each keeps its own, and a discussion adds no cap to an assignment (decision 6). The engine takes a largest table size only; Class promises nobody sits alone; the turn machine must be extended beyond 8.
11. **Tables has three languages, Class seven.**
12. **shared-table-assignment.md drifted:** its header says "not implemented yet" (the app is live) and its open question 1 is answered (`tablesRemoveParticipant`). Update its status line when this spec is agreed.
