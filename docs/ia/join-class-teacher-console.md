# join-class: The teacher console, made clear — IA spec

Status: draft, for Tal
Date: 2026-11-19
Card: Trello aDRFbaf7, "The whole teacher interface is unclear. Make it clearer for the simple teacher."
Builds on: `join-class-lesson-plan.md` (objects, home, back paths), `join-class-student-screen.md`, `join-class-no-device.md`, `tables-class-bridge.md`, `join-class-tables-merge.md`.
Does not re-specify (in motion elsewhere): the "picked a side" and "who is speaking" marks on table cards; the language lock in lesson settings; the students' Proposals step (`join-class-proposals-flow.md`); "Removed" lessons and plans on the lists.

The teacher stands in front of 30 teenagers with a phone or a laptop. At a glance she must know three things: **where the lesson is**, **what the class is doing**, and **the one thing to press next**. Today the console answers the first, half-answers the second, and gets the third wrong.

## 1. Audiences
| Audience | One-line goal | Must never see |
|---|---|---|
| Teacher (ordinary school teacher, Hebrew, RTL, phone or laptop, not technical) | Run the lesson step by step without thinking about the tool | Which side a student chose; developer words; numbers like 0.40 |
| Students, projector | Unchanged by this spec | — |

## 2. Audit of today

### 2.1 Teacher screens
| Screen | Route | How she gets there | Way back |
|---|---|---|---|
| My lesson plans (home) | `/t` | Sign-in; the home icon everywhere | — |
| Lesson plan | `/t/plans/:planId` | A plan row on the home | Home icon |
| Game questions | `/t/plans/:planId/games/:gameId` | "תכנון השאלות" on a game | Back to the plan |
| Console (the live lesson) | `/t/:mid` | "לשיעור" in "פתוחים עכשיו" or on the plan; after "יצירה" | "חזרה אל {{plan}}" |
| One table | `/t/:mid/table/:n` (a sheet over the console) | Tap "שולחן N" | "סגירה" |
| This lesson's questions | `/t/:mid/plan` | "תכנון השאלות" in the console's top bar | Back to the console |
| Registration before the lesson | `/t/:mid/registration` | "הרשמה מראש" row (Waiting step only) | Back to the console |
| Projector | `/t/:mid/screen` | "מקרן" menu | Own window, or Esc |

Depth is fine (console = 2, its sub-screens = 3). The problem is inside the console.

### 2.2 The console today, region by region
Regions from top: back bar → top bar → (registration row) → (status banner) → step rail → "switch band" → (challenge box) → board.

**Always on screen**
| Region | Control (HE / EN) |
|---|---|
| Back bar | חזרה אל {{plan}} / Back to {{plan}} |
| Top bar | lesson name; קוד: 123456 / Code; קוד QR / QR code; מקרן / Projector (menu: מקרן בחלון נפרד, הצגה במסך הזה); תכנון השאלות / Plan the questions; הגדרות השיעור / Lesson settings (popover: רף ההסכמה לשאלה המרכזית 0.00–1.00, כמה תלמידים בכיתה?, מקומות בשולחן, כמה הצעות לכל אחד, סבבים בשלב ההצעות, זמן לדבר, התלמידים יכולים להוסיף שאלה משלהם, עיצוב השיעור משחקי/סולידי); השהיית השיעור / Pause the lesson; סיום השיעור / End the lesson |
| Banner (not live) | השיעור בהפסקה + המשך השיעור · השיעור פתוח לתלמידים + סיום השיעור · השיעור הסתיים + פתיחה מחדש |
| Step rail | 9 step buttons, every one tappable; primary: פתיחת השלב הבא: {{name}} / Open the next step: {{name}} (last step: סיום השיעור); שלב n מתוך 9; clock |
| Switch band, end | שולחנות / Tables · מה כתבו / What they wrote (+ flag count) · מסך התלמידים / Student screen |
| Board, after tables exist | a long hint, always: "יש תלמידים שלא יכולים לשבת יחד? גוררים שם…"; per card: שולחן N (opens the sheet), + בלי מכשיר / + No device, a name menu (העברה לשולחן אחר, בקשת שם חדש) |

