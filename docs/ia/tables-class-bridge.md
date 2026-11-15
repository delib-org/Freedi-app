# Tables and Class: the bridge (register in Tables, discuss in Class) — IA spec

Status: draft, for Tal's review; nothing built
Date: 2026-11-15
Phase 1 of [join-class-tables-merge.md](join-class-tables-merge.md). That spec stays the target; this one says how the two live apps work together until Tables moves into Class. Design reference: [join-class-registration-design.md](../design/join-class-registration-design.md).
Hosts: tables.wizcol.com (`apps/tables`) and class.wizcol.com (`apps/join-class`), one Firebase project.
Changes to the merge spec: decision 6 (two size ranges) and decision 15 ("sit where you like" has no publish) are replaced by sections 2.2 and 2.3 here. The open item at the end of its section 9 (a late person in "sit where you like") is answered in 2.3.

Why a bridge is needed: an anonymous person has one identity per web address, so the person who registered on Tables is a stranger to Class. Two things carry them across: a personal link, and their full name.

## 1. Audiences

| Audience | One-line goal | Must never see |
|---|---|---|
| Host (teacher or event host), the same Google account in both apps | Open registration in Tables, connect it to a lesson in Class, have everyone sit at their table | A person's position or topic choices; other hosts' registrations |
| Registered participant, anonymous, own phone | Get from "השולחן שלי" to my table in the discussion with no typing | Other people's answers; anyone's personal link |
| Walk-in: came with the class code, never registered | Join and get a seat | The same |
| Person without a phone | Sit and be counted at a table | — |

## 2. Object model

