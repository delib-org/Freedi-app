# join-class: Lesson plans, games and lessons — IA spec

Status: agreed (Tal, 2026-10-29; v2 applies Tal's model decisions; the defaults in §11 were taken without asking)
Date: 2026-10-29
Card: Trello mqqqRWqT, "Lesson type vs game. Need a hierarchical system with names that fit a school."
Supersedes in docs/ia/agora-classroom.md: §13.5 (the list on the home), §13.7 (teacher hierarchy), the teacher lines of §13.8, the entry points of §13.15 (the row's copy action), and §12/§13.15.1 "the lesson is a top-level main statement". Everything else stands: lesson status (§13.6), the console, the projector, the student side.

The card: "Teachers need to be able to build a lesson plan and open games according to the lesson plan. E.g. a lesson on bullying: with class 9-2 they play game 1 and with class 9-4 they play another game."

Tal's binding decisions (2026-10-29):
- The Freedi hierarchy stays strict: `parentId`, `topParentId` and `parents`, built with `createStatementObject`.
- A plan and a prepared game are data, not statements.
- A lesson (a played game) is a statement under a top-level class statement. A teacher with no classes gets a top-level teacher statement instead.
- Classes come from Studio (`agoraClasses`).
- Old lessons are moved by a migration.

## 1. Audiences
| Audience | One-line goal | Must never see |
|---|---|---|
| Teacher (Google, desktop or phone, Hebrew first) | Prepare a topic once, with one or more games, then run the right game with each class and find what each class did | Another teacher's plans |
| Student (12–15, phone, anonymous) | Type the code, play | Plans, games, the class or teacher statement, other classes' lessons |
| Projector | Show the lesson's code and steps | Anything from this spec (unchanged) |

## 2. Object model
| Object | What it is | Stored as | Cardinality | Lifecycle |
|---|---|---|---|---|
| Lesson plan (מערך שיעור) | The topic the teacher prepares, e.g. "בריונות" | doc `classPlans/{planId}` (not a statement) | teacher 1–n plans | exists (no delete in this batch) |
| Game (משחק) | One prepared game: questions, intro, videos, side claims, settings | doc `classPlans/{planId}/games/{gameId}` (not a statement), holding a **snapshot** (§9). No class code | plan 1–n games | prepared; edited at any time |
| Class (כיתה) | A Studio class, e.g. "ט׳2" | `agoraClasses/{classId}` (exists). Its **class home**, a top-level group statement, is created lazily | teacher 0–n classes | Studio's |
| Teacher home | Where lessons go when the teacher has no class, or picks none | top-level group statement, one per teacher, created lazily | teacher 0–1 | — |
| Lesson (שיעור) = played game | One game played with one class. Students, tables, answers and votes hang under it | question Statement built from the game snapshot. `parentId = topParentId = homeId`, `parents = [homeId]`. Its own class code. NEW `statementSettings.classLesson` | game 0–n lessons; home 0–n lessons | live / paused / open / ended (§13.6) |
| Class work | Students, tables, answers, votes | unchanged, under the lesson | — | — |

"Home" below means a class home or a teacher home. Both are internal containers; neither has a label in join-class.

**Statement tree:**
```
classHome (group, parentId 'top', topParentId = self, parents [])      teachers only
  lesson (question, parentId = home, topParentId = home, parents [home])  code holders
    guiding / challenge questions, paragraphs (parents [home, lesson])
      answers, proposals (parents [home, lesson, question])
        replies (parents [home, lesson, question, proposal])
```

Relations:
- plan 1→n game (subcollection);
- game 1→n lesson (`classLesson.gameId`);
- lesson n→1 home (`parentId`);
- class home 1→1 agoraClass (`agoraClasses.joinClassHomeId` and `classHome.classId`).

A lesson's questions are built from the game's snapshot when the lesson is made. Editing the game later does not change lessons that already exist.

**Class home.**
- Id: `jcClass_{classId}`, stable.
- `statementType: group`, title = the class name.
- `membership.access = 'secret'`, so the top-parent mirroring skips it (`fn_ensureTopParentSubscription` CLOSED_ACCESS).
- NEW `statementSettings.classHome = { kind: 'class', classId }`.
- Admin subscriptions for every uid in `teacherIds`; they are re-synced, as upserts, each time a lesson is started there.

**Teacher home.**
- Id: `jcTeacher_{uid}`, title = the teacher's display name.
- `classHome = { kind: 'teacher', uid }`, same access.
- Created lazily by the server.

**The lesson lives in the tree.** The lesson keeps everything that works today: `classCodes`, `classTables`, `classLanguageFlags`, the ballot and votes are all keyed on the lesson id or its questions, not on `topParentId`. What changes is every place that used `topParentId` to mean "the lesson" (§9.4).

## 3. Labels
One name per concept. Every key goes in all 7 locale files (`apps/join-class/src/lib/locales/{he,en,ar,de,es,fa,nl}.ts`). (?) means the Hebrew needs a native read.

| Concept | EN | HE | i18n key | Route | Code type | Retire |
|---|---|---|---|---|---|---|
| Lesson plan | Lesson plan | מערך שיעור | NEW `classPlan.*` | `/t/plans/:planId` | `ClassPlan`, `classPlans` | נושא / יחידה / תבנית as object names |
| Game | Game | משחק | NEW `game.*` | `/t/plans/:planId/games/:gameId` | `ClassGame` (subcollection `games`) | "שיעור" for the prepared thing; פעילות |
| Lesson | Lesson | שיעור | `teacher.*`, `lesson.*`, `console.*` (kept) | `/t/:mid`, `/m/:mid` | question Statement + `classLesson` | הפעלה, סשן, run, משחק ששוחק |
| Class | Class | כיתה | NEW `teacher.lesson.class_*` | — | `agoraClasses`, `classLesson.classId` | קבוצה |
| Class / teacher home | (never shown in join-class) | — | — | — | `statementSettings.classHome` | — |
| Home title | My lesson plans | מערכי השיעור שלי | `teacher.home.title` (value changes) | `/t` | — | "השיעורים שלי" as the home title |
| Open now | Open now | פתוחים עכשיו | NEW `teacher.home.open_now` | — | — | — |
| New plan | + New lesson plan | + מערך שיעור חדש | `teacher.new` (value changes) | — | — | "+ שיעור חדש" |
| Plan name field | Lesson plan name | שם מערך השיעור | `teacher.new.title_label` (value changes) | — | — | — |
| Plan name example | e.g. Bullying online | למשל: בריונות ברשת | `teacher.new.placeholder` (value changes) | — | — | — |
| Empty name / failed | Write a name / Couldn't create it. Try again. | כתבו שם / לא הצלחנו ליצור. נסו שוב. | `teacher.new.invalid`, `teacher.new.failed` (values change) | — | — | — |
| Empty home | No lesson plans yet. Name your first one: | עוד אין מערכי שיעור. תנו שם לראשון: | `teacher.home.empty` (value changes) | — | — | — |
| How it works | 1. A lesson plan · 2. Games and their questions · 3. A lesson with a class: show them the code | 1. מערך שיעור · 2. משחקים ושאלות · 3. שיעור עם כיתה: מראים לה את הקוד (?) | `teacher.home.how` (value changes) | — | — | — |
| Plan row counts | Games: {{games}} · Lessons: {{lessons}} | משחקים: {{games}} · שיעורים: {{lessons}} | NEW `classPlan.counts` | — | — | — |
| Back to home | My lesson plans | מערכי השיעור שלי | NEW `classPlan.back` | → `/t` | — | — |
| Rename plan | Rename | שינוי שם | NEW `classPlan.rename` | — | — | — |
| New game | + New game | + משחק חדש | NEW `game.new` | — | — | — |
| Game name field / example | Game name (the dilemma) / e.g. Report or keep quiet? | שם המשחק (הדילמה) / למשל: לדווח או לשתוק? | NEW `game.title_label`, `game.placeholder` | — | — | — |
| Which questions? / Blank | Which questions? / New questions | עם אילו שאלות? / שאלות חדשות | `teacher.new.choose`, `teacher.new.from_scratch` (kept) | — | — | — |
| Copy source | Questions from another game | שאלות ממשחק אחר | `teacher.new.from_previous` (value changes) | — | — | "שאלות משיעור קודם" |
| Copy help / pick lead / form | …of a game you already made / Choose a game… / Name of the new game | …של משחק שכבר הכנתם / בחרו משחק. נעתיק את השאלות וההקדמה. / שם המשחק החדש | `teacher.new.from_previous_help`, `teacher.new.pick_lead`, `teacher.copy.title_label`, `teacher.copy.help`, `teacher.copy.not_yours` (values change from "שיעור" to "משחק") | — | — | — |
| Plan the questions | Plan the questions | תכנון השאלות | `teacher.row.plan` (kept) | game route, or `/t/:mid/plan` | PlanScreen | — |
| Start a lesson | + Lesson with a class | + שיעור עם כיתה | NEW `teacher.lesson.new` | — | `classStartLesson` | "שיעור חדש עם אותן שאלות" (`teacher.row.copy`, delete); any "פתיחה" (taken by "פתיחה מחדש") |
| Class choice | Which class? | איזו כיתה? | NEW `teacher.lesson.class_label` | — | — | — |
| No class choice | No class | בלי כיתה | NEW `teacher.lesson.class_none` | — | teacher home | — |
| No classes yet | No classes are assigned to you yet. The lesson will be kept under your name. | עוד לא שויכו אליכם כיתות. השיעור יישמר תחת השם שלכם. (?) | NEW `teacher.lesson.no_classes` | — | — | — |
| Lesson row | {{class}} · {{date}} | {{class}} · {{date}} | NEW `teacher.lesson.row` | — | — | — |
| Game with no lessons | No class has played this game yet | עוד אף כיתה לא שיחקה במשחק הזה | NEW `game.no_lessons` | — | — | — |
| Class filter, all | All classes | כל הכיתות | NEW `classPlan.filter_all` | — | — | — |
| Edits stay in this lesson | Changes here are for this lesson only | השינויים כאן רק לשיעור הזה | NEW `plan.lesson_only` | `/t/:mid/plan` | — | — |
| Lesson came from | Game: "{{game}}" · Class: {{class}} | משחק: „{{game}}” · כיתה: {{class}} | NEW `plan.lesson_from` | — | — | `plan.copied_from` |

Kept unchanged: every status label (§13.6), "לשיעור", "פתיחה מחדש", the console, student and projector strings, `lesson.not_lesson`. `teacher.home.filter*` values change from "שיעור" to "מערך שיעור".

Code-only names, accepted:
- `statementSettings.lessonPlan` is the lesson's step state.
- The route segment `/plan` means "תכנון השאלות".
- `console.look.game` ("משחקי") is an adjective about the look.

## 4. Hierarchy (teacher, max depth 3 from `/t`)
```
0 /t                                   מערכי השיעור שלי  [פתוחים עכשיו] + [מערכי השיעור]
1   /t/plans/:planId                   מערך שיעור: games, each with its lessons by class
2     /t/plans/:planId/games/:gameId   תכנון השאלות (game data)
2     /t/:lessonId                     השיעור (console, unchanged)
3       /t/:lessonId/plan              תכנון השאלות (this lesson only)
3       /t/:lessonId/table/:n
-     /t/:lessonId/screen              מקרן (own window, unchanged)
```
- A row under "פתוחים עכשיו" goes straight to `/t/:lessonId`. Its parent is still the plan.
- Student (unchanged): `/` → `/c/:code` → `/m/:lessonId`. A game has no code and no statement.
- `/m/:homeId` shows `lesson.not_lesson`.
- The class and teacher homes appear in the main Freedi app for their teachers as groups. That is not part of join-class navigation.

## 5. Navigation model
- **Global:** the header on `/t`. Nothing new.
- **Home `/t`, in order:**
  1. "+ מערך שיעור חדש".
  2. "פתוחים עכשיו": lessons that are live, paused or open and were opened in the last 7 days. Each row: "<class> · <game>", the status, "לשיעור".
  3. "מערכי השיעור": one row per plan → `/t/plans/:planId`.
- **Plan screen:** the title (rename in place). One section per game, in `order`. Each section shows "תכנון השאלות" (→ the game route), "+ שיעור עם כיתה", and the game's lessons, newest first, each with its status and "לשיעור" or "פתיחה מחדש". At the end, "+ משחק חדש" (today's `homeCreateFlow` machine: choose → nameNew | pick → nameCopy).
- **"+ שיעור עם כיתה":** an inline choice "איזו כיתה?". It lists the teacher's active Studio classes (`agoraClasses` where `teacherMap.<uid> == true`) plus "בלי כיתה". With no classes it shows `teacher.lesson.no_classes` and one "יצירה". Then the teacher lands on the console.
- **Back paths:**
  - plan screen → "‹ מערכי השיעור שלי" → `/t`.
  - game questions → "‹ <plan title>" → plan screen.
  - console → "‹ <plan title>" → plan screen; "סיום השיעור" also returns there.
  - `/t/:lessonId/plan` → "‹ השיעור" (unchanged).
- **Redirects:** an unknown or foreign `planId` or `gameId` → the not-your-lesson state. Declare the `/t/plans/...` routes before `/t/:mid/...`.

## 6. Task flows (taps; typing excluded)
1. **Create a plan (2):** "+ מערך שיעור חדש" → name → "יצירה". This writes the plan doc and a first game named after the plan, then lands on the game questions. Empty state: 1 tap.
2. **Add a blank game (3):** "+ משחק חדש" → "שאלות חדשות" → name → "יצירה".
3. **Add a game copied from another game (4):** "+ משחק חדש" → "שאלות ממשחק אחר" → "בחירה" → "יצירה". This is a client-side copy of the game doc, since both are the teacher's own.
4. **Open a game with a class (3 from home):** plan row → "+ שיעור עם כיתה" → pick the class (or "בלי כיתה") and "יצירה". This calls `classStartLesson` and lands on the console at Waiting, with the code.
5. **See past lessons per class (1–2):** plan row, with the class filter when the plan has 2 or more classes. "לשיעור" opens an ended console; "פתיחה מחדש" resumes it.
6. **Daily return (1):** "פתוחים עכשיו" → "לשיעור".

## 7. Screen inventory
| Screen | Route | New/changed | Single job | Empty | Loading | Error | No permission | Done |
|---|---|---|---|---|---|---|---|---|
| Teacher home | `/t` | changed | start a plan; jump to an open lesson | name field open + how line | skeleton | inline + retry | anonymous → `/login` | → game questions |
| Lesson plan | `/t/plans/:planId` | **new** | see the games and which class played what; start a lesson | no games: "+ משחק חדש" open; `game.no_lessons` | skeleton | inline + retry | not-your-lesson | → game / console |
| Game questions | `/t/plans/:planId/games/:gameId` | **new route**, PlanScreen on a game-doc backend | write the game's questions | as today | as today | as today | not-your-lesson | "נשמר" |
| Lesson questions | `/t/:lessonId/plan` | changed (`plan.lesson_from`, `plan.lesson_only`) | fix this lesson's questions | — | — | — | — | — |
| Console | `/t/:lessonId` | changed (back target; class in the header) | run the lesson | — | — | — | — | end → plan screen |
| Class choice | inline on plan / game screens | **new** | pick the class | `teacher.lesson.no_classes` | "מכינים את השיעור..." | `teacher.copy.failed` + retry with the same id | `teacher.copy.not_yours` | → console |
| Student lesson | `/m/:mid` | changed only for a home id | — | — | — | home → `lesson.not_lesson` | — | — |

## 8. Findability
- Home plans: by last activity; name filter above 10 plans.
- Plan screen: games in `order`; lessons newest first; class filter at 2 or more classes.
- "פתוחים עכשיו": the last 7 days only, so walk-away lessons do not pile up.
- Copy pick list: grouped by plan, with a filter above 10 games.
- Class choice: the teacher's active classes by name. A teacher has few, so no filter.

## 9. Data, functions, rules
### 9.1 Data (all times in ms)
- `classPlans/{planId}`: `{ planId, title, ownerUid, createdAt, lastUpdate }`.
- `classPlans/{planId}/games/{gameId}`: `{ gameId, planId, ownerUid, title, order, snapshot, sourceMainId?, createdAt, lastUpdate }`.
- `ClassGameSnapshot`, exactly what `buildLessonCopy` copies today and no more:
  - `questions[]`: `{ key, text, hint?, classRole, order }`;
  - `paragraphs[]`: `{ key, text, order }`;
  - `introVideos[]`, `sideNames?`, `sideClaims?`;
  - `settings`: speakSeconds, proposalsTurns, tableSize, allowOwnQuestions and the rest of the `mainSettings` whitelist;
  - `defaultLanguage?`.
- `StatementSettingsSchema` (optional fields, no picklists, because of the strict-parse trap):
  - `classLesson: optional(object({ planId: string(), gameId: string(), classId: optional(nullable(string())), className: string() }))`;
  - `classHome: optional(object({ kind: string(), classId: optional(string()), uid: optional(string()) }))`.
- `AgoraClassSchema`: optional `joinClassHomeId: string()`, written by the server only.
- Shared helpers in shared-types: `snapshotFromLesson(main, children)` and `lessonFromSnapshot(snapshot, home, ids, now)`. Both the client and the functions use them, so the whitelist lives in one place.

### 9.2 Cloud Functions
- **NEW `classStartLesson({ planId, gameId, classId: string | null, newMainId })`.**
  - Checks: the caller owns the plan; if `classId` is set, the caller is in `agoraClasses.teacherIds` and the class is active.
  - One transaction:
    - ensure the home: create it with `createStatementObject` fields (group, `parentId 'top'`, `topParentId` self, `parents []`, access secret) and upsert an admin subscription per teacher;
    - write `joinClassHomeId` on the class;
    - build the lesson and its children from the snapshot (lesson: `parentId = topParentId = home`, `parents [home]`; children: `parents [home, lesson]`, `topParentId home`);
    - write the class code and `classLesson`.
  - Retry with the same `newMainId` returns the same lesson (as `classCloneLesson` does today).
- **NEW `classSnapshotGame({ sourceMainId, planId, newGameId, title })`.** Turns a lesson's statements into a game doc. The migration uses it; a later "questions from a past lesson" card can too.
- **`classCloneLesson`:** kept during the rollout for old clients and re-implemented as snapshot → start under the teacher home. Remove it once no client calls it, deleting the function first (stale-function rule).
- **`cloneLesson.ts`:**
  - `isLesson()` becomes `!!statementSettings.lessonPlan && !statementSettings.classHome`, with no `parentId === 'top'` test. Top-level lessons that are not migrated yet still pass.
  - `buildLessonCopy` writes the home as parent instead of `'top'` (`cloneLesson.ts:209, 210, 235, 236, 250`).
- **`autoEvaluations.ts:56, 103, 140`** use `option.topParentId` as the lesson id. Change to `option.parents.includes(table.mainId)`, and take `mainId` from the marker or table, not from `topParentId`.
- **`fn_classPostProposal` / `fn_classPostReply`:** `topParentId: main.topParentId` already resolves to the home and `parents` already chains. No change.
- **`classroomAccess.isWorkspaceAdmin`:** unchanged; it reads the lesson's own admin subscription. Co-teachers get one through `setupAdminsForStatement`, which copies the home's admins onto every new lesson.
- **`onStatementCreated` / `setupAdminsForStatement`:** every new statement under a lesson now inherits the home's admins (all the class's teachers, capped at 20) as well as the lesson's. That costs one more subscription write per co-teacher per student post.
- **`recordDiscussionActivity(topParentId)`** bumps the home's `userFeed` for its teachers. That is acceptable; students hold no subscription on the home.
- **`fn_ensureTopParentSubscription`:** skips the home, because its access is secret. Nothing to change.
- **`fn_subscriptions` awaiting-entry:** only for moderated access; lessons are `openToAll`. No change.