**Per step (switch band + board)**
| Step (HE / EN) | Controls added |
|---|---|
| ממתינים למורה / Waiting for the teacher | הרשמה מראש / Registration before the lesson; board: הכיתה · n. If no question to solve: עוד אין שאלה להצעות, בחירת השאלה להצעות, להשתמש בשאלה הזאת, או לכתוב שאלה חדשה, הוספה ושימוש, כתבו אותה בתוכנית |
| פתיחה / Opening | על המקרן: הטקסט / {video} (band); board: הקדמה, עריכת ההקדמה |
| בחירת צד / Choose a side | board: {{chose}} מתוך {{total}} בחרו צד |
| חלוקה לשולחנות / Dividing into tables | Entering splits the class automatically. Band: חלוקה מחדש / Split again (or, connected: הבאת השולחנות מההרשמה, עדכון מההרשמה, לניהול ההרשמה). Board: ללא שולחן + לשולחן ▾. **Cards also show "סבב 1 מתוך N", "עכשיו: בחרו שאלה" and a "לדבר" button** |
| שאלות חקירה / Investigation questions | איפוס הסבבים בכל השולחנות (red); cards: turn, question, asker, לסיים את הזמן; sheet: לענות עכשיו, לוותר על התור בשם…, איפוס הסבבים בשולחן, העברה, הסרה |
| הצעות / Proposals | בלי מכשיר (x/y); כל השולחנות: מדרגים; סבב נוסף בכל השולחנות; כולם ביחד; cards: לדבר / לכתוב / לדרג, סבב נוסף; panel: הצעות מול השער, השער ב-0.4 |
| כל ההצעות / All proposals | line: n מתוך m תלמידים דירגו הכול · לכל הצעה לפחות k דירוגים; cards: n/m דירגו הכול; the goal panel |
| הצבעה / Vote | ההצבעה טרם נפתחה (chip); התוצאות סגורות לכיתה (chip); פתיחת ההצבעה → השהיית ההצבעה / המשך ההצבעה, סגירת ההצבעה; n מתוך m הצביעו; סדר ההצעות (לפי הדירוגים / סדר אקראי / לפי מספר הקולות); מי רואה את התוצאות (רק אני / כל הכיתה); ההצעות בהצבעה (כל ההצעות / רק מעל היעד); איפוס ההצבעה (red); בלי מכשיר |
| סיכום / Summary | results chip; מי רואה את התוצאות; מי רואה את התמיכה לפי צד; board: תמיכה לפי צד |

At the Vote step a laptop shows about 25 controls before the first table. On a phone the top bar alone wraps to several rows.