| Object | Meaning | Relations | Lifecycle |
|---|---|---|---|
| Table assignment (`TableAssignment`) | Registration and seating for one event (unchanged) | 0..1 lesson, through `contextStatementId` | unchanged |
| Lesson (`Statement`, question, `lessonPlan`) | The live discussion (unchanged) | 0..1 table assignment | unchanged |
| Connection (the bridge) | "This lesson uses that registration" | 1 assignment : 1 lesson; `contextStatementId` on the assignment, NEW optional `tableAssignmentId` in the lesson's settings | none → connected → seating copied → (lesson ended). Removable until the seating is copied |
| Topic count (NEW, on the assignment) | One topic, or several | 1 per assignment | set in Setup; fixed once registration opens |
| Seats per table | The largest number of people at one table. One meaning in both apps | 1 per assignment; 1 per lesson without registration | 2.2 |
| Personal link (NEW) | A private way into one registration's seat | 1 per registration, reusable | made when "השולחן שלי" first shows the button; dies when the assignment or the lesson ends, or the registration is cancelled or removed |
| Reserved seat (NEW, on the lesson's table) | A registered person who is seated but has not opened Class yet. A name only | 1 per registration that has not arrived | reserved → arrived (becomes a member) or added as a person without a phone |
| Arrival | A registration joined to a Class member | 1 registration : 1 Class member at a time; the latest device holds it | by personal link or by full name |

Statement tree: unchanged. The lesson is the only Statement. Assignment, topics, registrations, runs, personal links and reserved seats are operational records. No new picklist value anywhere: new facts are new optional fields (the strict-schema trap).

### 2.1 Splitting a topic into tables (point 1)

- Tables for a topic = people ÷ seats per table, rounded up. A topic with nobody opens no table.
- Sizes are balanced: tables of one topic differ by at most one person. 70 people, 7 seats: 10 tables of 7. 71 people: 11 tables, five of 7 and six of 6.
- No table of one. With 3 or more seats per table (2.2) the rule cannot produce one: the smallest table of a topic that needs two tables or more has at least half the seats, so never fewer than 2. Minimum table size is therefore 2, as a result of the rule, not a setting. (With 2 seats, three people would split into 2 and 1; that is why the shared range starts at 3.)
- The only way to a table of one is a topic that one person chose. Ranked mode: the engine seats that person by their next choice. "Sit where you like": the host sees the flag "בנושא {{topic}} נרשם אדם אחד" when closing and decides; nobody is moved out of a chosen topic by the system. (Needs Tal, question 1.)
- Table numbers run through the topics in the host's topic order, so one topic's tables are neighbours.

### 2.2 One seats setting, one range (point 4)

- One label, "מקומות בשולחן", one meaning (the maximum), one range, **3–20**, in both apps. Tables keeps its range; Class goes from 2–8 to 3–20 and loses the value 2 (a lesson already saved with 2 still runs). Class's own label "גודל קבוצה בשולחן" is retired.
- A connected lesson has no setting of its own: it shows the registration's number, read-only ("נקבע בהרשמה: 7"). The value is read from the assignment and is not written to the lesson (an old Class client refuses a lesson whose stored size is above 8).
- A lesson without registration: the setting becomes a maximum too. Today it is a target (31 students at 6 give a table of 7); with the shared meaning they give 6 tables of 5–6.
- Default: 7 for an assignment, 6 for a lesson without registration, as today, until the merge. (Question 2.)
- What Class must change before a connected lesson can run with more than 8 at a table:
  - the size chooser on the console and the plan screen (7 values today, 18 then);
  - every place that lists the people of one table: the student's Tables step and table header, the console's table card and table sheet, the projector's "who sits where", "act for" a person without a phone;
  - talking in turns: everyone speaks for the set time before the table moves on. Twenty people at one minute is twenty minutes a question. A rule for large tables is needed (question 3);
  - "move on" needs two presses whatever the size (kept);
  - the server checks that refuse a size outside 2–8 (`fn_classAssignTables`, `statementSettings.tableSize`).

### 2.3 "Sit where you like" with tables made by the system (point 2)

- The person chooses a **topic**, not a table. The system makes the tables (2.1). The topic is saved as their single choice.
- Table numbers are fixed **when the host closes registration**, not live. Live numbering moves people whenever one more person registers (70 → 71 changes ten tables into eleven), and "first seven take table 1" ends with a table of one.
- Before closing a person sees their topic, how many chose it, and the line "מספר השולחן יופיע כאן כשההרשמה תיסגר". They may change topic or cancel until then. No table number and no tablemates before closing.
- Closing does two things in one press: closes registration and publishes the tables. There is no preview (nothing to judge: the split is arithmetic). The assignment's status goes straight to `published`, so "published" is the one condition for My table and for copying in both modes.
- A person who registers after closing gets a free seat at the emptiest table of their topic at once. If their topic has no free seat they see "מחכים לשולחן" and the host seats them (existing flow).
- A topic no longer has a fixed number of tables in this mode (`maxTables` is not read; the seat counters and `tablesJoinTable` are retired for new assignments). Assignments already open under the old rule finish under it.

### 2.4 One-topic event (point 3)

- Setup asks "כמה נושאים יש במפגש?": "נושא אחד" or "כמה נושאים". One topic: no topic list and no "mix or sit" question. The server keeps one topic named after the event; the mode is `ranked`, so tables are mixed by position when a position was asked, and evenly otherwise.
- The participant has no topic step: name, then the position question if there is one, then waiting, then My table. My table and the lesson's tables show the number without a topic line.

### 2.5 Position and side (point 9)

Follows the merge spec: position and side are one concept, asked once, and a position given in registration is never copied onto the Class member.

| Registration had a position question | In the connected lesson |
|---|---|
| Yes | The lesson has no Side step, for anybody: connecting removes `side` from the lesson's step list (an existing value removed from a list, no new value), removing the connection puts it back. A person who chose "מעדיפים לא לענות" is not asked again. Walk-ins have no position. "Support by side" in the Summary is totals computed by the server from the private answers (merge decision 5), with the registration's two poles as the names. No side marks anywhere |
| No | The Side step runs as in any lesson, for everyone, and is stored and shown as today |

## 3. Labels

(?) marks Hebrew proposed here. Tables keys live in `apps/tables/src/lib/locales/{he,en,ar}.ts`; Class keys in `apps/join-class/src/lib/locales/{he,en,ar,de,es,fa,nl}.ts`. Every new or changed key goes into every file of its app.

| Concept | EN label | HE label | i18n key | Route segment | Code type | Synonyms to retire |
|---|---|---|---|---|---|---|
| Enter the discussion | Join the discussion | כניסה לדיון | Tables NEW `tableAssignment.myTable.enter` (agreed) | Class `seat` | — | "לשולחן" |
| Personal link | Personal link | קישור אישי | Tables NEW `tableAssignment.myTable.enter.hint`: "הקישור אישי. הוא מושיב אתכם בשולחן שלכם בלי להקליד שם." (?) | `seat/:seatCode` | NEW `seatCode` | token, magic link, קוד אישי |
| Link no longer works | This link is no longer active | הקישור הזה כבר לא פעיל (?) | Class NEW `seat.invalid.title`, `.body`: "אפשר להיכנס עם הקוד שעל המסך ולכתוב שם מלא." | — | — | — |
| Seat moved to another device | The discussion continues on another device | הדיון ממשיך במכשיר אחר (?) | Class NEW `seat.moved.title`, `.body` | — | — | — |
| Topic count | How many topics does the gathering have? One topic / Several topics | כמה נושאים יש במפגש? נושא אחד / כמה נושאים | Tables NEW `tableAssignment.setup.topicCount`, `.one`, `.several`, `.one.hint`: "כולם מדברים על אותו נושא, ואף אחד לא צריך לבחור." (?) | — | NEW optional `topicCount: 'one' \| 'several'` in settings, stored as a plain string | "single mode" |
| Seats per table | Seats per table | מקומות בשולחן | Tables `tableAssignment.setup.seats` (kept); Class `console.table_size` (value changes) | — | `settings.tableSize`; lesson `tableSize` | Class "גודל קבוצה בשולחן" |
| Seats, explained | The most people at one table. A topic with more people opens more tables | הכי הרבה אנשים בשולחן אחד. נושא שבחרו בו יותר אנשים נפתח בכמה שולחנות. (?) | Tables NEW `tableAssignment.setup.seats.hint`; Class `console.table_size_help` (value changes) | — | — | — |
| Seats, set by the registration | Set in the registration: {{n}} | נקבע בהרשמה: {{n}} (?) | Class NEW `console.table_size.from_registration` | — | — | — |
| Sit where you like | Sit where they like | לשבת איפה שירצו | `tableAssignment.mode.direct` (kept); `.hint` value changes: "כל אחד בוחר נושא בעצמו. לכל נושא נפתחים כמה שולחנות שצריך." (?) | — | `direct` | — |
| Choose a topic (was: choose a table) | Choose a topic | לבחור נושא | value changes: `tableAssignment.stage.act.direct.button`; `.direct.sit` → "לבחור בנושא הזה" (?); `.direct.yours` → "הנושא שלך"; `.myTable.chooseFirst` → "עוד לא בחרתם נושא."; `.myTable.chooseAnother` → "בחירת נושא אחר"; `.waiting.unfinished.lead.direct` → "נשאר לבחור נושא."; `.waiting.unfinished.button.direct` → "לבחירת נושא"; `.home.intro.direct` → "היום נשב בשולחנות קטנים. בוחרים נושא, ומספר השולחן יופיע כשההרשמה תיסגר." (?) | `preferences` (kept in phase 1) | `preferences[0]` | "בחירת שולחן" in this mode; delete `.direct.free`, `.direct.full`, `.direct.seatsUnknown` |
| People in a topic | {{count}} chose this topic | {{count}} בחרו בנושא הזה (?) | Tables NEW `tableAssignment.direct.count` | — | — | — |
| Table number comes later | Your table number will appear here when registration closes | מספר השולחן יופיע כאן כשההרשמה תיסגר. (?) | Tables NEW `tableAssignment.myTable.numberLater` | — | — | — |
| Close, "sit where you like" | Close registration and set the tables | סגירת ההרשמה וקביעת השולחנות (?) | Tables NEW `tableAssignment.live.close.direct`; value changes: `.preview.directLive`, `.assignment.directLive` → "כך הנושאים מתמלאים עכשיו. השולחנות ייקבעו כשההרשמה תיסגר." (?) | — | status → `published` | — |
| One person in a topic | One person registered for {{topic}} | בנושא {{topic}} נרשם אדם אחד (?) | Tables NEW `tableAssignment.close.oneInTopic` | — | — | — |
| Register ahead | Registration before the lesson | הרשמה מראש | Class NEW `console.register_ahead` (agreed) | `registration` | sets the connection | pre-registration, "linking" in UI text |
| Choose a registration | Which registration belongs to this lesson? | איזו הרשמה שייכת לשיעור הזה? (?) | Class NEW `console.register_ahead.choose`; `.connect` "חיבור לשיעור" (?); `.empty` "עוד אין לכם הרשמה. פותחים אחת ב־Tables וחוזרים לכאן." (?); `.new` "הרשמה חדשה"; `.manage` "לניהול ההרשמה" (?) | — | — | — |
| What connecting changes | (two lines, shown before connecting) | "השולחנות יגיעו מההרשמה." · "שאלת העמדה מההרשמה תחליף את 'בחירת צד'." (?) | Class NEW `console.register_ahead.effect.tables`, `.effect.side` | — | — | — |
| Remove the registration (lesson side of "הסרת הדיון") | Remove the registration from the lesson | הסרת ההרשמה מהשיעור (?) | Class NEW `console.register_ahead.remove` | — | clears the connection | disconnect, ניתוק |
| Arrived | {{arrived}} of {{registered}} are here | {{arrived}} מתוך {{registered}} הגיעו (?) | Class NEW `console.register_ahead.arrived` | — | — | — |
| Copy the seating | Bring the tables from the registration | הבאת השולחנות מההרשמה (?) | Class NEW `console.copy_seating`; `.again` "עדכון מההרשמה" (?); `.not_ready.ranked` "קודם מפרסמים את השיבוץ"; `.not_ready.direct` "קודם סוגרים את ההרשמה" (both agreed in the design) | — | — | sync, import |
| Reserved seat | Not here yet | עוד לא הגיעו (?) | Class NEW `table.not_arrived` | — | NEW optional `reservedSeats` on the table | no-show as a label |
| Full name, as registered | Write your full name, as you registered | כתבו שם מלא, כמו בהרשמה (?) | Class NEW `opening.name_prompt.registered` | — | `tableAssignmentNameKey` | — |
| Name not found | We did not find a registration under this name | לא מצאנו הרשמה בשם הזה. (?) | Class NEW `opening.name_not_found`; `.fix` "לתקן את השם"; `.join_new` "להצטרף בלי הרשמה" (?) | — | — | — |
| Name already in | Someone already came in under this name. Is it you, on another device? | מישהו כבר נכנס בשם הזה. זה אתם, ממכשיר אחר? (?) | Class NEW `opening.name_taken`; `.yes` "כן, זה אני"; `.no` "לא, אני מישהו אחר" (the Tables texts) | — | — | — |
| Name found twice | Two people registered under this name. Which table is yours? | יש שני נרשמים בשם הזה. באיזה שולחן אתם? (?) | Class NEW `opening.name_twice` | — | — | — |
| Alone at a table | Only one person at the table | אדם אחד בשולחן (?) | Class NEW `console.table_alone`; student `table.alone`: "אתם לבד בשולחן כרגע. אפשר לחכות לשאר, או שיצרפו אתכם לשולחן אחר." (?) | — | — | — |

Not renamed in phase 1 (the merge renames them): Tables routes `/sessions/:id…`, `/host…`; the key `tableAssignment.session`. School or community wording is not added here; Tables keeps its community words and Class its school words until the merge.

## 4. Hierarchy (per role)

Role: Host. Two homes in phase 1, one per app, tied by one link each way. This is the bridge's known cost; the merge removes it.

```text
0 Class home                                        class.wizcol.com/t
1   Lesson plan                                     /t/plans/:planId
2     Lesson (console)                              /t/:lessonId
3       Registration before the lesson (NEW)        /t/:lessonId/registration
          not connected → choose | connected → status, arrived, manage, remove
        → out: the registration in Tables           tables.wizcol.com/host/sessions/:id
0 Tables home                                       tables.wizcol.com/host
1   Table assignment, by status                     /host/sessions/:id      (unchanged)
        Setup gains: topic count; seats hint
        connected: one line "מחובר לשיעור: {{name}}" → out: the lesson's console
```

Role: Participant.

```text
0 Tables link                                       tables.wizcol.com/sessions/:id
1   Choose a topic / Rank topics                    /sessions/:id/preferences
1   My position                                     /sessions/:id/position
1   My table                                        /sessions/:id/my-table
        → out: "כניסה לדיון"                         class.wizcol.com/seat/:seatCode
0 Class front door (code box)                       class.wizcol.com/  → /c/:code
0 Personal link (NEW, no screen of its own)         /seat/:seatCode → /m/:lessonId
0 My table at work                                  /m/:lessonId
        name gate (walk-in or name fallback) | room step | my table
```

## 5. Navigation model

- **Global:** unchanged in both apps.
- **Local, host in Class:** the console's join panel, while the room is at "waiting", carries the entry "הרשמה מראש" (the place the design fixed, section 3.8). Once connected, the console carries one strip with the registration's status and "N מתוך M הגיעו"; it opens `/t/:lessonId/registration`.
- **Local, host in Tables:** a connected assignment shows the lesson's name as a link to its console. Connecting and removing are done in Class only (one place per action).
- **Contextual:** the Tables step of a connected lesson offers "הבאת השולחנות מההרשמה" instead of dealing; a table card lists "עוד לא הגיעו" under the people present.
- **Back paths:** `/t/:lessonId/registration` → the console. `/seat/:seatCode` replaces itself with `/m/:lessonId`, so back never returns to the code. From Class a participant has no way back to Tables and needs none: the table is on the Class screen.
- **Entry points:**
  - personal link: `class.wizcol.com/seat/:seatCode`, opened only from the button on "השולחן שלי" or on "מחכים לשולחן";
  - class code: `/c/:code` → `/m/:lessonId` → name gate;
  - the registration link and QR stay Tables' (`/sessions/:id`). The Class projector of a connected lesson shows the class code as today; the registration QR is shown from Tables.
- **URL shape:** the personal link carries one long random code and nothing else: no name, no assignment id, no lesson id.

### 5.1 The personal link (point 6)

- **What it is.** A random code tied to one registration. Class's server exchanges it for: the lesson, the person's name, and their seat. The answers (position, choices) are never sent to Class's client.
- **Where it lives.** On the person's private registration record, which only they can read (and which the host cannot). A second, server-only record maps the code to the registration; no client reads it.
- **Reusable.** Opening it again on the same device returns to the same seat. Opening it on a second device moves the seat there (the latest device holds it), and the first shows "הדיון ממשיך במכשיר אחר". Same rule as "כבר נרשמתי" in the merge spec, no limit.
- **What a stranger with the link gets.** That one seat: the name, the table number and what every tablemate sees. Nothing else, and no answers. It is the same reach as typing the person's full name, which Tal accepted. The real person takes the seat back by opening their link or typing their name.
- **Expiry.** No clock. It stops working when the assignment ends, the lesson ends, the connection is removed, or the registration is cancelled or removed. A registration that moved to another Tables browser by full name keeps its link.
- **When the button shows.** As soon as the assignment is connected and the person has a seat (My table) or is waiting for one. Before the lesson starts Class shows its waiting step.

### 5.2 Full name as the fallback (point 7)

- The name gate of a connected lesson asks for the full name "כמו בהרשמה". Matching is the rule Tables already uses for a return by name (`tableAssignmentNameKey`: spaces at the ends dropped, runs of spaces made one, letter case and Unicode form ignored). No fuzzy matching, in either app.
- One registration matches and nobody arrived on it yet: the person is seated at once, no extra question.
- One matches and another device already holds it: "מישהו כבר נכנס בשם הזה. זה אתם, ממכשיר אחר?" Yes moves the seat here; No joins as a walk-in under that name.
- Two registrations match: once the seating is copied the person picks theirs by table number and topic (nothing else is shown). Before that they are let in under the name and get the question when the tables arrive.
- No match: "לא מצאנו הרשמה בשם הזה." with "לתקן את השם" and "להצטרף בלי הרשמה". Nobody becomes a walk-in silently (merge decision 11).

### 5.3 Connecting, copying and what happens after (point 5)

- **Which registrations are listed:** the table assignments this Google account hosts, not ended and not connected to another lesson. One assignment, one lesson.
- **When the seating is copied:** when the host opens the Tables step. The server copies the published tables into the lesson's tables with the same numbers and topics: people who already arrived become members, the rest become reserved seats. Not published yet: the step says what is missing ("קודם מפרסמים את השיבוץ" / "קודם סוגרים את ההרשמה") with the link to the assignment in Tables.
- **After copying, the lesson's tables own the seating** (the merge spec's rule). A change in Tables moves nobody by itself:
  - a person who registers later and arrives in Class is seated at their Tables table if it has a free seat, otherwise as a walk-in;
  - a person the host removed in Tables keeps their place in the lesson until the host moves or removes them there;
  - "עדכון מההרשמה" copies again, and is offered only while the room is still at the Tables step. It asks first, because it undoes moves the host made by hand.
