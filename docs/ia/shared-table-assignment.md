# Shared Tables: חלוקה לשולחנות — IA spec

Status: agreed (redesign approved by Tal, 2026-11-10); implemented and live. Routes, host home and the "Room screen" label are superseded by [join-class-tables-merge.md](join-class-tables-merge.md) (agreed 2026-11-11).
Date: 2026-11-10
Supersedes: the 2026-11-05 version of this file (hub with five host sub-screens, separate topics and preferences screens).
Companions: [build map](../plans/features/tables-redesign-build.md), [design brief](../design/tables-design-brief.md), [system plan](../plans/features/shared-table-assignment.md).
Host: tables.wizcol.com (`apps/tables`, Mithril + SCSS). i18n prefix: `tableAssignment.` in `apps/tables/src/lib/locales/{he,en,ar}.ts`.

Unchanged from the earlier version and not repeated here: the embedded use from other WizCol apps ("back to…", identity adapters, event-core resolver) and the compatibility notes for legacy rooms / Agora / join-class. They stay valid; nothing in this redesign builds them.

## 1. Audiences

| Audience | One-line goal | Must never see |
|---|---|---|
| Host (מארח/ת), Google sign-in | Set up one guided page, open registration, check the tables, publish | Any person's position or choices; other hosts' assignments |
| Participant (משתתף/ת), full name only, own phone | Be done in about a minute and know where to sit | Other people's position or choices; a draft assignment; who else registered before publishing |
| The room (החדר), a projector driven by the host's signed-in browser | Join by QR code, later find a name at a table | Positions, choices, statistics |

## 2. Object model

| Object | Meaning | Relations | Lifecycle |
|---|---|---|---|
| Table assignment (`TableAssignment`) | One event's registration and seating; mode `ranked` (mix) or `direct` (sit where you like) | 1 host; many topics; many registrations; many runs | draft → registrationOpen → registrationClosed → published → ended. Forward only. Mode may change in draft only |
| Topic (`TableAssignmentTopic`) | What a table talks about | belongs to 1 assignment; 0..n tables | editable in draft; after opening only its title can be fixed (id, order and count are frozen) |
| Registration (נרשם/ת), stored as two records | A person in this assignment | 1 per browser identity (uid) and assignment | none → registered → answered → seated; cancelled (deleted) while registration is open |
| · Name card (`TableAssignmentRosterEntry`, collection `tableAssignmentRoster`) | Full name, registration time, "has ranked", direct-mode table | read by the host, by the owner, and by registered people once tables are public | written by callables only |
| · Private answers (`TableAssignmentParticipant`, collection `tableAssignmentParticipants`) | Choices (up to 3 topic ids) and position | read by the owner only; never by the host client | written by callables only |
| Registered count (`tableAssignmentCounters/{id}`) | How many registered | 1 per assignment; readable by anyone who can open the link | kept by the register / cancel callables |
| Table (`TableAssignmentRunTable`) | A numbered place for up to N people on one topic | 1 topic; members | proposed → published; direct mode: live |
| Run (`TableAssignmentRun`) | One computed seating with metrics | 1 assignment; 1 published at a time | computing → ready → published / superseded; a ready run goes stale when inputs change |
| Display settings (browser only) | Theme, high contrast, text size | per browser, all Tables screens | localStorage; reset returns to defaults |

Rules of the model:

- **Topic is not table.** People rank topics; they sit at a numbered table.
- **Position** is one axis 0–100. The participant answers on five stops stored as 0, 25, 50, 75, 100, or chooses "prefer not to answer", stored as no value. No answer is never the middle and nothing is preselected. Older answers from the slider (any 0–100 value) stay valid.
- **Strictness** is the balance tolerance shown as three choices: strict 0.15, balanced 0.30 (default), flexible 0.45. Any other stored number is shown as a custom value with no chip selected.
- **Return by full name** is a host setting, off by default. It only acts while registration is open.
- **Statement tree mapping:** unchanged. The assignment may point at `contextStatementId`; an imported topic keeps `sourceStatementId`. Registrations, answers and runs are operational records, not Statements.

## 3. Labels

One name per concept. Hebrew is the approved design copy; (?) marks Hebrew proposed here because the design has no text for it.