### 2.3 Defects, most severe first
1. **The big button is not the next thing to do.** The one primary button always says "Open the next step". At Vote it says "Open the next step: Summary" while the vote has not been opened; "פתיחת ההצבעה" is a grey button in another band. Pressing the big button skips the vote with no warning. *Principle: one primary task per screen.*
2. **One tap jumps ahead several steps.** Every future step in the rail is a live button. A tap on "הצבעה" during Investigation questions skips three steps, with no confirm (going back does confirm). *No safe path.*
3. **Controls that do nothing useful, or the wrong thing, for the step.** At "חלוקה לשולחנות" each card shows the Proposals turn line, "עכשיו: בחרו שאלה" and a "לדבר" button that sends that table into Proposals. A long drag hint stays on screen at every step. *Controls shown when they do nothing.*
4. **"Is the class ready?" has no fixed place.** The count that says "you can move on" is on the board at Side, in the band at All proposals and Vote, and only per card at Investigation questions and Proposals (she must read 6 cards). *No "what the class is doing" at a glance.*
5. **The teacher never sees the result.** The console shows neither the decision nor the vote counts, only "support by side". The result is on the projector, or in "מסך התלמידים", which shows made-up sample data. "סיום השיעור" then sends her to the plan screen. *A task with no place.*
6. **Synonyms.** The goal: רף / שער / יעד (and EN gate / goal). The question to solve: השאלה לפתרון (plan) / השאלה להצעות (console) / השאלה המרכזית (settings). Paused: בהפסקה / מושהה / עצור. *One name per concept.*
7. **Words only a developer would understand.** "רף ההסכמה לשאלה המרכזית" as a 0.00–1.00 slider with two decimals; "השער ב-0.4". The teacher's first step is called "ממתינים למורה", but she *is* the teacher: that is the students' word.
8. **Everything competes at one level.** The top bar mixes things she does every lesson (pause) with things she does once (QR, projector window), planning (תכנון השאלות: editing questions in the middle of a lesson), and settings. "סיום השיעור" is in three places. The resets (red) sit next to the everyday actions.
9. **Two settings screens.** Seats, turns, speaking time and own questions are set in the plan *and* in the console popover, with the same labels. Not wrong, but she does not know which one counts. The console one wins for this lesson. Keep it, and say so.

## 3. Object model (only what exists)
| Object | HE | EN | Note |
|---|---|---|---|
| Lesson plan | מערך שיעור | Lesson plan | unchanged |
| Game | משחק | Game | unchanged |
| Class | כיתה | Class | unchanged |
| Lesson | שיעור | Lesson | one game played with one class; the console is its live view |
| Step | שלב | Step | 9 per lesson (8 in old lessons). Status: live / paused / open / ended |
| Table | שולחן | Table | numbered |
| What a table is doing | עכשיו: מדברים / כותבים / מדרגים | Now: talking / writing / rating | never called "step" in UI text (code: `ClassTable.step`) |
| Student | תלמיד | Student | |
| Student without a device | בלי מכשיר | No device | unchanged |
| Investigation question | שאלת חקירה | Investigation question | |
| Question to solve | **השאלה לפתרון** | **The question to solve** | retire השאלה להצעות, השאלה המרכזית |
| Proposal | הצעה | Proposal | |
| The goal | **השער** | **The goal** | retire רף, יעד, EN "gate"; shown as a percent |
| Vote / decision | הצבעה / ההחלטה | Vote / The decision | |
| Turn | סבב | Turn | |

**Labels that change** (all 7 locale files; (?) = needs a native read):
| Key | Today | New HE / EN |
|---|---|---|
| NEW `console.step.waiting` (console only; students keep `step.waiting`) | ממתינים למורה | התלמידים נכנסים (?) / Students are joining |
| `console.challenge.missing_title`, `.pick_label`, `.write_label`, `.blocked`, `.missing_live`, `.missing_start` | …שאלה להצעות… | …השאלה לפתרון… / …the question to solve… |
| `console.gate.label` | רף ההסכמה לשאלה המרכזית | השער: כמה הסכמה צריך כדי לעבור (?) / The goal: how much agreement passes |
| `console.gate.value`, `console.gate_at` | רף: 0.40 / השער ב-0.4 | השער: 40% / The goal: 40% |
| `console.gate_passed` | עברה את השער | kept |
| `console.vote_scope_above`, `_count`, `_none` | …מעל היעד… | …שעברו את השער… / …that passed the goal… |
| `console.act_for_held` | השיעור עצור… | השיעור בהפסקה… / The lesson is paused… |
| `console.vote_status_paused` | ההצבעה מושהית | ההצבעה בהפסקה (?) / The vote is paused |
| NEW `console.more` | — | עוד / More |
| NEW `console.step_more` | — | עוד בשלב הזה / More for this step |
| NEW `console.all_steps` | — | כל השלבים / All steps |
| NEW `console.ready` | — | אפשר להמשיך (?) / Ready to move on |
| NEW `console.status.joined`, `.tables_done`, `.rated`, `.voted` | — | {{n}} נכנסו (מתוך {{total}}) · {{n}} מתוך {{m}} שולחנות סיימו · (existing rated / voted lines) |
| NEW `console.decision` | — | ההחלטה / The decision |
| NEW `console.vote_skip_title` | — | ההצבעה לא נפתחה. לעבור לסיכום בלי הצבעה? (?) / The vote never opened. Go to the summary without a vote? |

