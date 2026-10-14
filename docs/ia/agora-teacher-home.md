# Agora: Teacher area (home and what it leads to) — IA spec

Status: draft
Date: 2026-10-14
Supersedes: the seven-section `/teach` dashboard (TeacherHome.ts as of a84ebc3fb)

## 1. Audiences
| Audience | One-line goal | Must never see |
|---|---|---|
| Teacher (primary) | Pick or prepare a scenario and run it; see how my classes are doing | Other teachers' rosters, real names, PINs; the library if not approved |
| Teacher approved for the library | Same, plus take and share scenarios with other teachers | Library moderation tools |
| Supervisor (also a teacher) | Everything a teacher does, plus the school view | Roster identities in the school view |
| System admin | Everything, plus library moderation | — |

Assumption: every supervisor and admin is also a teacher, so all share one home (`/teach`). Supervision is a separate area reached from the menu, never from the home.

## 2. Object model
- **Teacher**: account. Flags: approved for library (yes/no), supervisor (yes/no), system admin.
- **School** 1—n **Class**. Teacher n—n Class (co-teachers). Class lifecycle: active → archived.
- **Class** 1—n **Student** (alias, PIN, device binding). Lifecycle: joined → removed (may rejoin).
- **Scenario** (`AgoraTopicPackage`): owned by one teacher. Status: draft → ready. Visibility: private | public (public = listed in the library). A copy taken from the library keeps a link to its source and can show "a new version is available". The own-question lesson creates a scenario of `kind: 'quick'`, which never shows in any scenario list.
- **Library**: the set of public, not-hidden scenarios. Each has ratings and a discussion. Not an object the teacher owns; a shared shelf.
- **Lesson** (`AgoraSession`): one run of one scenario, for 0..1 class (0 = guest lesson). Lifecycle: live → finished (class score written) → closed. Holds a join code and a step plan.
- **Lesson summary**: the view of a finished lesson (class score, each student's points, vote verdict). 1:1 with a finished lesson; not a separate object. "Report" in code.
- **Achievements**: derived, server-materialised. Class achievements = `AgoraClassAggregate`. Student achievements = the member's career (per-lesson points, best lesson, helping, proposals).

Statement tree: none of these objects is a `Statement`. Scenarios, lessons and classes live in Agora's own collections (`agoraTopicPackages`, `agoraSessions`, classes via the teacher console). This spec does not touch the content inside a lesson, so no mapping is needed.

## 3. Labels
One name per concept. HE is primary. Keys exist unless marked NEW. Every changed or NEW key must be written in all six blocks of `apps/agora/src/lib/i18n.ts` (he, en, ar, es, de, nl) or the matching `lib/scenarioLibrary/strings*.ts`.

| Concept | EN | HE | i18n key | Route segment | Code type | Synonyms to retire |
|---|---|---|---|---|---|---|
| Teacher home | Teachers' room | חדר המורה | teacher.title | /teach | — | — |
| Scenario | Scenario | תרחיש | — | scenarios | AgoraTopicPackage | "מסע" (editor.title "עריכת המסע"), "topic" in routes |
| My scenarios | My scenarios | התרחישים שלי | dashboard.scenarios (change from "מה מלמדים היום?"), scenlib.seg_mine | /teach/scenarios | — | "מה מלמדים היום?" |
| All my scenarios link | All my scenarios ({{n}}) | כל התרחישים שלי ({{n}}) | NEW teach.all_scenarios | — | — | hardcoded "כל התרחישים (n)" / "הצגת פחות תרחישים" |
| Scenario library | Scenario library | ספריית התרחישים | scenlib.title, scenlib.nav, scenlib.seg_all (change from "הספרייה") | /teach/library | — | "הספרייה" alone, "ספריית תרחישים" without ה (align) |
| Create scenario | New scenario | תרחיש חדש | teacher.create_topic (drop "(בעזרת AI)", move AI to the hint), wizard.title | /teach/scenarios/new | — | — |
| Edit scenario | Edit scenario | עריכת התרחיש | editor.title (change), dashboard.scenario_settings | /teach/scenarios/:id | — | "עריכת המסע" |
| Take from library | Add to my scenarios | הוספה לתרחישים שלי | scenlib.use (change from "השתמשו בתרחיש — צרו עותק") | — | — | "צרו עותק" |
| Draft / Ready | Draft / Ready | טיוטה / מוכן | editor.draft, editor.ready | — | AgoraTopicStatus | — |
| Lesson | Lesson | שיעור | — | (session, see §9) | AgoraSession | "משחק" / game in any UI string |
| Start a lesson | Start a lesson | התחלת שיעור | startGame.title, dashboard.start_game (change from "שיעור חדש"), roster.start_with_class ("התחלת שיעור עם הכיתה") | /teach/start | — | "שיעור חדש", "פתיחת שיעור" |
| Own-question lesson | My own question | שאלה משלי | dashboard.start_quick | /teach/start?mode=quick | kind 'quick' | — |
| Live lesson | Live lesson | שיעור פעיל | dashboard.live_title, nav.live_now (change from "רץ עכשיו") | — | isSessionLive | "רץ עכשיו" |
| Back to lesson | Back to the lesson | חזרה לשיעור | dashboard.back_to_lesson | /teach/session/:id | — | — |
| Lesson summary | Lesson summary | סיכום השיעור | report.title | /teach/report/:id | — | "דוח השיעור", "המסע והפתרונות" (hardcoded) |
| Past lessons | Past lessons | שיעורים קודמים | dashboard.my_games | /teach/lessons | — | "ארכיון השיעורים והפתרונות", supervise.lessons "שיעורים" on My activity |
| Class | Class | כיתה | — | class | — | — |
| My classes | My classes | הכיתות שלי | dashboard.my_classes | — | — | — |
| Student | Student | תלמיד / תלמידה; pl. תלמידים | report.players (change from "שחקנים"), roster.title | student | TeacherConsoleMember | "שחקנים", "player" |
| Achievements | Achievements | הישגים | NEW teach.achievements | — | aggregate / career | "גרפים" as a destination name (roster.graphs) |
| Class sections | Achievements / Students / Lessons | הישגים / תלמידים / שיעורים | NEW class.tab_achievements, class.tab_students, class.tab_lessons | ?tab= | — | — |
| Menu | Menu | תפריט | nav.menu (change from "שיעורים וכיתות") | — | — | label naming only part of the menu |
| More (menu group) | More | עוד | NEW nav.more | — | — | — |
| How to run a lesson | How to run a lesson | איך מריצים שיעור | dashboard.first_run_title (drop "(45 דק')" from the menu row only) | — | — | — |
| My activity | My activity | הפעילות שלי | supervise.myActivity | /teach/activity | — | — |
| Supervision | Supervision | פיקוח | supervise.title | /supervise | — | dashboard.supervise_card (merge into supervise.title) |
| Library admin | Library admin | ניהול הספרייה | scenlib.adm_link (change from "ניהול") | /teach/library/admin | — | "ניהול" alone |
| Lesson board (replay) | The lesson board | הלוח של השיעור (?) | NEW report.open_board | /teach/session/:id | — | "המסע והפתרונות" |

Hardcoded Hebrew in TeacherHome.ts to move into keys (all six languages): the archive block ("ארכיון השיעורים והפתרונות", its description, search placeholder, "כל הכיתות", "לא נמצאו שיעורים…", "הארכיון לא נטען…", "טעינת שיעורים נוספים", "טוענים…"), "ללא ציון מסכם" (use report.not_scored), "דוח השיעור", "המסע והפתרונות", "כל התרחישים (n)", "הצגת פחות תרחישים".

## 4. Hierarchy (per role)
Role: teacher (all roles inherit this tree)
0 חדר המורה  /teach
1   התרחישים שלי  /teach/scenarios
2     תרחיש חדש  /teach/scenarios/new
2     עריכת התרחיש  /teach/scenarios/:id
1   ספריית התרחישים  /teach/library  (approved only)
2     תרחיש בספרייה  /teach/library/:id
1   התחלת שיעור  /teach/start  (from a scenario row, a class, or the menu)
1   כיתה  /teach/class/:id  (sections: הישגים | תלמידים | שיעורים)
2     תלמיד/ה  /teach/class/:id/student/:memberId
1   שיעור פעיל  /teach/session/:id  (+ /class view, + /teach/screen/:id projector)
1   שיעורים קודמים  /teach/lessons  (menu)
2     סיכום השיעור  /teach/report/:id  (also depth 2 from a class's שיעורים, depth 3 from a student)
1   הפעילות שלי  /teach/activity  (menu)
1   ניהול הספרייה  /teach/library/admin  (menu, system admin)
1   פיקוח  /supervise  (menu, supervisor; its own tree, unchanged by this spec)

Max depth from home: 3 (home → class → student → lesson summary). Nothing deeper.

## 5. Navigation model
- **Global**: the existing `TeacherNav` bar on every teacher screen: back arrow, house (to /teach, hidden on /teach), title, trailing (join code / language), ≡ menu.
- **Menu (≡, "תפריט")**, in this order:
  1. "השיעור הזה" — the console's own rows (only on a lesson screen).
  2. "שיעור פעיל" — one row per live lesson (only when one exists). This is the second, always-there return path.
  3. Places: חדר המורה · התרחישים שלי · ספריית התרחישים (approved) · התחלת שיעור.
  4. "הכיתות שלי" — one row per class (kept: it is how a teacher crosses between classes mid-period).
  5. "עוד": שיעורים קודמים · הפעילות שלי · פיקוח (supervisor) · ניהול הספרייה (system admin) · איך מריצים שיעור.
- **Home holds only**, in order:
  1. Live-lesson banner(s), only while a lesson is live: "שיעור פעיל" + class · scenario · step + "חזרה לשיעור". First thing on screen.
  2. "איך מריצים שיעור" strip, only on first run (see §7 states), dismissible.
  3. "התרחישים שלי": "+ תרחיש חדש" in the section header; up to 5 rows (ready first, then most recently edited); the last row "שאלה משלי"; under the list "כל התרחישים שלי (n)" and, for approved teachers, "ספריית התרחישים".
  4. "הכיתות שלי": one card per active class (name, students, lessons, average class score) and "+ כיתה חדשה" when the teacher has a school.
  Removed from home: supervision card, "הפעילות שלי" link, the lesson archive.
- **Local**: `/teach/scenarios` ⇄ `/teach/library` share one two-option switch ("התרחישים שלי" | "ספריית התרחישים"). Library admin leaves this switch and goes to the menu. Class page has three sections (הישגים default | תלמידים | שיעורים) and the cog for class settings.
- **Contextual**: scenario row → start (ready) or edit (draft), edit icon always → editor; library scenario → "הוספה לתרחישים שלי" → then "התחלת שיעור עכשיו" or "עריכת התרחיש"; class → "התחלת שיעור עם הכיתה"; student row → student page; any lesson row → live: console, finished: lesson summary; lesson summary → "הלוח של השיעור" (read-only replay) and → its class.
- **Back paths**: the arrow returns to the screen the teacher came from, with these fixed parents when entered by deep link: editor → /teach/scenarios; new scenario → /teach/scenarios; library scenario → /teach/library; start → the class if `?classId`, else /teach; lesson summary → its class, else /teach/lessons; student → its class (Students section); past lessons, activity → /teach.
- **Deep links** (all bookmarkable): /teach, /teach/scenarios, /teach/scenarios/:id, /teach/library/:id, /teach/start?topic=:id[&classId=], /teach/class/:id?tab=students, /teach/class/:id/student/:memberId, /teach/lessons?class=:id, /teach/report/:id, /teach/session/:id.
- **Redirects** (keep old links alive): /teach/topic/:id → /teach/scenarios/:id; /teach/new → /teach/scenarios/new; /teach/library/mine → /teach/scenarios.

## 6. Task flows (teacher)
Start a lesson from my scenario (3 taps)
1. חדר המורה — tap a ready scenario row
2. התחלת שיעור (scenario preselected) — pick the class
3. "התחלת שיעור" → live lesson console
(Alt: class card → "התחלת שיעור עם הכיתה" → tap scenario → start: also 3.)

Find a scenario in the library and use it (5 taps + typing)
1. חדר המורה — "ספריית התרחישים" (or menu)
2. ספריית התרחישים — search / subject chips / sort; tap a card
3. תרחיש בספרייה — "הוספה לתרחישים שלי"
4. same screen, done state — "התחלת שיעור עכשיו" (or "עריכת התרחיש")
5. התחלת שיעור — pick class, start

Create a new scenario (3 steps)
1. חדר המורה — "+ תרחיש חדש"
2. תרחיש חדש — question + description, "בניית תרחיש" (AI drafts)
3. עריכת התרחיש — review, mark "מוכן", save → back to התרחישים שלי, new one on top

Edit a scenario (2 taps; 4 if not in the top five)
1. חדר המורה — edit icon on the row
2. עריכת התרחיש — change, save
(Not on home: "כל התרחישים שלי" → search → edit icon → save.)

See a class's achievements (1 tap)
1. חדר המורה — tap class card → class page opens on "הישגים"

See one student's progress (3 taps)
1. חדר המורה — class card
2. כיתה — "תלמידים", find the student (search when long)
3. תלמיד/ה — achievements and lesson list; a lesson row opens its summary

Find an old lesson summary (4 taps + typing)
1. any screen — ≡ menu
2. menu — "שיעורים קודמים"
3. שיעורים קודמים — search title/code or filter by class; grouped by month
4. tap the lesson → סיכום השיעור
(Alt, when the class is known: class card → "שיעורים" → tap lesson: 3.)

## 7. Screen inventory
| Screen | Route | Single job | Empty | Loading | Error | No permission | Done |
|---|---|---|---|---|---|---|---|
| חדר המורה | /teach | Start from a scenario or open a class | see states below | per-section wait (scenarios and classes load apart, keep) | section-level retry, never blanks the other section | not signed in: sign-in prompt (keep) | — |
| התרחישים שלי | /teach/scenarios (NEW; absorbs home "show all" + /teach/library/mine) | All my scenarios: start, edit, publish | "עוד אין לכם תרחישים" + new / library | list wait | retry | — | — |
| תרחיש חדש | /teach/scenarios/new (was /teach/new) | Describe a question, get a draft | — | "בונים…" | retry, keep input | — | lands in editor |
| עריכת התרחיש | /teach/scenarios/:id (was /teach/topic/:id) | Review and change one scenario | — | wait | not found → back to list | not owner: read-only notice (?) | saved: back to origin |
| ספריית התרחישים | /teach/library (keep) | Find a scenario other teachers shared | none found / empty library (keep) | grid wait | retry (keep) | not approved: route shows the gate text (keep) | — |
| תרחיש בספרייה | /teach/library/:id (keep) | Preview, rate, discuss, add to mine | — | wait | not found (keep) | as library | added: start or edit |
| ניהול הספרייה | /teach/library/admin (keep; menu, not a tab) | Reports, hidden items, tags | nothing to review | wait | retry | non-admin → /teach/library | — |
| התחלת שיעור | /teach/start (keep) | Choose scenario + class, start | no scenarios: own question still works | — | start failed, retry | — | → live console |
| כיתה | /teach/class/:id (keep, three sections) | One class's achievements, students, lessons | no lessons yet / no students yet (with the class code) | wait | not found → /teach | not my class → /teach | — |
| תלמיד/ה | /teach/class/:id/student/:memberId (NEW; was an inline drawer) | One student's achievements | "עוד לא השתתף/ה בשיעור" | wait | retry | not my class → /teach | — |
| שיעור פעיל | /teach/session/:id, /class, /teach/screen/:id (keep) | Run the lesson | — | — | — | — | finished → summary |
| סיכום השיעור | /teach/report/:id (keep; single home of a finished lesson) | How the lesson went | not scored | wait | not found | not my lesson | — |
| שיעורים קודמים | /teach/lessons (NEW; moved from home panel) | Find any past lesson | "עוד לא היה שיעור" | page wait | retry, keep loaded pages | — | — |
| הפעילות שלי | /teach/activity (keep; menu only) | My own usage | — | wait | retry | — | — |
| פיקוח | /supervise/* (keep; menu only) | School view | — | — | — | non-supervisor → /teach | — |

Required states on the home:
- **First run** (no lesson ever finished, strip not dismissed): strip "איך מריצים שיעור" above "התרחישים שלי". After dismissal it lives in the menu under "עוד".
- **No scenarios**: "התרחישים שלי" shows the provisioned default scenario (today's behaviour) plus "שאלה משלי"; text points at "+ תרחיש חדש" and, when approved, the library.
- **No classes, has a school**: one "+ כיתה חדשה" card with a line on what a class is for.
- **No classes, no school**: "הכיתות שלי" says to ask the system admin to attach you to a school (dashboard.no_school_text); a guest lesson from "התחלת שיעור" still works.
- **Not approved for the library**: no library link anywhere (home, menu, start screen); "התרחישים שלי" works fully without it, including the full list at /teach/scenarios. Publishing controls on /teach/scenarios are hidden. See §9 Q2.
- **Supervisor**: home is identical to a teacher's; the only difference is the "פיקוח" row in the menu under "עוד".
- **Lesson live**: the banner leads the home and "שיעור פעיל" leads the menu, on every teacher screen.

## 8. Findability
- התרחישים שלי (/teach/scenarios): search by title; filter מוכן / טיוטה / ציבורי; sort by last edited (default) or title. Home shows only the top 5.
- ספריית התרחישים: search, subject and lesson-type chips, sort (keep as built).
- הכיתות שלי: cards; archived classes hidden. If a teacher has more than 8 active classes, group by school. Assumption: most teachers have under 8.
- תלמידים (class): sorted by alias; search when over one screen (about 12 rows); sort by points.
- שיעורים קודמים: server-side search over the whole history (today it searches only the loaded pages: defect D6), filter by class and by scenario, grouped by month, newest first, paged.
- A class's שיעורים section: newest first, links to /teach/lessons?class=:id for search.

## 9. Open questions and assumptions
1. Assumed every supervisor teaches. If a supervisor-only account exists (no classes, no scenarios), should it land on /supervise? Changes §4 for that role only.
2. Not approved: today the library is invisible. Should a non-approved teacher see a locked "ספריית התרחישים" row explaining how to get approved? Findability says yes; the current product rule says hide. Tal to decide.
3. Route renames for "lesson" (/teach/session → /teach/lesson, /teach/report → /teach/lesson/:id/summary) would complete one-name-per-concept but touch the console and every join link. Recommended for a later pass, with redirects; this spec keeps the current segments.
4. "הלוח של השיעור (?)" for the finished-lesson replay: confirm the word teachers use for the board.
5. Student page reuses the supervisor's student indicators? Content scope is the same; identity rules differ (teacher sees aliases; teacher-only real names per the console spec).
6. Home shows 5 scenarios: assumed most teachers keep under 10. If the median is 1 to 3, the "all" link appears rarely, which is fine.

## 10. Handoff to UX
Fixed by this spec: the home holds four things only (live banner, first-run strip, התרחישים שלי, הכיתות שלי) in that order; the menu's groups and order; routes and redirects above; the class page's three sections with הישגים first; the student page as its own screen; one label per concept per §3; every state in §7 has a place.
Yours to decide: how a scenario row shows ready / draft / public / new-version; the class card's single headline number; how the three class sections switch (tabs, segmented control); how the live banner stands out; where "+ תרחיש חדש" sits in the section header; how the first-run strip looks and how it is dismissed; how to make the home feel calm with few items (Tal: "looks ugly").

## Appendix: IA defects in the current routes (most severe first)
D1. **Home mixes four schemes and three roles** (TeacherHome.ts view): live state, supervisor tool, self-analytics, onboarding, scenarios, classes, archive on one scroll. Breaks one-home-one-primary-task and progressive disclosure: a teacher on a phone scrolls past supervision and "my activity" before the scenarios. Fix: §5 home.
D2. **"My scenarios" has three homes and one is locked**: home shelf (6 + "show all"), /teach/library/mine (MineList, inside the library gate), and the start-screen picker. A non-approved teacher has no full scenario page; an approved one sees two lists with different order and controls. Fix: /teach/scenarios for everyone.
D3. **Synonyms**: תרחיש / מסע / topic; שיעור / game / session; סיכום השיעור / דוח השיעור; תלמידים / שחקנים; שיעור פעיל / רץ עכשיו / פעיל; ארכיון השיעורים והפתרונות / שיעורים קודמים / שיעורים; ספריית תרחישים / הספרייה; "שיעור חדש" means start while "תרחיש חדש" means create. Fix: §3.
D4. **A finished lesson has two destinations with different names**: archive rows offer "דוח השיעור" and "המסע והפתרונות"; the class page opens only the report. Fix: report is the one home; replay is a link inside it.
D5. **Student progress has no address**: a roster drawer in TeacherClass.ts, not linkable, not reachable from a lesson summary; supervisors get /supervise/student/:id for the same object. Fix: /teach/class/:id/student/:memberId.
D6. **Archive findability**: a collapsed panel at the bottom of home, no URL, search only "מתוך השיעורים שנטענו". Fix: /teach/lessons with server search.
D7. **Wrong back paths**: TopicEditor save and back always → /teach, even when opened from a library copy or MineList; TopicWizard back → /teach. Fix: §5 back paths.
D8. **Mixed scheme in the library switch**: "הספרייה | התרחישים שלי | ניהול" puts an admin tool beside two content lists. Fix: admin moves to the menu.
D9. **Class page is one long scroll** (code, settings, summary, graphs toggle, start, roster, lessons) with no local navigation; "גרפים" names a widget, not a destination. Fix: three sections.
D10. **Menu is named after part of its content** ("שיעורים וכיתות") and lacks scenarios, past lessons and activity. Fix: §5 menu.
D11. **Hardcoded Hebrew** in TeacherHome.ts (archive, row buttons, show-all): untranslated in en/ar/es/de/nl. Fix: keys in §3.
D12. **Route segments disagree with labels**: /teach/topic, /teach/new, /teach/library/mine. Fix: §5 redirects; lesson segments deferred (Q3).