| Concept | EN label | HE label | i18n key | Route segment | Code type | Synonyms to retire |
|---|---|---|---|---|---|---|
| Product | Tables | שולחנות | `tableAssignment.app` | — | — | rooms |
| One event's process | Table assignment | חלוקה לשולחנות | `tableAssignment.session` | `sessions` | `TableAssignment` | session, סשן |
| Its title | Gathering name | שם המפגש | `tableAssignment.setup.name` | — | `title` | "מפגש" anywhere except as the thing the title names |
| Host | Host | מארח/ת | `tableAssignment.host` | `host` | `hostUid` | מנהל, מנחה |
| Topic | Topic | נושא | `tableAssignment.topic` | — | `TableAssignmentTopic` | table (as content) |
| Table | Table | שולחן | `tableAssignment.table` | — | `TableAssignmentRunTable` | group, room |
| The whole crowd | The room | החדר | `tableAssignment.room` | — | `metrics.population` | crowd, קהל, population (in UI) |
| Registered people | Registered participants | נרשמים | `tableAssignment.participants` | `participants` | `TableAssignmentRosterEntry[]` | — |
| Mode: mix | Mix | להתערבב | `tableAssignment.mode.ranked` | — | `mode: 'ranked'` | "דירוג נושאים" as a mode name |
| Mode: free | Sit where you like | לשבת איפה שירצו | `tableAssignment.mode.direct` | — | `mode: 'direct'` | "בחירת שולחן" as a mode name |
| Participant step 2 (mix) | Rank topics | דירוג נושאים | `tableAssignment.rank` | `preferences` (kept for old links) | `preferences` | vote, support |
| Participant step 2 (free) | Choose a table | בחירת שולחן | `tableAssignment.chooseTable` | `preferences` | `chosenTableIndex` | — |
| A person's ranked topics | My choices | הבחירות שלי | `tableAssignment.choices` | — | `preferences` | "ההעדפות שלי", preferences (in UI text) |
| Position | My position | העמדה שלי | `tableAssignment.position` | `position` | `position` | score, side |
| No answer on position | Prefer not to answer | מעדיפים לא לענות | `tableAssignment.position.unknown` | — | `position` absent | "לא צוין", neutral, middle |
| Strictness | How alike each table is to the room | כמה חשוב שכל שולחן יהיה דומה לחדר? | `tableAssignment.strictness` (+ `.strict` קפדני, `.balanced` מאוזן, `.flexible` גמיש) | — | `balanceTolerance` | tolerance, סטייה (outside the expert line) |
| Expected people | Expected people | כמה אנשים צפויים? | `tableAssignment.setup.expected` | — | `settings.expectedParticipants` | — |
| Return by name | Return by full name | חזרה לפי שם מלא | `tableAssignment.returnByName` | — | `settings.allowReturnByName` | login, account |
| Host correction after opening | Fix details | תיקון פרטים | `tableAssignment.fixDetails` | — (modal) | `tablesFixDetails` | edit topics, settings |
| Participant correction | Edit my details | עריכת הפרטים | `tableAssignment.editDetails` | `name` → `preferences` → `position` | — | — |
| Leaving | Cancel participation | ביטול השתתפות | `tableAssignment.cancelParticipation` | — (modal) | `tablesCancelRegistration` | unregister, delete |
| Waiting | Saved, waiting for tables | נשמר, מחכים לשולחנות | `tableAssignment.waiting` | — | stage `waiting` | "ממתינים לשיבוץ" |
| Unpublished result | Assignment preview | תצוגה מקדימה של השיבוץ | `tableAssignment.preview` | `preview` | run `ready` | results |
| Final result | Published assignment | השיבוץ שפורסם | `tableAssignment.published` | `assignment` | run `published` | — |
| Personal result | My table | השולחן שלי | `tableAssignment.myTable` | `my-table` | — | group number |
| Tablemates | Sitting with you | יושבים איתך | `tableAssignment.myTable.mates` | — | roster of my table | — |
| Table closeness | Close to the room | קרוב לחדר / קרוב מאוד לחדר / אין מספיק תשובות / רחוק מהחדר (?) | `tableAssignment.closeness.*` | — | `stats.deviation` | deviation (outside the full data) |
| Second layer of preview | Full data | הנתונים המלאים | `tableAssignment.preview.fullData` | — | `metrics` | statistics, composition |
| Projector view | Room screen | מסך החדר (button: הצגה על המסך) | `tableAssignment.roomScreen` | `screen` | — | projector mode, rooms |
| Who sits where | Who sits where | מי יושב איפה | `tableAssignment.roomScreen.seats` | `screen` (same route) | — | — |
| Display settings | Accessibility | נגישות | `tableAssignment.a11y.*` | — | `A11yPrefs` | — |