### 9.3 Firestore rules (each change)
1. **`classPlans/{planId}`:** read and update if `resource != null && resource.data.ownerUid == auth.uid`; create if `request.resource.data.ownerUid == auth.uid && planId == doc id`; no delete.
2. **`classPlans/{planId}/games/{gameId}`:** the same owner test on `ownerUid`, plus on create `get(plan).data.ownerUid == auth.uid`; no delete.
3. **`statements` read:** split today's `allow read;` into:
   - `allow get: if resource == null || resource.data.get('statementSettings', {}).get('classHome', null) == null || isAdmin() || isSystemAdmin();`
   - `allow list: if true;` (today's behaviour, kept until the staged auth gate ships).
4. **`statementsSubscribe` `getAccess()`:** today it uses the statement's own `membership.access`, else the top parent's. New order:
   - the statement's own access;
   - else, if the top parent carries `classHome`, the access of `statement.parents[1]` (the lesson);
   - else the top parent's access, as today.

   That is at most 3 gets: the statement, the home, the lesson. Without this change every subscription on a lesson's questions would read the home's `secret` and refuse students. The lesson itself carries `openToAll`, so its own subscription passes on the first branch.
5. **`classCodes`, `classTables`, `classLanguageFlags`:** unchanged. They key on the lesson id (`mainId`) and the caller's subscription to it.
6. **`classLessonWritable(mainId)`:** unchanged. It is called with the subscription's `statementId`, which is the lesson.
7. **`classBallotOpen`:** unchanged. The challenge's `parentId` is the lesson.
8. **`statements` update/delete `isAuthorized()` → `checkTopParentAdmin`:** the class's teachers become authorized on every statement in every lesson of that class. This is intended (co-teachers). No change.

### 9.4 Client (join-class)
- **Queries keyed on `topParentId`** must use `parents array-contains <lessonId>`, which matches both before and after the migration:
  - `listenClassOptions` (`c3Data.ts:52`);
  - `listenRepliesToMe` and `listenLessonReplies` (`replies.ts:61, 79`);
  - their callers `FlowFeed.ts:42`, `replyHost.ts:112`, `WhatTheyWrote.ts:65`.
- **New composite indexes**, added with gcloud and never a `--force` deploy:
  - `parents CONTAINS + statementType`;
  - `parents CONTAINS + classReply.proposalCreatorId`.
- **`subscribeToClassLessons`** (`joinSubscriptions.ts:242`): drop the `parentId === 'top'` filter. Keep the `lessonPlan` test and exclude `classHome`.
- **`store.ts` sub-question create** (`:437-445`): already `main.topParentId` + `[...main.parents, mainId]`. Correct.
- **`studentWrites.ts:100` and `joinSubscriptions.ts:91`** write the subscription with `topParentId = main.topParentId || main.parentId`, which now gives the home. Correct.
- **Lessons are no longer made with `createSimpleQuestion(parentId 'top')`**; only the server makes lessons.
- **MainHub `/m/:mid`, console, projector, lesson PlanScreen:** they load by id and do not depend on the tree position. MainHub also refuses a `classHome` id.
- **Game PlanScreen:** the same screen on a second backend (the game doc's snapshot) behind the existing `planApi` / `planIntroApi` seams.
- **Join hub** (`apps/join/src/lib/store.ts:1417`, `getMainIdForQuestion`) treats `topParentId` as the workspace. A join-class question opened inside Join would follow the home. Join never opens these, so this is accepted and noted.
- **Main app:** a teacher sees their class and teacher homes as groups on the main-app home (admin subscription), with the lessons as child questions. Students see nothing there.

## 10. Out of scope
- Class rosters inside join-class, and Studio class membership of students.
- Moving a lesson to another class or home after it starts.
- Re-syncing the home's admins when Studio removes a teacher (added teachers sync on the next start).
- Moving a game to another plan, or reordering games by drag.
- Deleting or archiving plans, games or lessons.
- Sharing a plan with another teacher.
- Comparing results across classes.
- Gating `list` reads of statements; that waits for the staged auth gate.
- Changes to the student, projector or console flows.

## 11. Open questions (default taken)
1. **Prepared game storage:** a subcollection, not an array on the plan doc. It keeps the plan doc small and allows per-game rules and writes.
2. **Editing a game after a lesson exists:** the lesson keeps its snapshot.
3. **A lesson's own "תכנון השאלות"** stays editable and shows `plan.lesson_only`.
4. **Creating a plan also creates its first game.**
5. **The same class may play the same game twice;** the rows are told apart by date.
6. **Students do not see the class name.** The lesson title is the game's title.
7. **"בלי כיתה" is always offered,** not only to teachers with no classes. The lesson goes under the teacher home.
8. **Home admins:** every `teacherIds` uid is an admin of the class home, so co-teachers can open each other's lessons there. The join-class home lists only the teacher's own lessons (`openedInClass`).
9. **Archived Studio classes** are not offered; their old lessons stay where they are.
10. **"פתוחים עכשיו" window:** 7 days.
11. **Until the migration reaches an old lesson,** it shows as a plan of its own, derived from it (v1 rule: `planId = L.id`). "+ שיעור עם כיתה" is hidden on it until it has a game doc.

## 12. Handoff to UX
Fixed by this spec:
- the objects and their labels;
- one new screen (the plan screen) and one new route (game questions);
- max depth 3;
- the order of the home;
- each game section holds its lessons, "תכנון השאלות" and "+ שיעור עם כיתה";
- the class is chosen from Studio's list, plus "בלי כיתה";
- the back targets;
- no "פתיחה" in the new-lesson action.

Yours to decide:
- how game sections and their lessons read on a phone;
- how the class choice and the class filter are presented;
- the console header with class and game;
- the visual rank of "+ שיעור עם כיתה" against "תכנון השאלות".

Pass §3 to a native Hebrew reader for the (?) rows.

## 13. Migration: old top-level lessons under their teacher home
Script: `functions/src/migrations/moveClassLessonsHome.ts`. It uses `backfillRunGuard`: a dry run unless `--execute`, and production also needs `--confirm-prod`.

**Selection.** Statements with `parentId == 'top'` and `statementSettings.lessonPlan` present and no `classHome`. The teacher is `creatorId`.

**Skip live lessons.** Skip a lesson whose status is `live` or `paused`, at step > 0, with `lastChildUpdate` (or `lastUpdate`) less than 3 hours old. The lesson is reported and picked up by a later run. `open` and `ended` lessons are moved.

**Per lesson L, idempotent, in this order:**
1. Ensure the teacher home `jcTeacher_{uid}` (as `classStartLesson` does) and its admin subscription.
2. Collect L's tree: `topParentId == L.id` together with `parents array-contains L.id`, de-duplicated.
3. Rewrite the descendants (not L):
   - `topParentId → H`;
   - `parents → [H, ...parents]` when `parents[0] != H`;
   - rebuild `parents` from the parent chain when it is missing or does not start with L (use `backfillParentsArray` logic);
   - leave `parentId` unchanged.
4. Rewrite subscriptions where `statementId` is L or a descendant, or `topParentId == L.id`:
   - set `topParentId → H`;
   - on L's own subscriptions set `parentId → H`;
   - update the embedded `statement` copy's `parentId`, `topParentId` and `parents`.
5. Plan and game: `classPlans/{L.id}` (title = L's title, `ownerUid`) and `games/{L.id}` from `snapshotFromLesson(L)`, `order 0`, `sourceMainId L.id`. Create them only if missing.
6. Last, L itself: `parentId → H`, `topParentId → H`, `parents → [H]`, `classLesson = { planId: L.id, gameId: L.id, classId: null, className: '' }`. Because L is written last, a run that stops midway re-selects L and repeats steps 2–6. Every transform checks "already done" first.
7. Unchanged, since they are keyed on the lesson or its questions: `classCodes`, `classTables`, `classLanguageFlags`, ballots, votes, evaluations, RTDB live drafts. Old `userFeed` entries for L are left alone; they still open L.

**Batching.** Bulk writes in chunks of 500 (`FIREBASE.BATCH_SIZE`), one lesson at a time, with a pause between lessons, because every statement update fires the update triggers.

**Dry run output.** Per lesson: the descendant count, the subscription count, the home to create, and the skip reason. Totals at the end.

**Stragglers.** A student who writes during a move can create a child with the old `topParentId`. Run the script a second time (sweep) after the first; step 3 catches them.

**Run order:**
1. shared-types (build, repack the functions .tgz);
2. functions (`classStartLesson`, `classSnapshotGame`, `isLesson`, `autoEvaluations`, `classCloneLesson`);
3. rules (§9.3);
4. indexes (§9.4), waiting until they are built;
5. join-class client (`parents` queries; this must be live before any lesson moves);
6. on `freedi-test`: dry run → execute → sweep → check a moved lesson end to end (student by code, console, replies, auto-evaluations, vote);
7. on prod: dry run → execute in the evening → sweep the next morning.
