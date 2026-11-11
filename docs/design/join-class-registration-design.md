# join-class: registration before a lesson or gathering (use case 1) — design

Status: proposed; reconciled on 2026-11-11 with Tal's decisions of that day (section 13). Not implemented.
Designs against: [docs/ia/join-class-tables-merge.md](../ia/join-class-tables-merge.md) (agreed and reconciled 2026-11-11). Objects, labels, routes, flows and the decisions (its section 9) come from there and are not repeated.
Keeps: the participant steps, privacy rules and Hebrew copy of [shared-table-assignment.md](../ia/shared-table-assignment.md) and [tables-design-brief.md](tables-design-brief.md), already built in `apps/tables`.
Look: the Class app (`apps/join-class/src/styles`, [join-class-style-brief.md](join-class-style-brief.md)). Mithril, global BEM SCSS, Class tokens only.

Scope: every screen where registration exists.

- Shape A, registration only: all of it.
- Shape B, registration then discussion: up to the moment the host presses "התחלת הדיון".
- Not designed here: the table-paced discussion (use case 2). Section 12 lists what this design leaves ready for it.

This design raised eleven points about the IA spec and five questions for Tal. All were settled on 2026-11-11 and the spec now says the same as this file; section 13 lists the outcomes.

---

## 1. What changes for each person, in one paragraph each

**Host.** One home at `/t`. A third group, "חלוקות לשולחנות", sits under the lesson plans. The five Tables host screens move under `/t/tables/:id` and look like the Class teacher screens: the same header, back bar, cards and sticky bottom bar. Two small doors connect the two halves: "הוספת דיון" on an assignment, "הרשמה מראש" on a lesson.

**Participant.** The registration link opens inside Class, in the same phone frame as a lesson, with the same header, step meter and bottom button. The steps and their words are the approved ones. Two things are new: "כבר נרשמתי" on the name screen, and My table that turns into the way into the live table.

**The room.** One projector. Its first two views are "join" and "who sits where"; in shape B the lesson's stages follow on the same screen.

---

## 2. Shared building blocks

Everything below exists in Class today unless marked NEW. Section 10 has the file-level list.