Retired keys (delete from all three locale files): `tableAssignment.screen.topics`, `.screen.topic`, `.screen.settings`, `.screen.hostHome`, `.screen.participantHome`, `.screen.preferences`, `.preferences`, `.back.toHome`, the per-person position counts under `tableAssignment.participants.*`, and the old slider strings.

## 4. Hierarchy (per role)

Role: Host. Home: My table assignments. One assignment has one screen at a time, chosen by its status.

```text
0 My table assignments                      /host
1   New table assignment (setup)            /host/new            (becomes /host/sessions/:id once the draft exists)
1   Table assignment, by status             /host/sessions/:id
      draft               → Setup (one guided page)
      registrationOpen    → Registration open
      registrationClosed  → mix: goes to Assignment preview; free: Registration open, closed variant
      published / ended   → goes to Published assignment
2     Assignment preview                    /host/sessions/:id/preview
2     Published assignment                  /host/sessions/:id/assignment
2     Registered participants (names)       /host/sessions/:id/participants
2     Room screen (join, then who sits where) /host/sessions/:id/screen
      modal: Fix details (from Registration open, Preview, Published assignment)
```

Role: Participant. Home: the assignment link. The home shows the one thing that fits the person's state.

```text
0 The assignment link, by state             /sessions/:id
      not open | name (step 1) | "is this you?" modal | waiting | waiting, closed
      | cancelled | registration closed, not registered | ended
      published and registered → goes to My table
1   Step 2: Rank topics / Choose a table    /sessions/:id/preferences
1   Step 3: My position                     /sessions/:id/position
1   Step 1 again, when editing              /sessions/:id/name
1   My table                                /sessions/:id/my-table
      modal: Cancel participation (from waiting)
```

Role: The room. One screen, opened by the host: `/host/sessions/:id/screen`. Before publishing it is the join page; after publishing it is who sits where.

Accessibility is a floating control on every screen of every role; it has no route.

## 5. Navigation model

- **Global:** logo, gathering name, language, accessibility. No menu. A participant is never sent to host screens.
- **Local, participant:** the three steps run forward with one primary button each. Browser back and an in-page back go one step back and keep unsaved choices. The step count is honest: 3 with a position question, 2 without, 2 in free mode.
- **Local, host:** every stage screen goes back to My table assignments. Depth-2 screens go back to the stage screen. Setup has no sub-screens and no save button; it autosaves and says so.
- **Contextual:** "Fix details" and "Show on screen" appear on the stage screens after registration opens. The registered count opens the names list.
- **Modals** (no URL, focus-trapped, Escape and the background close them): Fix details, Cancel participation, Is this you?. The accessibility panel is a popover.
- **Deep links:** `/sessions/:id` for participants (QR code), `/host/sessions/:id` for the host, `/host/sessions/:id/screen` for the projector. Permission is checked on every entry.
- **Old links keep working** (redirect, never 404):

| Old route | Now |
|---|---|
| `/host/sessions/:id/topics`, `/host/sessions/:id/settings` | → `/host/sessions/:id` (Setup in draft; otherwise the stage screen) |
| `/host/sessions/:id/participants`, `/preview`, `/assignment` | kept |
| `/sessions/:id/topics`, `/sessions/:id/topics/:topicId` | → `/sessions/:id` (the home sends a registered person on to step 2) |
| `/sessions/:id/preferences`, `/sessions/:id/my-table` | kept |
| step routes opened without a registration, or after closing | → `/sessions/:id` |

## 6. Task flows

