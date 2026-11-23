# Class: the first screen of a lesson (Trello Rkrtmmx8) - IA spec, APPROVED by Tal 2026-11-23

Object names follow `docs/ia/join-class-teacher-console.md`. Hebrew marked (?) is a draft: write natural Hebrew.

## Decisions Tal made (2026-11-23)
1. Build the proposal below.
2. "הצגה על המקרן" (Show on the projector) with ONE tap opens the existing class screen (`/t/:mid/screen`, "הצגה במסך הזה" behaviour) full screen on this device; Esc returns. "מקרן בחלון נפרד" stays under "עוד".
3. The question to solve is chosen in a dialog at step 1 (this batch). Requiring it at lesson creation is a separate Backlog card - NOT in this build.
4. Hide the pause button at step 1 (`waiting`) only. "סיום השיעור" stays in "עוד". From the first real step pause is always visible as before.

## Why it was unintuitive
1. Two audiences, teacher first: code + QR were the 6th block under five teacher-only blocks.
2. The real class screen (`/t/:mid/screen`) is hidden under "עוד" → "מקרן".
3. The big button "בחירת השאלה לפתרון" only scrolls to the ChallengeNeeded box; an unfinished setup task is the loudest thing the class sees.
4. Tabs "שולחנות / מה כתבו", the clock and pause show before anything exists.
5. The join card's QR line is the shared `qrShare.label` ("הזמינו מישהו לידכם"), written for students; nothing says "scan, or type this code at this address".

States at step 1: A no question yet; B ready, nobody in; C students coming in; D everyone in. Paused / ended unchanged.

## The screen: one console ordered well + a visible projector button
Step line and big button stay in their places on every step (Tal 11-19).

### State A (RTL)
```
+--------------------------------------------------------------+
|                         [עוד ▾]          קוד: 912094   שם השיעור  ⌂ |   (no pause at step 1)
|                                  שלב 1 מתוך 3: התלמידים נכנסים ▾  |   (no clock at step 1)
+--------------------------------------------------------------+
|        0 נכנסו מתוך 22 · כדי להתחיל צריך שאלה לפתרון (?)         |
|              [ בחירת השאלה לפתרון ]   <- opens a small dialog   |
+--------------------------------------------------------------+
|                    מצטרפים לשיעור (?)                           |
|   +---------+     סורקים את הקוד, או נכנסים אל                  |
|   |   QR    |     {{כתובת}} ומקלידים: (?)                       |
|   +---------+           9 1 2 0 9 4                            |
|          [ הצגה על המקרן ]  [שיתוף]  [העתקת קישור]               |
+--------------------------------------------------------------+
|  הכיתה · 0                                                     |
|  עוד לא הצטרפו                                                 |
+--------------------------------------------------------------+
```
The dialog holds the same three choices as today's ChallengeNeeded box: "להשתמש בשאלה הזאת", "או לכתוב שאלה חדשה" + "הוספה ושימוש", "כתבו אותה בתוכנית". When the question is set the dialog closes → state B. Dialog must be accessible (focus trap, Esc closes, focus returns to the button, labelled title).

### States B, C, D
```
|        7 נכנסו מתוך 22                (D: + "אפשר להמשיך")      |
|              [ פתיחת השלב הבא: {{שם השלב}} ]                    |
+--------------------------------------------------------------+
|   (same join card: QR, big code, הצגה על המקרן)                |
+--------------------------------------------------------------+
|  השאלה לפתרון: "{{השאלה}}"                         [שינוי]     |
+--------------------------------------------------------------+
|  הכיתה · 7                                                     |
|  נועה · יואב · תמר · ...  (newest first)                        |
```
- "השאלה לפתרון" is one quiet line; "שינוי" goes to the existing `/t/:mid/plan?focus=challenge`.
- No SwitchBand tabs at step 1; "מה כתבו" returns at the next step.
- No clock at step 1.
- "אפשר להמשיך" must not rely on colour alone.
- {{כתובת}}: the real join address students use (find it in the code - the URL the QR encodes, shown without protocol).

### Next action per state
| State | Status line | Big button |
|---|---|---|
| A | 0 נכנסו מתוך 22 · כדי להתחיל צריך שאלה לפתרון | בחירת השאלה לפתרון (opens dialog) |
| B | 0 נכנסו מתוך 22 | פתיחת השלב הבא: {{name}} (as today) |
| C | {{n}} נכנסו מתוך {{total}} | same |
| D | same + "אפשר להמשיך" | same |
| Paused / ended | unchanged | unchanged |

## Code changes (all apps/join-class/src; no server, rules or type changes)
| File | Change |
|---|---|
| views/teacher/TeacherConsole.ts | At `waiting`: don't draw SwitchBand; don't draw the open ChallengeNeeded box (other steps keep it) |
| views/teacher/JoiningCard.ts | Title, "scan or type" line with the address, bigger code, "הצגה על המקרן" button; drop the student wording |
| components/QRShare.ts | Accept a label from the caller (default stays `qrShare.label` for other callers: JoiningCard, projector/ProjectorBand) |
| views/teacher/ProjectorMenu.ts | Export the existing "show here" action so the join card calls it; the "עוד" menu stays |
| views/teacher/NextAction.ts | `pickQuestion` opens the dialog instead of scrolling |
| views/teacher/ChallengeNeeded.ts | Same content, rendered in a dialog at step 1 |
| new views/teacher/QuestionLine.ts | "השאלה לפתרון: … [שינוי]" under the join card at step 1 |
| views/teacher/StepLine.ts | Hide the clock at `waiting` |
| views/teacher/ConsoleBar.ts | Hide pause at `waiting` |
| lib/classroom/classStatus.ts | Waiting line adds "needs a question" words in state A |
| Locales, 7 languages (he.ts etc., consoleUi/, challenge/) | ~6 new keys, e.g. console.join.title, console.join.how, console.join.projector, console.status.need_question, console.question_line, console.question_change |
| Styles: console-board.scss, teacher-challenge.scss | Card + dialog layout |

Stays: top bar (minus pause at step 1), "עוד", step line, action band and its place, class list, registration strip, the whole projector (TeacherProjector, projector/steps.ts, ProjectorBand), every other step.