- **Removing the connection:** from `/t/:lessonId/registration`, until the seating is copied. Both objects stay as they were.

### 5.4 Walk-ins, no-shows, a table of one, no phone (point 8)

| Case | Rule |
|---|---|
| Walk-in, before copying | In the lesson, no table; seated when the tables arrive |
| Walk-in, at and after copying | The table with the fewest people that still has a free seat. Reserved seats and people without a phone count as taken. No free seat anywhere: "עוד אין לכם שולחן" on the phone, "N בלי שולחן" on the console, the host moves them by hand |
| No-show | Stays a reserved seat, by name, under "עוד לא הגיעו". Not counted for turns or for "move on" |
| Registered, here, no phone | "הוספת משתתף בלי מכשיר" offers the table's reserved names first; choosing one turns that reserved seat into a person without a phone (today's limit of 5 per table stays) |
| One person present at a table | The console marks the table "אדם אחד בשולחן"; the phone says so and what will happen. The host moves the person or waits. Nothing merges by itself, because the others may be on their way |

## 6. Task flows

Role: Host, task: set up a one-topic event (Tables): 4 steps.
1. Tables home — "חלוקה חדשה".
2. Setup — name; "נושא אחד"; position question (optional); seats per table.
3. Setup — "פתיחת ההרשמה".
4. Registration open — share the link and QR.