Role: Participant, task: register (mix, with a position question): 3 steps (was 5).
1. Link — type full name, "בואו נתחיל". If return by name is on and the exact name exists: "is this you?" (yes: empty form, the new answers replace the old; no: a new registration).
2. Rank topics — tap up to three; picked topics rise to the top in order; drag handle or arrow keys reorder; "המשך". The note about sitting outside one's choices is on this screen.
3. My position — tap one of five stops or "מעדיפים לא לענות"; "שמירה" → Waiting.

Role: Participant, task: change or cancel before closing: 2 steps.
1. Waiting — "עריכת הפרטים" walks the same steps prefilled with the person's own answers; or "ביטול השתתפות".
2. Confirm modal → Cancelled screen with "הרשמה מחדש". After closing: neither action; the screen says to talk to the host.

Role: Participant, task: find my table: 1 step.
1. Link — My table: number, topic, the pill (which choice, or outside my choices with the thank-you note), tablemates' names.

Role: Host, task: set up and open registration: 3 steps (was 5).
1. My table assignments — "חלוקה חדשה".
2. Setup — name, mix or sit, topics (one by one, or a pasted list split on comma, Arabic comma or new line), position question, strictness, return by name, summary with expected people and seats per table. Autosaved.
3. Setup — "פתיחת ההרשמה" → Registration open (count, link, QR, show on screen).

Role: Host, task: publish (mix): 3 steps (was 4).
1. Registration open — "סגירה וחלוקה לשולחנות" (closes, computes, opens the preview).
2. Assignment preview — verdict first, then how many got each choice, then tables with names, closeness pill and room-versus-table band; full data collapsed. "חישוב מחדש" if wanted.
3. Assignment preview — "פרסום השיבוץ" → Published assignment. A stale preview cannot be published.

Role: Host, task: fix a typo after opening: 2 steps.
1. Any stage screen — "תיקון פרטים" opens the modal over the blurred screen.
2. Modal — change the gathering name or topic titles, "שמירה". Choices are untouched; no recompute is needed.

Role: Host, task: show the room: 1 step.
1. Registration open or Published assignment — "הצגה על המסך" → Room screen.

Free mode differs in two places: step 2 is Choose a table and the seat is held at once (no step 3, no waiting, My table straight away); the host closes registration and there is no preview or publish.

## 7. Screen inventory

Design file in brackets. "Kept" means the screen exists in code and has no approved design; it moves into the new frame as it is.

| Screen | Route | Single job | Empty | Loading | Error | No permission | Done |
|---|---|---|---|---|---|---|---|
| My table assignments (kept) | `/host` | Find or start an assignment | "start your first" | list skeleton | retry | Google sign-in gate | list by status |
| Setup [HostSetup] | `/host/new`, `/host/sessions/:id` in draft | Describe the gathering and open registration | name empty: nothing is created yet; no topics: open is disabled with the reason | loading the draft | "not saved, retrying" next to the autosave mark; fields keep their text | not the host: back to the list | "פתיחת ההרשמה" |
| Registration open [HostLive] | `/host/sessions/:id` while open | Share the link and watch the count | 0 registered: link and QR lead | count placeholder | retry; link still shown | back to the list | "סגירה וחלוקה לשולחנות" (free mode: close registration) |
| Fix details [HostEdit] | modal | Correct names without touching choices | — | fields disabled while saving | message in the modal; text kept | — | closes; new names everywhere |
| Assignment preview [HostPreview] | `…/preview` | Decide whether to publish | nobody registered; not computed yet: compute | computing | reason and fix; no publish | back to the list | verdict, choices, tables; stale preview blocks publish |
| Published assignment (kept) | `…/assignment` | See and print the live tables | not published yet | loading one run | retry | back to the list | tables, print, show on screen, recompute |
| Registered participants (kept, names only) | `…/participants` | Check who registered | link to share | loading names | retry | back to the list | names with search |
| Room screen [Room, RoomSeats] | `…/screen` | Before: join by QR. After: who sits where | draft: "registration not open yet" | QR placeholder | retry | host sign-in | QR and count; then tables with names |
| Link home: not open [NotOpen] | `/sessions/:id` | Reassure an early visitor | — | identity and state | retry | — | flips by itself when registration opens |
| Link home: name [Main] | `/sessions/:id` | Start with a full name | — | button busy | message under the field; name kept | — | → step 2 |
| Is this you? [ReturnByName] | modal | Tell a returning person from a namesake | — | buttons busy | message in the modal | — | yes: empty form; no: new registration |
| Rank topics [Rank] | `…/preferences` | Pick and order up to three topics | no topics: message, back | topic list | retry; picks kept locally | not registered or closed: home | "המשך" (or "שמירה" when it is the last step) |
| Choose a table (kept) | `…/preferences` in free mode | Take a free seat | no tables | seats | table full: back to the list of free tables | closed: home | My table |
| My position [Position] | `…/position` | Answer or decline | no position question: step is skipped | — | save failed: answers kept, retry | not registered or closed: home | → Waiting |
| Waiting [Waiting, WaitingClosed] | `/sessions/:id` | Know it is saved and what happens next | registered without answers: prompt to finish the steps | own details | retry | — | open: edit and cancel; closed: neither, "talk to the host" |
| Cancel participation [CancelConfirm] | modal | Confirm leaving | — | buttons busy | message; still registered | closed: action absent | → Cancelled |
| Cancelled [Cancelled] | `/sessions/:id` | Confirm, offer to return | — | — | — | registration closed: no "register again" | "הרשמה מחדש" → name |
| My table [MyTable, MyTableOutside] | `…/my-table` | Know where to sit | published but not seated (registered late): "talk to the host" | one run | retry; never a draft | not registered: home | number, topic, pill, tablemates |
| Closed, not registered; Ended (kept) | `/sessions/:id` | Say why nothing can be done | — | — | — | — | plain message |
| Accessibility [Accessibility] | popover, all screens | Theme, high contrast, text size 87.5–150%, reset | — | — | storage blocked: works for this visit only | — | applies at once |