| Block | Used for | Notes |
|---|---|---|
| `.frame` (StudentFrame's SCSS) | every participant screen | Header: step name + "צעד 1 מתוך 3" + segment meter. Content column. One primary button pinned at the bottom (`.frame__action`). A thin NEW wrapper `RegistrationFrame` feeds it the registration steps; no new styles |
| `.teacher-home`, `.teacher-home__section-head`, `.teacher-home__row` | host home and lists | unchanged |
| `.back-bar` (TeacherBackBar) | every host screen under `/t/tables/:id` | parent = the console when attached, else the home |
| `.plan-card`, `.plan__section-title`, `.plan__help` | Setup's sections | same cards as "פרטי השיעור" |
| `.plan__bar` | the one primary action of each host stage screen | sticky at the bottom on phone and desktop, with the autosave mark (`.plan__save-mark`) |
| `.status-chip` + `.status-mark` | assignment status everywhere | text plus a shape; NEW modifiers `--draft`, `--published` if the existing marks do not cover them |
| `.qr-share` (QRShare) | link + QR + copy | replaces Tables' QrCode and CopyLink |
| `.modal` + ConfirmDialog | Is this you?, Cancel, Remove, Delete, Fix details | focus trap, Escape, background close |
| `.table-step` + `.table-chip` | My table (section 6) | `table-chip--none` already draws a name with no side mark |
| `.lesson-state` | participant notices with no action (not open, closed, ended) | mark + title + one body line |
| `.projector-step`, `.projector-instruction`, `.projector-code`, ProjectorControls | projector | unchanged |
| `.rank-list` (moved from Tables) | Rank topics | re-tokenised |
| `.position-stops` (moved from Tables) | My position | re-tokenised; poles use `--side-a` / `--side-b` |
| `.tables-stage` NEW | host stage screens: count, join card, discussion card | section 3 |
| `.tables-seats` NEW | projector "who sits where" and the host's published tables | section 5 |
| AccessibilityWidget | every screen | Tables' own tool is retired |

Layout constants, all from `_tokens.scss`: participant column `--max-width` (520px) with `--space-md` side padding at 360px; touch targets `--touch-target` (48px, above the 44px minimum); primary button 56px tall; spacing on `--space-*`; radius `--radius-*`; shadows `--shadow-xs` / `--shadow-sm` only; motion `--dur-quick` / `--dur-base`, transform and opacity only.

RTL: logical properties only. Every user-typed string (names, gathering name, topics) is wrapped in `bdi dir="auto"`. The link and the class code are `dir="ltr"`. The step meter fills from the inline start. Chevrons flip with direction. Numbers stay Western digits in all 7 languages.

---

## 3. Host screens

### 3.1 Home — `/t` (merged)

Purpose: find or start a plan, a lesson or an assignment.

Content in order (360px, one column):

1. Header: logo, account name, "יציאה" (unchanged).
2. `h1` "דף הבית" (was "מערכי השיעור שלי"). The back bar uses the same name for `/t`. "מערכי השיעור" is the name of the group of lesson plans only.
3. Group "פתוחים עכשיו" (lessons only) + button "+ שיעור עם כיתה".
4. Group "מערכי השיעור" + button "+ מערך שיעור חדש".
5. Group "חלוקות לשולחנות" + button "+ חלוקה חדשה".
6. Footer.

```text
360px                                   RTL: mirrored, title at the right
┌──────────────────────────────────────┐
│ [logo]            טל ירון   [יציאה]  │
│ דף הבית                              │
│ ▾ פתוחים עכשיו (2)   [+ שיעור עם כיתה]│
│ ┌──────────────────────────────────┐ │
│ │ ט׳2 · בריונות ברשת               │ │
│ │ ● שלב 3 מתוך 9                   │ │
│ │                       [ לשיעור ] │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ השכונה בעוד עשר שנים             │ │
│ │ ● ממתינים להתחלה                 │ │
│ │ הרשמה מראש · 42 נרשמו            │ │
│ │                       [ למפגש ]  │ │
│ └──────────────────────────────────┘ │
│ ▾ מערכי השיעור (4) [+ מערך שיעור חדש]│
│   …                                  │
│ ▾ חלוקות לשולחנות (3) [+ חלוקה חדשה] │
│ ┌──────────────────────────────────┐ │
│ │ השכונה בעוד עשר שנים             │ │
│ │ ● הרשמה פתוחה · 42 נרשמו         │ │
│ │ עם דיון                          │ │
│ │                      [ לחלוקה ]  │ │
│ └──────────────────────────────────┘ │
│ ▸ הסתיימו (5)                        │
└──────────────────────────────────────┘
```

How a group looks and collapses:

- The group head is `.teacher-home__section-head`: an `h2` that contains a button (`aria-expanded`, `aria-controls`), the count in brackets, and the group's "+" button at the inline end. The whole head row is 48px high. A chevron at the inline start points down when open and to the inline end when closed.
- Open by default: all three. The choice per group is remembered in the browser (try/catch around storage; without storage every group opens).
- A group shows at most 5 rows, then a quiet button "הצגת הכול ({{n}})". "מערכי השיעור" keeps its class filter and name search; "חלוקות לשולחנות" gets the same search field ("חיפוש לפי שם") from 6 rows up.
- "חלוקות לשולחנות" lists assignments whose registration is open first, then the other active ones (closed, published, draft). Ended ones sit under a second, closed disclosure "הסתיימו ({{n}})" inside the group.
- A group with nothing in it moves below the groups that have rows (the spec's rule) and shrinks to its head plus one line: "אין עכשיו שיעורים פתוחים" / "עוד אין חלוקות לשולחנות". Its "+" button stays.
- An assignment appears only in its own group, also while its registration is open: "פתוחים עכשיו" is for lessons. A lesson that has an assignment shows it as a second line on the lesson's row ("הרשמה מראש · 42 נרשמו"), and the assignment's row shows "עם דיון".

An assignment row: gathering name (`h3`, `bdi`), status chip, the count ("42 נרשמו"; after publishing "6 שולחנות · 3 מחכים לשולחן"), "עם דיון" when attached, and one button "לחלוקה". The button label does not change with status; the chip says the status.

Desktop (from 768px): the body is one centred column, max 880px; rows become one line each: name, chip and counts, action at the inline end. No second column: three groups side by side would hide the order "open now first".

States:

| State | What shows |
|---|---|
| Loading | `.teacher-home__skeleton` (today's) |
| Empty (no plan, no assignment) | the "how it works" line, then two cards of equal weight, stacked on phone, side by side on desktop: "שיעור עם כיתה" (opens the plan name form, as today) and "הרשמה לשולחנות" → `/t/tables/new`. Each card has one sentence and one button. No form is open in advance |
| Error | today's row error with "ניסיון נוסף"; the other groups still show |
| Assignments failed to load, plans loaded | the group shows the error line inside itself |

Primary action: none is global; each group head carries its own "+". "+ מערך שיעור חדש" stays the only `btn--primary` in the heads; the other two are `btn--secondary`, so the page has one strongest button.

### 3.2 Setup — `/t/tables/new`, `/t/tables/:id` in draft (kept, restyled)

Purpose: describe the event and open registration. One guided page, autosaved.

Content in order, each a `.plan-card` under a `.plan__section-title`:

1. Back bar: "דף הבית", or the lesson's name when attached.
2. "איך קוראים למפגש?" / "איך קוראים לשיעור?" — name field. Nothing is created until a name is typed (kept).
3. **"מי המשתתפים?"** — the audience choice (section 7). Two large choice buttons, `.class-form__choice` look. Hidden when the assignment was opened from a lesson: it takes the lesson's.
4. "להתערבב" / "לשבת איפה שירצו" (kept).
5. Topics: one by one or a pasted list (kept).
6. Position question with two poles (kept).
7. "כמה חשוב שכל שולחן יהיה דומה לחדר?" — three choices (kept).
8. Summary "מה יקרה במפגש" / "מה יקרה בשיעור": expected people, **"מקומות בשולחן", default 7**, the host can change it (today's range, 3–20), and the live sentence ("42 אנשים, עד 7 בכל שולחן · בערך 6 שולחנות").
9. Sticky bar: autosave mark at the inline start, "פתיחת ההרשמה" (`btn--primary`) at the inline end.

Removed from Setup: the "חזרה לפי שם מלא" switch and its warning. Returning by full name is not a host setting: it always works, before and after publishing, and the host is shown nothing about it (decision 4). The stored field `settings.allowReturnByName` is no longer read or written.

Desktop: the cards in one column, max 720px; the summary card becomes sticky at the inline end from 1024px so the "what will happen" sentence stays in view while typing topics.

States: loading the draft (card skeletons); autosave failed ("לא נשמר. הטקסט נשאר כאן, וננסה שוב." next to the mark, fields keep their text); cannot open yet — the button is disabled and one line above it gives the first missing thing ("כדי לפתוח צריך לפחות נושא אחד", "בחרו מי המשתתפים"); not the host → home.

Seats and a discussion: attaching a lesson changes nothing in this field. There is no cap at 8, no notice and no blocked state (decision 6). A lesson with no registration keeps its own default of 6 and today's behaviour.

### 3.3 Registration open — `/t/tables/:id` while open (kept, restyled, plus the discussion card)

Purpose: share the link and watch the count.

Content in order:

1. Back bar. Status chip "הרשמה פתוחה" and the quiet button "תיקון פרטים" on one row.
2. The count: a very large number, "כבר נרשמו" under it, the whole block a link to the names; "עד עכשיו זה בערך 6 שולחנות".
3. Join card (`.qr-share`): QR, the link (`dir="ltr"`), "העתקת הקישור", "הצגה במקרן". In shape B the lesson's code sits under the link: "אפשר להיכנס גם עם הקוד 482 913".
4. Discussion card (section 3.8).
5. Sticky bar: "סגירה וחלוקה לשולחנות" (`btn--primary`); the line "אף אחד לא יראה את השולחנות לפני שתבדקו ותפרסמו." above the button.

Desktop: count and join card side by side (count at the inline start), discussion card under both, the bar across.

States: 0 registered (the join card leads, the count shows 0 with "שולחים את הקישור"); count loading ("–"); error (retry; the link stays); free mode (button "סגירת ההרשמה", live tables under the join card, as today); closed in free mode (chip "הרשמה סגורה", no join card, button "סיום החלוקה").

### 3.4 Assignment preview — `/t/tables/:id/preview` (kept, restyled)

Purpose: decide whether to publish. Content and verdict copy are the approved ones: the "not public yet" line, the verdict, how many got each choice, tables with names and the closeness mark, "הנתונים המלאים" collapsed.

Changes: tables are drawn with `.tables-seats` cards (number, topic, names; section 5), not Tables' `.table-card`. Sticky bar: "פרסום השיבוץ" (`btn--primary`) and "חישוב מחדש" (`btn--secondary`). A stale preview disables publish and shows "הנתונים השתנו מאז החישוב" above the bar. No positions, no choices per person, anywhere.

Phone: tables one per row. Desktop: 2 columns from 768px, 3 from 1200px.

States: nobody registered; computing (the button shows "מחשבים…", cards are skeletons); error with the reason; stale; the three verdicts (good, not balanced, by choices only).

### 3.5 Published assignment — `/t/tables/:id/assignment` (kept, restyled)

Purpose: see the tables, seat latecomers.

Content in order:

1. Back bar, chip "השיבוץ פורסם", "תיקון פרטים".
2. Latecomer strip, only when someone waits: "3 מחכים לשולחן" + "חישוב מחדש" (`btn--secondary`), and the approved sentence that everyone seated stays in place. The strip uses `--sun-soft` with `--ink` text and a clock mark, so it is not colour alone.
3. Search by name.
4. The tables (`.tables-seats`): number, topic, names.
5. Discussion card (section 3.8).
6. Sticky bar: "הצגה במקרן" (`btn--primary`), "הדפסה", and "סיום החלוקה" as the quiet third. Attached to a lesson, "סיום החלוקה" is absent: ending the lesson ends the assignment (spec, shape B).

Once the lesson has started, the screen reads the lesson's tables and adds one line under the chip: "הדיון התחיל. מי שעובר שולחן מופיע כאן." (use case 2 owns moving people).

States: not published yet (→ preview); loading one run; error; no latecomers (no strip); ended (read only, chip "הסתיים", no bar actions except print).

### 3.6 Registered participants — `/t/tables/:id/participants` (kept, restyled)

Purpose: check names, remove a person. A `.teacher-home__list` of names with search; each row: the name, "עדיין לא משובץ" when a latecomer waits, and "הסרה מהרשימה" (48px, `aria-label` "הסרת {{name}} מהרשימה"). The privacy line stays at the top: "כאן מוצגים רק שמות וספירות. עמדות ובחירות של נרשמים לא מוצגות."

Removed: the tag "המשיך בשם" next to a name. Nothing marks a return by name for the host (decision 4).

States: empty ("עדיין אין נרשמים. שולחים את הקישור." + the copy-link button); loading; error; search with no result.

### 3.7 Modals (kept)

Fix details, Remove from the list, Delete, and the new Remove the discussion (section 3.8): Class `.modal`, the approved copy, one primary and one quiet button each, the destructive one styled with `--danger` and worded as the action ("כן, להסיר", "כן, למחוק הכול"). On phone the modal is a bottom sheet (`.modal` at full width, `--radius-lg` on the top corners); on desktop a centred dialog, max 480px.

### 3.8 Where "הוספת דיון" and "הרשמה מראש" sit

**"הוספת דיון" — on the assignment.** A card, `.tables-stage__discussion`, on every stage screen after Setup (Registration open, Preview, Published), always in the same place: the last thing above the sticky bar. On Setup it is one quiet line at the end of the summary card ("יהיה גם דיון בשולחנות? אפשר להוסיף אחרי פתיחת ההרשמה."), because the primary job there is opening registration.

| State of the card | Content |
|---|---|
| No discussion | Title "יהיה גם דיון בשולחנות?" · one line "אחרי שכולם יושבים, כל שולחן מדבר, כותב הצעות ומצביע בטלפון." · button "הוספת דיון" (`btn--secondary`) → `/t/tables/:id/discussion` |
| Attached, discussion not started | Title "הדיון: {{game name}}" · the lesson's status chip · button "לשיעור" / "למפגש" (`btn--secondary`) · quiet button "הסרת הדיון" (`btn--tertiary`) |
| Attached, discussion started or ended | The same, without "הסרת הדיון" |

The number of seats per table never changes the card: there is no blocked state.

**The screen "הוספת דיון" — `/t/tables/:id/discussion`** (the spec's step 2; its own route so the game list has room on a phone, back works, and a reload keeps the place). Back bar: the assignment's name. One `.plan-card` per question, in order:

1. "באיזה משחק?" — the LessonPicker list (plans, then their games).
2. School only: "עם איזו כיתה?" (ClassForm).
3. A place for "מי קובע את הקצב?" — drawn only when use case 2 ships; until then the pace is "כולם יחד".
4. Sticky bar: "הוספת הדיון" (`btn--primary`), "ביטול" (back to the assignment).

The audience is not asked: the lesson takes the assignment's (section 7).

| State | What shows |
|---|---|
| Loading | card skeletons |
| No game exists yet | "עוד אין משחק עם שאלות. מכינים אחד במערך שיעור, ואז חוזרים לכאן." · link "+ מערך שיעור חדש". The assignment is already saved |
| Saving / failed | button busy; `role="alert"` line with retry, choices kept |
| Already attached | goes to the assignment's stage screen |
| Not the host | the host sign-in (kept) |
| Done | the lesson's console at "waiting" (spec flow) |

**"הסרת הדיון".** Offered on the attached card until the discussion starts. It opens a confirm: "להסיר את הדיון מהחלוקה?" · "החלוקה והנרשמים נשארים כמו שהם. הדיון נשאר אצלכם בדף הבית, בלי הרשמה מראש." · "כן, להסיר" · "לא, להשאיר". After it the card is back at "No discussion", the console strip is gone from the lesson, and the lesson is an ordinary lesson without registration. A failed request keeps the dialog open with the message.

**"הרשמה מראש" — on the lesson.**

- **Console** (`/t/:lessonId`), room step "waiting", no assignment yet: one row at the end of the join panel (`.console__qr`, under the QR and the code): the line "רוצים שיירשמו ויקבלו שולחן לפני השיעור?" and the button "הרשמה מראש" (`btn--tertiary`). It opens `/t/tables/new` already tied to this lesson (audience and name taken from the lesson). It is offered only while the room is at "waiting"; after that seating belongs to the lesson.
- **Console, assignment exists:** the row is replaced by a strip directly under the console bar, `.console__assignment`, a link to `/t/tables/:id`: "הרשמה מראש · הרשמה פתוחה · 42 נרשמו". After publishing: "הרשמה מראש · השיבוץ פורסם · 6 שולחנות", and "3 מחכים לשולחן" when latecomers wait. The strip stays for the whole lesson; it is the console's one entry to the assignment and where use case 2 will find latecomers.
- **Console, primary button in shape B at "waiting":** "התחלת הדיון" instead of today's "פתיחת השלב הבא". Before the assignment is published it is disabled, with the reason and the way out on one line above it: "קודם מפרסמים את השיבוץ" + link "לחלוקה". In "לשבת איפה שירצו" there is no publishing: the button is enabled once registration is closed, and until then the line reads "קודם סוגרים את ההרשמה" (decision 15). The join panel's QR is the registration link; the code works too (the code box sends a person with no seat to registration).
- **Plan** (`/t/plans/:planId`, the lesson rows under a game) and **home** ("פתוחים עכשיו"): no button. The lesson's row gains the second line "הרשמה מראש · {{status}} · {{count}}". Creating stays in one place, the console.
- **Questions of this lesson** (`/t/:lessonId/plan`): nothing about registration. The audience choice lives in "פרטי השיעור" (section 7).

Phone: the console strip is one line that wraps to two; 48px high minimum; the whole strip is the link. Desktop: the strip sits at the inline start of the row under the bar, the step rail keeps its place.

---

## 4. Participant screens

All in `RegistrationFrame` (`.frame`). Header: the gathering or lesson name as the status line, the step name as the stage heading, "צעד 1 מתוך 3" with the meter on the three step screens only. Language and accessibility on every screen. No menu.

### 4.1 Front door and code — `/`, `/c/:code` (kept, one new branch)

A lesson with an assignment: a person with no seat goes to `/tables/:id`; a seated person goes to `/m/:lessonId`. No new screen. While the branch is being decided the code box shows its usual busy state; a wrong code keeps today's message.

### 4.2 Link home — `/tables/:id`, one state at a time

| State | When | Content in order | Primary action |
|---|---|---|---|
| Loading | identity and assignment being read | frame with a skeleton title and button | — |
| Error | read failed | "בעיית רשת. אפשר לנסות שוב." | "ניסיון נוסף" |
| Not open yet | draft | `.lesson-state`: gathering name, "ההרשמה עוד לא נפתחה", "תודה שהקדמתם. {המארח/המורה} יפתח את ההרשמה בקרוב.", the keep-open line. Flips by itself | none |
| Name (step 1) | open, or published (latecomer). "כבר נרשמתי" shows in both | count pill ("42 כבר כאן"), gathering name as the hero title, the one-sentence intro, field "השם המלא שלך" with the hint "בלי סיסמה ובלי חשבון.", then the button, then "שלושה צעדים קצרים, בערך דקה", then the quiet button **"כבר נרשמתי"** | "בואו נתחיל" |
| Already registered | after "כבר נרשמתי" | section 4.3 | "מציאת ההרשמה שלי" |
| Is this you? | the typed name exists once | modal, section 4.3 | "כן, זה אני" |
| Waiting | registered, open | "נשמר. תודה, {{name}}", the lead line, "הפרטים שלכם" card, the "מה קורה עכשיו" steps, then "עריכת הפרטים" and "ביטול השתתפות" as quiet buttons | none (the person is done) |
| Waiting, unfinished | registered, steps not finished | "כמעט סיימנו, {{name}}" + what is left | "לדירוג הנושאים" / "לבחירת שולחן" |
| Waiting, closed | registered, registration closed | as Waiting, the second step ticked, no edit, no cancel, the line "ההרשמה נסגרה, ולכן אי אפשר לשנות פרטים. כדי לבטל השתתפות, כדאי לדבר עם {המארח/המורה}." | none |
| Waiting for a table (latecomer) | registered after publishing, not seated | title "נרשמתם. מחכים לשולחן", body `waiting.late.note`: "השולחנות פורסמו לפני שנרשמתם. {המארח/המורה} ישבץ אתכם, והשולחן שלכם יופיע בדף הזה. אפשר לסגור אותו ולחזור בקישור.", the clock mark. Moves to My table by itself | none |
| Cancelled | the person cancelled | "ההשתתפות בוטלה" + the approved body | "הרשמה מחדש" while registration accepts people; otherwise none |
| Removed | the registration is gone from this browser | "ההרשמה שלכם כבר לא כאן" + "ההרשמה המשיכה בטלפון אחר לפי השם המלא, או ש{המארח/המורה} הסיר אותה." Now the only wording, since returning by name is always on | "כבר נרשמתי" (brings it back here), and the quiet "הרשמה מחדש" |
| Closed, not registered | closed and not yet published | `.lesson-state`: "ההרשמה נסגרה." + "השולחנות יתפרסמו בקרוב. אחרי הפרסום אפשר יהיה להירשם כאן ולקבל שולחן." Flips to Name when published | none |
| Ended | assignment ended | `.lesson-state`: "החלוקה הסתיימה." | none |
| Published and seated | — | goes to My table | — |

Layout at 360px for the Name state: the content is centred vertically in the space above the button; the field is 56px high, 18px text (no zoom on iOS); the primary button is pinned at the bottom with the steps hint under it; "כבר נרשמתי" is the last item, a `btn--tertiary` 48px high, full width, separated from the hint by `--space-lg` so a thumb does not hit it by mistake. Desktop: the same column, centred, max 520px; nothing is added.

### 4.3 "כבר נרשמתי": returning on another phone, before and after publishing

One path, the same before and after publishing, with no limit on how many times.

Two ways in, one outcome:

- The person presses **"כבר נרשמתי"**. The name screen changes in place (no new route): title "נרשמתם כבר בטלפון אחר?", field "השם המלא, בדיוק כמו בהרשמה", primary "מציאת ההרשמה שלי", quiet "חזרה להרשמה רגילה".
- The person just types a name that already exists and presses "בואו נתחיל". The server answers "this name exists" and the same modal opens (today's behaviour, now always on and also after publishing).

| What the server finds | What the person sees | Then |
|---|---|---|
| One registration with this name | Modal "כבר נרשם מישהו בשם {{name}}. זה אתם?" · body by phase (below) · "כן, זה אני" · "לא, אני מישהו אחר" | Yes → the row below. No → the normal name form with the name kept; a second registration under the same name |
| Yes, registration open | — | Waiting. The details card shows no choices: "הבחירות שלכם שמורות. הן לא מוצגות בטלפון הזה, כדי לשמור על הפרטיות." The topics and the position are not asked again. Quiet button "לענות מחדש" walks the steps empty for anyone who wants to (decision 10) |
| Yes, closed and not published | — | Waiting, closed |
| Yes, published and seated | — | My table |
| Yes, published and not seated | — | Waiting for a table |
| No registration with this name | Under the field, a neutral `notice` (not an error colour, `role="status"`): "לא מצאנו הרשמה בשם הזה. בדקו שהשם כתוב בדיוק כמו בהרשמה." The field keeps the text and the focus | Primary stays "מציאת ההרשמה שלי"; a second button appears: "הרשמה חדשה בשם הזה" → steps 2 and 3, then Waiting or Waiting for a table. Nobody is registered as new without pressing it (decision 11) |
| Two or more with this name | `notice`: "יש כמה נרשמים בשם הזה, ולכן אי אפשר לדעת מי מהם אתם. השולחן שלכם מופיע במקרן, ואפשר לשאול את {המארח/המורה}." | The field keeps the text so the name can be fixed; the same second button, "הרשמה חדשה בשם הזה" |

Modal body by phase:

- Before publishing: "אם זה אתם, ההרשמה תמשיך בטלפון הזה ותיסגר בטלפון הקודם."
- After publishing: "אם זה אתם, תראו כאן את השולחן שלכם. בטלפון הקודם ההרשמה תיסגר."

The old phone shows the Removed state. Nothing tells the host. States of the modal: buttons busy while the server answers; a failed request shows the message inside the modal and keeps it open.

Accessibility: the modal takes focus on its title; "כן, זה אני" is first in the tab order; Escape and the background act as "close", not as "no".

### 4.4 Rank topics / Choose a table — `/tables/:id/choices` (kept, route renamed)

The approved screen in the Class frame: "צעד 2 מתוך 3", the note about sitting outside one's choices, the list where picked topics rise to the top, drag handle or arrow keys, "המשך" (or "שמירה" when it is the last step). Rows are 56px high; the handle and the row are separate 48px targets. Free mode: the list of tables with free seats, "לשבת כאן". States as in shared-table-assignment.md section 7. Back goes one step back and keeps unsaved picks.

### 4.5 My position — `/tables/:id/position` (kept)

"צעד 3 מתוך 3", the question, five stops between the two poles, "מעדיפים לא לענות" as an equal, visible choice below the stops and never drawn in the middle, "שמירה". Each stop has a 48px target although the dot is smaller. The two poles take `--side-a` and `--side-b` with their shape marks; the stops in between carry no colour of their own.

### 4.6 My table — `/tables/:id/my-table` (merged)

Purpose: know where to sit; on the day, get into the live table. The look is the Class one, a very large table number (decision 13); the Tables drawing of a table with seats is not carried over. Section 6 has the component.

```text
360px
┌──────────────────────────────────────┐
│ השכונה בעוד עשר שנים                 │
│ השולחן שלי                           │
│                                      │
│              שולחן                   │
│                4                     │   ← very large number
│          תחבורה ציבורית              │   ← topic
│     ( הבחירה הראשונה שלכם )          │   ← pill, text + mark
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ יושבים איתך                      │ │
│ │ (דנה לוי (אתם))  (יוסי כהן)      │ │
│ │ (מרים ח׳ורי)  (Alex Stone)       │ │   ← names only, no side marks
│ └──────────────────────────────────┘ │
│                                      │
│ [          כניסה לדיון             ] │   ← only once the discussion started
└──────────────────────────────────────┘
```

Content in order: gathering name; "שולחן" and the number; the topic; the pill ("הבחירה הראשונה שלכם" … or "נושא שלא בחרתם" with the thank-you note); the card "יושבים איתך" with names as chips, the person's own first with "(אתם)"; the action.

| State | What shows | Primary action |
|---|---|---|
| Loading | number and chips as skeletons | — |
| Error | "בעיית רשת. אפשר לנסות שוב." Never a draft seating | "ניסיון נוסף" |
| Published, shape A | everything above | none: the person's job is to go and sit |
| Published, shape B, discussion not started (free mode: registration closed, since that mode has no publishing) | everything above + one line "כש{המארח/המורה} יתחיל את הדיון, הוא ייפתח כאן." | none |
| Discussion started while the screen is open | a banner at the top, `role="status"`: "הדיון מתחיל". After 3 seconds the screen moves to `/m/:lessonId`. The button is there for anyone who does not want to wait | "כניסה לדיון" |
| Discussion already running when the person arrives | everything above, so they first see where to sit | "כניסה לדיון" |
| Lesson paused / ended | the lesson's paused or ended screen (`.lesson-state`, kept) | — |
| Registered late, not seated | goes back to the link home: Waiting for a table | — |
| Not registered | goes back to the link home | — |
| Tablemates not readable | the card is left out; number and topic still show | — |
| Free mode, registration open | + quiet "בחירת שולחן אחר" and "ביטול השתתפות". The seat can still change, so there is no line about the discussion yet | — |
| Assignment ended | the seat stays readable, with "החלוקה הסתיימה." under the topic | — |

Desktop: the same column, centred. RTL: chips flow from the inline start; a Latin name inside a Hebrew list keeps its own direction (`bdi`).

Motion: the number arrives once with a short scale-and-fade (`--dur-base`); under reduced motion it is simply there, and the 3-second move to the discussion happens with no transition.

---

## 5. The projector — `/t/tables/:id/screen` (shape A), `/t/:lessonId/screen` (shapes B, C)

Purpose: join, then who sits where. Tables' RoomScreen becomes the projector's first two views, drawn with Class projector blocks. Readable from the back row: headline at least 6vh, one focal point per view.

**View 1, join.** At the inline start, the QR on a white tile with a quiet zone (`--qr-quiet`), at least 40vh. At the inline end: the gathering name (eyebrow), the headline "סרקו את הקוד והצטרפו לשולחנות", the short link (`dir="ltr"`), in shape B the code as `.projector-code` under "קוד הכיתה" / "קוד המפגש", and the count as a big number with "כבר נרשמו".

**View 2, who sits where.** Headline "מי יושב איפה". A grid of `.tables-seats` tiles: the table number large, the topic under it, the names. 6 tiles a page at 1080p (3 × 2), fewer when names are long; the type never shrinks below the 8-metre size, the page count grows. The view turns its own pages every 12 seconds; ProjectorControls (visible to the host's pointer only) carry "הקודם", "הבא", "עצירה" / "המשך" and "עמוד 2 מתוך 4". After publishing a small QR stays in the bottom corner at the inline end with "הגעתם עכשיו? סרקו והירשמו", for latecomers.

| State | View |
|---|---|
| Draft | `.projector-step--state`: "ההרשמה עוד לא נפתחה" |
| Registration open | join |
| Closed, not published | "ההרשמה נסגרה. השולחנות יופיעו כאן בקרוב." |
| Published | who sits where (the host can flip back to join from the controls) |
| Shape B, discussion started | the lesson's stages (not designed here); "who sits where" stays one of the views the host can pick |
| Ended | "החלוקה הסתיימה." / the lesson's ended screen |
| Loading / error | today's `.projector__status` lines |
| Not signed in as the host | the host sign-in (kept) |

Never on the projector: positions, choices, how many got which choice, closeness marks. RTL: QR at the inline start in every language; tiles fill from the inline start; page turns are a cross-fade, not a slide, so direction does not matter. Reduced motion: pages switch with no fade.

---

## 6. My table and the Class table header: one component

Yes, one component, in two sizes.

`TableSeat` (NEW view, existing block `.table-step` with `.table-chip`) takes plain data and knows nothing about where it came from:

| Prop | Registration (shapes A, B) | No registration (shape C, the Tables step) |
|---|---|---|
| `number` | run index + 1 (the copy adds one; spec defect 9) | the lesson table's `n` |
| `topic` | the topic's title | absent |
| `members` | names; `isMe` on the person's own | names + `mark` (the side shape) |
| `pill` | which choice, or outside the choices | absent |
| `action` | "כניסה לדיון" once the discussion started | absent |

- **Full size** = My table (section 4.6) and shape C's Tables step. With registration the `mark` is never passed, so every chip is `table-chip--none`: a name and nothing else. The component cannot draw a side mark it was not given, which is what keeps the privacy rule from depending on a style.
- **Line size** = the status line in the frame header during the discussion (`.frame__line`): "שולחן 4 · תחבורה ציבורית", or "שולחן 4" with no topic. One helper, `tableLine(number, topic)`, builds it for the frame and for the console strip, so the table is named the same way everywhere.

Who owns the data changes at "start" (the published run, then the lesson's tables); the component does not change. That is what lets My table become the way into the live table without a second screen.

Retired: Tables' `.my-table` block and the table drawing (`TableArt`). The Class number is the arrival moment (decision 13).

---

## 7. School or community wording

**Where the host sets it.**

- On an assignment: Setup, second card, **"מי המשתתפים?"** with two choices, "תלמידים בבית ספר" and "אנשים בקהילה", and one hint line: "לפי זה ייכתב במסכים: מורה ושיעור, או מארח ומפגש."
- On a lesson: "פרטי השיעור" in Questions of this lesson, the same control next to the lesson's language. A lesson where nothing was chosen reads as school, as today.
- An attached pair has one value, and the object that existed first keeps its own: "הוספת דיון" gives the new lesson the assignment's; "הרשמה מראש" gives the new assignment the lesson's and hides the card in Setup. Changing it later on either side ("תיקון פרטים", "פרטי השיעור") changes both. Removing the discussion leaves each with that value.
- First time, nothing is chosen and "פתיחת ההרשמה" waits for it. After that the host's last choice is preselected.
- It can be changed until registration opens; after that through "תיקון פרטים" (it changes words only, never data).

**Which strings change on these screens.** Only the four nouns. The Tables copy was written for a community (מארח, מפגש), so for the moved keys the school text is the new one: the base key gets the school text and key + `.community` keeps today's. The IA spec, section 3, has every key with both texts in Hebrew and English; this table says where each one shows.

| Where | Keys (`tableAssignment.` +) | Community | School |
|---|---|---|---|
| Not open | `notOpen.thanks` | המארח יפתח את ההרשמה | המורה יפתח … |
| My position, the privacy line | `position.privacy` | גם לא למארח | גם לא למורה |
| Waiting steps | `waiting.step.closing` | המארח סוגר את ההרשמה | המורה סוגר את ההרשמה |
| Waiting closed, Cancelled, Removed, name errors | `waiting.closedNote`, `cancelled.bodyClosed`, `removed.bodyMaybeMoved`, `cancel.claimed`, `error.nameLocked`, `error.nameClaimed` | … לדבר עם המארח | … לדבר עם המורה |
| Latecomer | `waiting.late.lead`, `waiting.late.note` | המארח ישבץ אתכם | המורה ישבץ אתכם |
| New here: My table before the start; name found twice; the console hint | `myTable.beforeStart`, `returnByName.several`, `console.register_ahead.hint` | מארח, מפגש | מורה, שיעור |
| Setup and Fix details | `setup.name`, `setup.summary.title`, `fixDetails.name`, `setup.problem.name` | מפגש | שיעור |
| Home and discussion card: the way to the lesson | — | למפגש | לשיעור |
| Projector code label | `projector.code` | קוד המפגש | קוד הכיתה |
| Class keys a registered person can meet before the start | `lesson.code.unknown.title`, `.body`, `lesson.ended.title`, `lesson.paused.title`, `.body` | מפגש, מארח | שיעור, מורה (today's text) |

One text for both: the home's search ("חיפוש לפי שם") and `state.notHost`, because the home serves both audiences. Deleted, not moved: `removed.title`, `removed.body` (the "כבר לא כאן" wording is the only one), the switch `returnByName`, `setup.return.*`, `participants.claimedByName`, and `returnByName.body` (replaced by `.bodyOpen` / `.bodyPublished`).

Not switched: "החדר" (it is the crowd, in both), "שולחן", "נושא", "הרשמה", "חלוקה לשולחנות", every button on the registration steps. Host and teacher forms follow each language's own rule for gender; Hebrew keeps the plural address ("נרשמתם") the Tables copy already uses.

---

## 8. Wording

### 8.1 Labels the spec marked (?) that appear on these screens: final text

| Key | Hebrew (final) | English | Note |
|---|---|---|---|
| `audience.label` | מי המשתתפים? | Who is taking part? | Changed from "למי זה?": it asks about people, which is what the host knows |
| `audience.school` | תלמידים בבית ספר | School students | |
| `audience.community` | אנשים בקהילה | People in a community | |
| `audience.hint` (new) | לפי זה ייכתב במסכים: מורה ושיעור, או מארח ומפגש. | This sets the words on the screens: teacher and lesson, or host and gathering. | |
| `tableAssignment.roomScreen.show` | הצגה במקרן | Show on the projector | Confirmed |
| `console.register_ahead` | הרשמה מראש | Advance registration | Hebrew confirmed; English shortened so it fits a button |
| `console.register_ahead.hint` (new) | רוצים שיירשמו ויקבלו שולחן לפני השיעור? / … לפני המפגש? | Want people to register and get a table before the lesson / gathering? | |
| `tableAssignment.addDiscussion` | הוספת דיון | Add a discussion | Confirmed |
| `tableAssignment.addDiscussion.title` (new) | יהיה גם דיון בשולחנות? | Will the tables also hold a discussion? | |
| `tableAssignment.addDiscussion.lead` (new) | אחרי שכולם יושבים, כל שולחן מדבר, כותב הצעות ומצביע בטלפון. | Once everyone is seated, each table talks, writes proposals and votes on the phone. | |
| `console.start_discussion` | התחלת הדיון | Start the discussion | Confirmed |
| `console.start_discussion.blocked` (new) | קודם מפרסמים את השיבוץ | Publish the seating first | |
| `console.start_discussion.blockedOpen` (new) | קודם סוגרים את ההרשמה | Close registration first | "לשבת איפה שירצו": no publishing, so closing is the condition |
| `tableAssignment.myTable.enter` | כניסה לדיון | Join the discussion | Changed from "לשולחן" and agreed in the spec: the person is already looking at their table, and "לשולחן שלי" (`tableAssignment.stage.seeMyTable`) is another jump |
| `tableAssignment.myTable.starting` (new) | הדיון מתחיל | The discussion is starting | |
| `tableAssignment.returnByName.late` | כבר נרשמתי | I already registered | Confirmed |
| `tableAssignment.returnByName.lateTitle` (new) | נרשמתם כבר בטלפון אחר? | Already registered on another phone? | |
| `tableAssignment.returnByName.field` (new) | השם המלא, בדיוק כמו בהרשמה | Your full name, exactly as you registered | |
| `tableAssignment.returnByName.find` (new) | מציאת ההרשמה שלי | Find my registration | |
| `tableAssignment.returnByName.notFound` (new) | לא מצאנו הרשמה בשם הזה. בדקו שהשם כתוב בדיוק כמו בהרשמה. | We found no registration under this name. Check it is written exactly as you registered. | |
| `tableAssignment.returnByName.several` (new) | יש כמה נרשמים בשם הזה, ולכן אי אפשר לדעת מי מהם אתם. השולחן שלכם מופיע במקרן, ואפשר לשאול את המארח. | Several people registered under this name, so we cannot tell which one you are. Your table is on the projector, or ask the host. | `.community` / school variant |
| `tableAssignment.returnByName.newUnderName` (new) | הרשמה חדשה בשם הזה | Register as new under this name | |
| `tableAssignment.waiting.late.title` | נרשמתם. מחכים לשולחן | You are registered. Waiting for a table | "מחכים לשולחן" confirmed as the label |
| `tableAssignment.count.waitingForSeat` | {{count}} מחכים לשולחן | {{count}} waiting for a table | plural forms per language; replaces "עדיין לא משובצים" in the count |
| `plan.pace.label`, `.host`, `.table` | מי קובע את הקצב? · כולם יחד, לפי המורה / לפי המארח · כל שולחן בקצב שלו | Who sets the pace? · Everyone together · Each table at its own speed | Confirmed as proposed; drawn in the discussion card only when use case 2 ships |

Not on these screens, left for use case 2: `console.table_at`, `turn.table_done`, `console.pause` (new value), `console.open_vote_all`.

### 8.2 Other new strings on these screens

| Key | Hebrew | English |
|---|---|---|
| `teacher.home.title` (value changes; also the back bar's name for `/t`) | דף הבית | Home |
| `teacher.home.assignments` | חלוקות לשולחנות | Table assignments |
| `tableAssignment.list.create` (kept) | + חלוקה חדשה | + New table assignment |
| `teacher.home.assignments_empty` | עוד אין חלוקות לשולחנות | No table assignments yet |
| `teacher.home.assignments_ended` | הסתיימו ({{n}}) | Ended ({{n}}) |
| `teacher.home.show_all` | הצגת הכול ({{n}}) | Show all ({{n}}) |
| `teacher.row.open_assignment` | לחלוקה | To the assignment |
| `teacher.row.with_discussion` | עם דיון | With a discussion |
| `teacher.row.registration` | הרשמה מראש · {{status}} · {{count}} | Advance registration · {{status}} · {{count}} |
| `teacher.home.start.lesson` / `.assignment` (empty home cards) | שיעור עם כיתה · הרשמה לשולחנות | A lesson with a class · Registration for tables |
| `tableAssignment.addDiscussion.none` | עוד אין משחק עם שאלות. מכינים אחד במערך שיעור, ואז חוזרים לכאן. | There is no game with questions yet. Make one in a lesson plan, then come back. |
| `tableAssignment.removeDiscussion` | הסרת הדיון | Remove the discussion |
| `tableAssignment.removeDiscussion.title` | להסיר את הדיון מהחלוקה? | Remove the discussion from this table assignment? |
| `tableAssignment.removeDiscussion.body` | החלוקה והנרשמים נשארים כמו שהם. הדיון נשאר אצלכם בדף הבית, בלי הרשמה מראש. | The assignment and the people registered stay as they are. The discussion stays on your home page, without advance registration. |
| `tableAssignment.removeDiscussion.confirm` / `.keep` | כן, להסיר · לא, להשאיר | Yes, remove · No, keep it |
| `tableAssignment.addDiscussion.attached` | הדיון: {{name}} | The discussion: {{name}} |
| `tableAssignment.live.codeToo` | אפשר להיכנס גם עם הקוד {{code}} | The code {{code}} works too |
| `tableAssignment.myTable.beforeStart` | כשהמארח יתחיל את הדיון, הוא ייפתח כאן. | When the host starts the discussion, it opens here. |
| `tableAssignment.returnByName.bodyOpen` | אם זה אתם, ההרשמה תמשיך בטלפון הזה ותיסגר בטלפון הקודם. | If it is you, the registration continues on this phone and closes on the other. |
| `tableAssignment.returnByName.bodyPublished` | אם זה אתם, תראו כאן את השולחן שלכם. בטלפון הקודם ההרשמה תיסגר. | If it is you, you will see your table here. The registration closes on the other phone. |
| `tableAssignment.waiting.kept` | הבחירות שלכם שמורות. הן לא מוצגות בטלפון הזה, כדי לשמור על הפרטיות. | Your choices are saved. They are not shown on this phone, to keep them private. |
| `tableAssignment.waiting.answerAgain` | לענות מחדש | Answer again |
| `tableAssignment.stage.closedSoon` | השולחנות יתפרסמו בקרוב. אחרי הפרסום אפשר יהיה להירשם כאן ולקבל שולחן. | The tables will be published soon. After that you can register here and get a table. |
| `tableAssignment.roomScreen.lateScan` | הגעתם עכשיו? סרקו והירשמו | Just arrived? Scan and register |
| `projector.code.community` | קוד המפגש | Gathering code |
| `tableAssignment.assignment.started` | הדיון התחיל. מי שעובר שולחן מופיע כאן. | The discussion has started. Anyone who changes table shows here. |

Languages: Class has 7 (he, en, ar, de, es, fa, nl). Every key above, and every moved `tableAssignment.*` key, is needed in all 7 under `apps/join-class/src/lib/locales/tableAssignment/`. Arabic exists for the moved keys; German, Spanish, Persian and Dutch are new for all of them (about 250 strings). Persian and Arabic are right to left. Counts need the plural forms each language has (Arabic has six).

---

## 9. Privacy on these screens (what the design guarantees)

- The host's screens (home, stage screens, preview, published, participants, console strip) show names, counts and tables. No position, no choice, no "who got which choice" per person. Preview totals stay totals.
- My table and the projector show names and the topic. No side marks in any lesson that used registration; the component is never given them (section 6).
- A return by name shows the returning person nothing that the first phone entered: no choices, no position.
- The host sees no mark, count or warning about returns by name.
- "Support by side" in the Summary (a use case 2 screen, not drawn here) is shown in lessons with registration too, as totals the server computes from the private answers, with no minimum group size. No screen in this design receives a person's position, so nothing here has to change for it.

---

## 10. What is reused, moved and retired

### Class (`apps/join-class`) — reused as is

| File | For |
|---|---|
| `styles/_tokens.scss` | every colour, space, radius, shadow, duration |
| `styles/_components.scss` (`.btn`, `.modal`, `.qr-share`, `.status-mark`, `.a11y-widget`) | buttons, dialogs, share card, status marks |
| `styles/student-frame.scss` (`.frame`) | every participant screen |
| `styles/student-c2.scss` (`.table-step`, `.table-chip`, `.name-entry`) | My table, the name field |
| `styles/student-state.scss` (`.lesson-state`) | not open, closed, ended |
| `styles/teacher.scss`, `teacher-plans.scss`, `teacher-home-create.scss` | home groups and rows, Setup cards, the sticky bar, lesson picker, class form |
| `styles/teacher-back-bar.scss` | back paths |
| `styles/projector.scss`, `projector-controls.scss` | both projector views |
| `components/QRShare`, `AccessibilityWidget`, `BrandLogo`, `WizColFooter`; `views/teacher/ConfirmDialog`, `LessonPicker`, `ClassForm`, `TeacherBackBar`, `projector/ProjectorControls` | as named |

### Class — changed

| File | Change |
|---|---|
| `styles/teacher-plans.scss` | group head becomes a disclosure (`.teacher-home__section-toggle`, `.teacher-home__section-count`), "show all", the ended sub-group |
| `styles/student-c2.scss` | `.table-step__topic`, `.table-step__pill`, `.table-step__banner` |
| `styles/console.scss` | `.console__assignment` strip; the "הרשמה מראש" row in `.console__qr` |
| `styles/teacher.scss` | `.status-chip--draft`, `.status-chip--published` if no existing mark fits |
| `views/student/c2/TablesView.ts` | draws `TableSeat` |

### New in Class (global BEM SCSS, tokens only)

| File | Blocks |
|---|---|
| `styles/tables-stage.scss` | `.tables-stage` (`__count`, `__number`, `__estimate`, `__join`, `__discussion`, `__late`) — host stage screens |
| `styles/tables-seats.scss` | `.tables-seats` (`__tile`, `__number`, `__topic`, `__names`, `--projector`, `--preview`) — one table tile for preview, published and projector. Use case 2 can add `--at-work` to the same tile |
| `styles/tables-setup.scss` | only what `.plan-card` lacks: the topic list, the summary sentence, the three strictness choices |
| `styles/tables-rank.scss` | `.rank-list`, moved from Tables and re-tokenised |
| `styles/tables-position.scss` | `.position-stops`, moved and re-tokenised |

### Tables (`apps/tables`) — moved, then the app is retired

| From Tables | Becomes |
|---|---|
| `views/host/HostSetup`, `SetupTopics`, `SetupPosition`, `SetupSummary`, `TopicImport` | Setup, on `.plan-card` |
| `views/host/HostLive`, `HostPreview`, `HostAssignment`, `HostParticipants` and the three dialogs | the stage screens, on `.tables-stage` and `.tables-seats` |
| `views/participant/*` | the participant screens, in `RegistrationFrame` |
| `views/room/RoomScreen` | two views of the Class projector |
| `components/RankList`, the position stops, `ChoiceSummary`, `MetricsPanel` | moved with their logic; styles re-tokenised |
| `logic/*`, `lib/tablesApi` and the live readers | moved unchanged (not a design matter) |
| `lib/locales/{he,en,ar}.ts` | `apps/join-class/src/lib/locales/tableAssignment/` × 7 |

Retired: `components/Shell`, `HostFrame`, `ParticipantFrame`, `HostGate`, `StepHeader`, `StateBox`, `StatusChip`, `Modal`, `QrCode`, `CopyLink`, `AccessibilityTool`, `TableArt`, `Placeholder`, `views/host/HostList`, `HostHome`; styles `_tokens.scss`, `_base.scss`, `_forms.scss`, `_modal.scss`, `_a11y.scss`, `_steps.scss`, `_participant.scss`, `_my-table.scss`, `_host.scss`, `_room.scss`, `_preview.scss`, `_setup.scss` (their layout is rebuilt on Class blocks; nothing is imported from the WizCol brand tokens).

Class-name mapping for the port: `.btn--cta` → `.btn.btn--primary` inside `.frame__action` or `.plan__bar`; `.btn--soft` → `.btn--secondary`; `.btn--text` → `.btn--tertiary`; `.pill` → `.status-chip`; `.notice` → the Class error and hint lines; `.screen` → `.frame`; `.card` → `.plan-card`.

### Rules for all new styles

- Tokens only: no hex, no px for colour, space, radius, shadow or duration. Fixed sizes are allowed only where a pattern needs them (the 56px primary button, the 48px target).
- BEM: block, `__element`, `--modifier`; no block nested inside another block's selector; no grandchildren.
- Contrast AA: text 4.5:1, large text and non-text marks 3:1, checked in light, dark and high contrast. Status is always a word plus a shape.
- Targets at least 48px, 8px apart. Focus ring from `--focus-ring-*` on every control, including the group heads and the console strip.
- Live changes are announced: the count (`aria-live="polite"`, at most once every few seconds), "הדיון מתחיל", "ההרשמה נסגרה", a table arriving for a latecomer.
- `prefers-reduced-motion`: no number entrance, no page fade on the projector, no disclosure animation; state changes are instant.
- Dark mode and high contrast come from the Class tokens; the QR always sits on a white tile.

---

## 11. Build order

Each step can ship by itself.

1. **Words.** Move `tableAssignment.*` into Class in 7 languages, with the school and community variants and the audience choice in Setup. No screen changes yet; it can be reviewed as text.
2. **Participant registration inside Class** (`/tables/:id` and its three steps, My table with `TableSeat`, all link-home states). Shape A works for participants on class.wizcol.com.
3. **Host assignment screens inside Class** (`/t/tables/*`) and the home's third group. Shape A works end to end.
4. **Projector:** the two views on `/t/tables/:id/screen`.
5. **Cutover:** every tables.wizcol.com path redirects at once, by the spec's table; `apps/tables` is removed. Nobody is registered there, so no identity is lost.
6. **"כבר נרשמתי", always on, before and after publishing.** Needs the server change of decisions 4 and 10: a claim at any status that accepts people, with the answers kept. Removes the Setup switch and the host tag; `settings.allowReturnByName` is no longer read.
7. **The two doors:** "הוספת דיון" (the card and its screen), "הסרת הדיון", "הרשמה מראש", the console strip, the audience on the lesson, the code-box branch, "התחלת הדיון" and "כניסה לדיון". This is shape B up to the start; it needs the server to copy the seating into the lesson's tables.
8. **Tables larger than 8 in a discussion** (decision 6). The talk-in-turns machine (`MAX_TABLE_SIZE`, `functions/src/classroom`) is built and tested for 2–8; extend and test it for larger tables. This lands with step 7, not after it: the design has no cap, notice or blocked state to fall back on.

Steps 2 to 5 change no behaviour, only where the screens live and how they look, so they can be checked against the live Tables screens side by side.

---

## 12. Left ready for use case 2 (not designed here)

- The console strip `.console__assignment` is the one entry to the assignment during the lesson and already carries "N מחכים לשולחן".
- `.tables-seats__tile` is the single table tile; the at-work facts (the table's step, time, stuck mark) can join it as a modifier.
- `TableSeat` reads "the current owner" of the seating, so My table needs no change when the lesson's tables take over.
- The "הוספת דיון" screen has a reserved place for "מי קובע את הקצב?".
- The projector keeps "who sits where" as a view the free stretch can reuse.

---

## 13. Resolved on 2026-11-11

The eleven points this design raised about the IA spec, and its five questions, as Tal decided them. The spec carries each one (its section 9); the interim workarounds are gone from this file.

1. **Seats above 8 with a discussion.** No cap. Default 7 for an assignment, the host can change it, and attaching a discussion limits nothing. The notice and the blocked card are removed. The turn machine is built for 2–8 and must be extended and tested (build step 8).
2. **Return by full name.** Not a host setting. It always works, before and after publishing, with no limit; the switch, its warning and the "המשיך בשם" tag are retired.
3. **Name not found, or found twice.** The person is told and can fix the name; a new registration only if they ask (section 4.3).
4. **The home's title.** "דף הבית", also in the back bar. "מערכי השיעור" names the group of plans.
5. **Default seats.** 7 for an assignment; 6, unchanged, for a lesson with no registration.
6. **The lesson's audience.** Set in "פרטי השיעור"; in an attached pair the object that existed first keeps its value and the pair shares it (section 7).
7. **The moved copy.** Base key = the new school text, `.community` = today's text; the spec's section 3 lists every key in Hebrew and English.
8. **"הוספת דיון", step 2.** Its own screen, `/t/tables/:id/discussion`. A discussion can be removed until it starts; the assignment and the lesson both stay (section 3.8).
9. **An open registration.** Only under "חלוקות לשולחנות", first in the list. "פתוחים עכשיו" is for lessons.
10. **"לשולחן" and "לשולחן שלי".** The jump into the discussion is "כניסה לדיון".
11. **"Sit where you like" with a discussion.** No publish step, so "registration closed" is the condition for My table and for "התחלת הדיון".

Also decided: a person who returns on another phone before publishing does not answer again; the answers stay saved and are not shown, and "לענות מחדש" is there (section 4.3). My table uses the Class look, the large number (section 6).

---

## 14. Questions for Tal

None open from the first round; all five were answered on 2026-11-11 (section 13).

One new point, raised by the spec: in "לשבת איפה שירצו" with a discussion, a person who arrives after registration closed has no seat and no way to take one. The spec proposes that they register by name and wait for a table, as after publishing. If Tal agrees, the "Closed, not registered" state (section 4.2) follows the published rule in that mode.