## 4. Structure

**One home:** `/t` "מערכי השיעור שלי", with "פתוחים עכשיו" first: one tap to a running lesson. Unchanged.
```
0 /t                        My lesson plans (פתוחים עכשיו → straight to a console)
1   /t/plans/:planId        Lesson plan
2     …/games/:gameId       Game questions
2     /t/:mid               Console
3       /t/:mid/table/:n    One table (sheet)
3       /t/:mid/plan        This lesson's questions (moves into "עוד")
3       /t/:mid/registration  Registration before the lesson (moves into "עוד")
-       /t/:mid/screen      Projector (own window)
```

**The console: four regions, in this order on a phone (top to bottom).**
1. **Where we are (step line).** Back link, lesson name, the class code (always visible: she reads it aloud), "שלב n מתוך 9: {{step}}", the clock, and the lesson status when not live. "כל השלבים" opens the full step list, used to go **back** (earlier steps tappable with the existing confirm). Later steps are shown but not tappable.
2. **What the class is doing.** One status line for the step (the count that means "ready"), with "אפשר להמשיך" when it is complete. Under it, the board: tables (or the class list before tables). "שולחנות | מה כתבו" stays as a two-way switch; the flag count stays on "מה כתבו". Table cards show only what fits the step.
3. **The one next action.** One primary button. Its label changes *inside* a step when the step has work to do first (open the vote → close the vote → next step). While paused it is "המשך השיעור"; when ended, "חזרה אל {{plan}}".
4. **Everything else.** Two closed menus, never open by default:
   - "עוד בשלב הזה": the step's secondary and red actions (split again, another turn, reset, vote order, who sees results…).
   - "עוד" (top bar, the whole lesson): קוד QR, מקרן, מסך התלמידים, תכנון השאלות, הגדרות השיעור (plus the language lock now being added), הרשמה מראש, סיום השיעור.
   Only **השהיית השיעור** stays visible in the top bar (Q1).