Role: Host, task: set up several topics, people choose (Tables): 4 steps. As above, with "כמה נושאים", the topic list and "לשבת איפה שירצו" in step 2. On the day: "סגירת ההרשמה וקביעת השולחנות", one press.

Role: Host, task: connect a registration to a lesson (Class): 3 steps.
1. Console at "waiting" — "הרשמה מראש".
2. Registration before the lesson — pick the registration; read the two effect lines.
3. "חיבור לשיעור" — back on the console, the strip shows the status and the count.

Role: Host, task: seat everyone on the day (Class): 2 steps.
1. Console — open the Tables step.
2. Tables step — "הבאת השולחנות מההרשמה". Every table shows who is here and who is not yet.

Role: Registered participant, task: get to my table in the discussion: 1 step.
1. Tables, "השולחן שלי" — "כניסה לדיון". Class opens at the room's current step, with the name and the seat already there.

Role: Registered participant, task: came with the class code: 2 steps.
1. Class front door — the code.
2. Name gate — the full name. Seated.

Role: Participant, task: choose a topic in "sit where you like": 2 steps (name, topic), 3 with a position question. One-topic event: 1 step (name), 2 with a position question.

Role: Walk-in, task: join without registering: 3 steps. Code; name; "להצטרף בלי הרשמה".