## 8. Findability

- Rank topics: one list; picked topics on top. Topics that have an explanation show it on demand inside the row (the design has titles only; see open question 3). With more than about 12 topics a title filter appears.
- Registered participants and Published assignment: search by name; tables sorted by number.
- Room screen, who sits where: grouped by table number. For more tables than fit one screen the view pages by itself; the host's own device has the name search. Paging rhythm is a UX decision.
- My table assignments: active first, ended after; search by name of the gathering.
- A returning participant lands on their own state; they never search a list.

## 9. Open questions and assumptions

1. **"Talk to the host" has nothing behind it.** After closing, the host has no way to remove or change a person. Recommended: a host action "remove from the list" on Registered participants (preview then goes stale and is recomputed). Needs Tal's yes; the build map lists it as optional.
2. **Another device after publishing.** Return by name acts only while registration is open, so a person who switches phone after publishing finds their table on the Room screen, not in My table. Assumed acceptable.
3. **Topic explanations** (up to 2,000 characters, and imported topics have them) and **most tables per topic** have no place in the approved Setup and Rank designs. Assumption: data is kept and honoured; explanations show on demand in Rank; neither is editable in Setup for now.
4. **Free mode** has no approved participant or host design. Assumption: Choose a table and the closed variant of Registration open keep today's content in the new frame.
5. **Preview verdicts other than "good"** have no approved copy. Proposed states: good; "כדאי לבדוק" (?) when a table is further from the room than the limit; "לפי הבחירות בלבד" (?) when fewer than three people answered the position question. A fifth count, "לא דירגו" (?), appears when someone registered without ranking.
6. **Draft link.** For the not-open screen to show the gathering name and update by itself, a draft's title becomes readable to anyone holding the link. Topics stay hidden until opening.
7. **Return by name** treats names as equal after trimming, collapsing spaces and Unicode normalisation. With two or more existing registrations under that name the question is not asked and a new registration is created.
8. The projector browser must be signed in as the host. A public room link is not built.

## 10. Handoff to UX

Fixed by this spec: the objects and the two-record registration; one stage screen per status for the host; the three participant steps and their order; the route table and redirects; the label table; which actions are modals; the states in section 7; the privacy boundary (the host client reads names and counts only).

Yours to decide: the look of explanations inside a Rank row; the two missing verdicts and the "far from the room" pill; the free-mode screens; paging on the Room screen; how the autosave mark reports a failure; the wording of the intermediate position stops (see the build map: they cannot be derived from the host's free text); tap area of the stops (the drawn dot is under 48px, the target must not be).