## 5. Per-step table (live console)
| Step | What she sees | The ONE primary action | Secondary, and where | Time to move on when |
|---|---|---|---|---|
| התלמידים נכנסים / Students are joining | Code and QR large; class list; "{{n}} נכנסו (מתוך {{total}})" | No question to solve: "בחירת השאלה לפתרון". Else "פתיחת השלב הבא: פתיחה" | Projector, registration before the lesson: "עוד" | The count reaches the class size, or stops growing |
| פתיחה / Opening | The introduction; what the projector shows | "פתיחת השלב הבא: בחירת צד" | Text/video on the projector: inside the Opening panel (it is the step's content). Edit the introduction: "עוד" → תכנון השאלות | Her judgement (no count) |
| בחירת צד / Choose a side | Class list with the "picked" mark; "{{chose}} מתוך {{total}} בחרו צד" | "פתיחת השלב הבא: חלוקה לשולחנות" | — | Everyone chose |
| חלוקה לשולחנות / Tables | Tables with names only (no turn line, no "לדבר"); "ללא שולחן" strip if anyone is unseated | "פתיחת השלב הבא: שאלות חקירה". If the split failed: "חלוקה לשולחנות". Connected lesson before copying: "הבאת השולחנות מההרשמה" | Split again, update from the registration, seats per table: "עוד בשלב הזה". Moving a student: on the board | Nobody "ללא שולחן" |
| שאלות חקירה / Investigation questions | Each card: question, turn, who speaks; stuck tables marked | "פתיחת השלב הבא: הצעות" | Per table: on the card and the table sheet. Reset all turns (red): "עוד בשלב הזה" | "{{n}} מתוך {{m}} שולחנות סיימו" is complete |
| הצעות / Proposals | Cards: Now talking/writing/rating, turn; proposals against the goal | "פתיחת השלב הבא: כל ההצעות" | Another turn at all tables, all tables to rate, everyone together: "עוד בשלב הזה". "בלי מכשיר (x/y)": in the status line. Per table: on the card | All tables are at rating or done |
| כל ההצעות / All proposals | "{{n}} מתוך {{m}} דירגו הכול · לכל הצעה לפחות {{k}} דירוגים"; the goal panel | "פתיחת השלב הבא: הצבעה" | — | The line is complete |
| הצבעה / Vote | Vote status; "{{n}} מתוך {{m}} הצביעו" | Not open: "פתיחת ההצבעה". Open: "סגירת ההצבעה". Closed: "פתיחת השלב הבא: סיכום" | Before opening: which proposals, order. Any time: pause the vote, who sees the results, reset the vote (red). All in "עוד בשלב הזה" | "כולם הצביעו" |
| סיכום / Summary | **The decision** (winning proposal and votes) and support by side | Results hidden: "הצגה לכיתה". Shown: "סיום השיעור" | Who sees support by side: "עוד בשלב הזה" | The class has seen the decision |
| Paused (any step) | Banner "השיעור בהפסקה" | "המשך השיעור" | — | — |
| Ended | Banner "השיעור הסתיים"; the decision | "חזרה אל {{plan}}" | פתיחה מחדש: in the banner | — |

The primary never skips work silently: if she reaches Vote's "next" without a vote (only possible from the step list), she gets `console.vote_skip_title`.

## 6. Task flows
**Start a lesson (4 taps, 5 with 2+ games).** Home → "+ שיעור עם כיתה" → plan (→ game) → class → "יצירה" → the console at "התלמידים נכנסים". She reads the code aloud or opens "עוד" → מקרן. When the count is full: the primary.

**Seat or move a student.** On the board, drag the name to a table, or tap the name → "העברה לשולחן אחר" → table. Works at any step. The student's work stays theirs.

**A student is late, or has no device.** Late: the student types the code and appears in "ללא שולחן"; she picks "לשולחן ▾" → table (a connected lesson seats them by itself). No device: on the table card "+ בלי מכשיר" → name → "הוספה". From then on, tapping that name opens "on behalf of" for proposals and votes.

**Move the class to the next step.** Look at the status line → when it says "אפשר להמשיך", press the primary. If the step has work first (the vote), the primary is that work.

**Go back a step.** "כל השלבים" → tap the earlier step → "לחזור לשלב: {{name}}? מה שהתלמידים כתבו נשמר" → "לחזור".

**End the lesson and see the results.** At Summary: "הצגה לכיתה" (if hidden) → "סיום השיעור" → "סיום" or "להשאיר פתוח לתלמידים". She **stays on the console**, which shows "השיעור הסתיים" and the decision. Later: home or plan → the lesson row → "לשיעור" opens the same view.

## 7. What stays, moves, is removed (by file)
| File | Change | Size |
|---|---|---|
| `StepRail.ts` | Becomes the step line: current step, n of 9, clock, "כל השלבים" list. Future steps not tappable. The forward button leaves | M |
| NEW `NextAction.ts` + pure `lib/classroom/nextAction.ts` | The one primary button: step + lesson status + ballot state + tables → label and action (tested like `forwardControl`) | M |
| `SwitchBand.ts` | Split up: primary-type actions → `NextAction`; the rest → NEW `StepMore.ts` (closed menu); the view switch drops "מסך התלמידים" | L |
| `VoteBar.ts`, `voteBarState.ts` | Open/close → `NextAction`; progress → status line; pause, order, scope, audience, reset → `StepMore` | M |
| NEW `ClassStatusLine.ts` | One line per step + "אפשר להמשיך"; takes the sides count from `TablesBoard`, rated line from the band | S |
| `ConsoleBar.ts` | Keeps back, name, code, pause. QR, `ProjectorMenu`, תכנון השאלות, `ConsoleSettings`, end, registration, student screen → NEW `LessonMore.ts` | M |
| `LessonBanner.ts` | Keeps the status text; "המשך השיעור" moves to `NextAction`; drop its duplicate "סיום השיעור" (it is in "עוד") | S |
| `TableCard.ts` | At Side/Tables: names only (no turn line, no "now", no quick buttons) | S |
| `TablesBoard.ts` | Drag hint shown once per teacher, not always (Q6) | S |
| `OpeningPanel.ts`, `ProjectorPick.ts` | The projector choice moves into the Opening panel | S |
| NEW `DecisionPanel.ts` | The decision and votes on the console at Vote (closed), Summary and Ended; reuse the projector's `VoteStage` logic | M |
| `EndChoice.ts` | After ending, stay on the console (no redirect to the plan) | S |
| `consoleConfirms.ts` | Add the "vote never opened" confirm | S |
| `ConsoleSettings.ts` | Goal shown as a percent; title says these settings are for this lesson | S |
| `consoleView.ts` | `student` stays a URL view, opened from "עוד" | S |
| Locales (7 files + `vote/`, `challenge/`, `actFor/`) | §3 labels | S |
| Stay as they are | `TeacherHome`, `PlanOverview`, `LessonRow`, `TableSheetPanel`, `tableSheetTurn`, `MemberChip`, `actFor/*`, `GatePanel`, `SupportPanel`, `ChallengeNeeded` (now reached through the primary), `RegistrationStrip` (connected strip), `CopySeating`, `WhatTheyWrote`, `FlagsPanel`, projector | — |

**Build order, each slice ships alone:**
1. **One next button (M).** `nextAction.ts`, `NextAction`, step line without forward taps, vote-skip confirm, `TableCard` cleanup. Fixes defects 1, 2, 3.
2. **Quiet screen (M–L).** `LessonMore`, `StepMore`, `ClassStatusLine`, `SwitchBand`/`VoteBar` split, banner. Fixes 4, 8.
3. **Words (S).** All §3 label changes in 7 languages. Fixes 6, 7. Can go first if wanted.
4. **See the result (M).** `DecisionPanel`, stay on the console after ending. Fixes 5.

## 8. Findability
Tables: numbered, in order; "ללא שולחן" always on top when not empty. Class list before tables: by join order (unchanged). "מה כתבו": grouped by question and table (unchanged).

## 9. Open questions for Tal
1. Pause: keep "השהיית השיעור" always visible in the top bar (yes), or put it in "עוד" too (no)?
2. Later steps in the step list: not tappable, so forward is only the big button, one step at a time (yes / no)?
3. The big button does the step's own work first (Vote: open → close → next): yes / no?
4. One name for the challenge question: "השאלה לפתרון" (as in the plan) or "השאלה להצעות" (as in the console)?
5. The goal: "השער" (as on the projector) or "רף"?
6. The long "drag a name" hint: show it once per teacher (yes), or always (no)?

## 10. Handoff to UX
Fixed here: the four regions and their order, one primary per state (§5), the two "more" menus and what goes in each, the labels in §3, staying on the console after ending, later steps not tappable.
Yours: how the step line, the status line and the primary look on a phone and on a laptop; whether "עוד בשלב הזה" is a sheet or an inline list; how "אפשר להמשיך" is signalled (it must not be colour alone); whether the class code and the primary stay pinned while the board scrolls.