## 7. Screen inventory

| Screen | App, route | Single job | States |
|---|---|---|---|
| Setup (changed) | Tables `/host/new`, `/host/sessions/:id` | Describe the event, open registration | Adds topic count and the seats hint. One topic: topic list and mode question absent. Error: not saved, choices kept. Others unchanged |
| Choose a topic (was Choose a table) | Tables `/sessions/:id/preferences` | Pick one topic | Empty: no topics (cannot happen after opening). Loading. Error: choice kept, retry. Closed: read-only with the table number. Done: back to waiting |
| Registration open, "sit where you like" (changed) | Tables `/host/sessions/:id` | Watch topics fill, close | Shows people per topic and the tables that would open. Closing with a one-person topic: the flag, then confirm |
| My table (changed) | Tables `/sessions/:id/my-table` | Know where to sit, enter the discussion | Before closing in "sit where you like": topic and "number comes later". Connected: "כניסה לדיון" and the hint. Link could not be made: the line "אפשר להיכנס עם הקוד שעל המסך ולכתוב שם מלא". Not connected: as today |
| Registration before the lesson (NEW) | Class `/t/:lessonId/registration` | Connect one registration to this lesson, or see the connected one | Empty: no registration, with the way to Tables. Loading. Error: retry. No permission: host sign-in. Connected: name, status, arrived of registered, "לניהול ההרשמה", "הסרת ההרשמה מהשיעור" (until copied). Done: the console |
| Personal link (NEW, no screen) | Class `/seat/:seatCode` | Exchange the code and land on the lesson | Loading: the splash. Invalid or expired: "הקישור הזה כבר לא פעיל" with the code box. Offline: retry. Done: `/m/:lessonId` |
| Name gate (changed) | Class `/m/:lessonId` | Give a name, find the registration | Connected lesson: the "as registered" prompt; not found; already in; found twice. Unconnected lesson: as today |
| Seat moved (NEW state) | Class `/m/:lessonId` | Say the seat is now on another device | One action: "להיכנס שוב מכאן" (the name gate) |
| Tables step, student (changed) | Class `/m/:lessonId` | Know where to sit | Topic line when the table has one. Names present, then "עוד לא הגיעו". No seat yet: "עוד אין לכם שולחן" |
| Console, Tables step (changed) | Class `/t/:lessonId` | Bring the tables, see who arrived | Not published: the reason and the link to Tables. Copied: tables with present and not-arrived names, "N בלי שולחן", "אדם אחד בשולחן". "עדכון מההרשמה" while at this step |
| Table card, table sheet (changed) | Class console, `/t/:lessonId/table/:n` | See and help one table | Adds topic and reserved names. Never positions or choices |
| Console settings (changed) | Class console | Lesson settings | Seats per table read-only when connected |

## 8. Findability

- Registration chooser: open registrations first, then by date, newest first; search by name once the list passes one phone screen.
- Choose a topic: the host's topic order; each row shows its count. No search (a long topic list is the host's to shorten).
- Console tables: by number, so one topic's tables sit together; the existing filters stay, plus "אדם אחד בשולחן" and "עוד לא הגיעו".
- Reserved names in "add a person without a phone": the table's own first, then search by name across the lesson.
- Participants never search: the link or the name puts them on their own table.

## 9. Open questions and assumptions

Needs Tal:
1. A topic that one person chose in "sit where you like". Recommended: flag it to the host at closing, move nobody automatically.
2. One default for seats per table now (7 everywhere), or keep 7 for a registration and 6 for a lesson without one until the merge? Recommended: keep until the merge. Also: Class loses "2 at a table" (pairs) so that the split never leaves a person alone. Acceptable?
3. Talking in turns at a table of up to 20. Who speaks, and for how long, when a full round would take twenty minutes? Class cannot run tables above 8 well until this is answered.
4. The position question in the registration and "בחירת צד" in the game are written in two places and may be two different questions. Recommended: the registration's replaces the game's in a connected lesson, and the Summary uses the registration's poles. Agree?
5. Should the system ever merge a table that has one person present? Recommended: no, the host decides.
6. May the host close registration from Class on the day, or is going to Tables for it acceptable in phase 1? Recommended: go to Tables.

Assumptions (the spec changes if one is wrong):
- The host uses the same Google account in both apps, so the account's id is the same and "my registrations" needs no pairing step.
- The connected lesson keeps Class's steps (waiting, opening, tables, table talk, proposals, all proposals, vote, summary; Side only when the registration asked no position). The merge spec's shape B (no Tables step, My table inside Class) arrives with the merge, not here.
- A person who moves to a second device keeps the name; what they wrote from the first device stays under that name but cannot be edited from the second.
- Assignments already open in "sit where you like" finish under today's choose-a-table rule; nothing is migrated.
- Tablemates' names are not shown before closing in "sit where you like" (today they are, from the first choice).
- Table pace (use case 2 of the merge) is out of scope here.

## 10. Handoff to UX

Fixed by this spec: the connection is 1:1 and is made in Class only; seats per table is one label, a maximum, 3–20; the split rule; in "sit where you like" a person chooses a topic and numbers are fixed at closing; the one-topic Setup question and the missing topic step; the personal link carries one code, is reusable, and the latest device holds the seat; the name rule and its four outcomes; copying happens at the Tables step and the lesson owns the seating afterwards; reserved seats are names only; no position ever reaches a Class screen; the labels and routes of section 3.

Yours to decide (ux-ui-architect, ui-design-system-architect): where the "כניסה לדיון" button and its hint sit on "השולחן שלי"; how Setup asks the topic count; how a topic row shows its count; how a table of up to 20 names reads on a phone, a table card and the projector, and what control replaces an 18-value size chooser; how reserved names differ from people present; the look of the console strip and of `/t/:lessonId/registration`; how the two effect lines are shown before connecting; the wording of every (?) label and the Arabic, German, Spanish, Persian and Dutch texts.

IA defects this phase leaves open on purpose: two host homes; "session" in Tables routes; Tables in three languages and Class in seven; school words in Class for a community host. All are closed by the merge.
