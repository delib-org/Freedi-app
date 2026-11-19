# join-class: The teacher console — screen design

Status: draft, for Tal
Date: 2026-11-19
Card: Trello aDRFbaf7
Designs against: `docs/ia/join-class-teacher-console.md` (IA spec, with Tal's decisions of 2026-11-19). Holds the rows of `docs/ia/join-class-proposals-flow.md` §6 on the table card without redesigning them.
Styles: `apps/join-class/src/styles/` (`_tokens.scss`, `_components.scss` buttons, `console*.scss`). Breakpoints are the existing ones in `console-mobile.scss`: phone ≤ 767 px, tablet 768–1023 px, laptop ≥ 1024 px.

Wireframes are drawn **as seen on screen**: Hebrew reads from the right, so "start" is the right edge.

---

## 1. Layout

### 1.1 Laptop (≥ 1024 px) — Investigation questions, 5 of 6 tables done

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                                         ‹ חזרה אל דילמת הטלפונים  ⌂     │ 0 back bar (scrolls)
├════════════════════════════════════════════════════════════════════════════════════════┤ ┐
│ [עוד ▾]  [❚❚ השהיית השיעור]                 קוד: 482 913        ח׳2 · דילמת הטלפונים     │ │ 1 lesson bar   56
├────────────────────────────────────────────────────────────────────────────────────────┤ │
│  ●●●●◉○○○○                      [כל השלבים ▾]   ⏱ 12:40   שלב 5 מתוך 9: שאלות חקירה    │ │ 1 step line    44
├────────────────────────────────────────────────────────────────────────────────────────┤ │ sticky
│ [עוד בשלב הזה ▾]  [   פתיחת השלב הבא: הצעות   ]          5 מתוך 6 שולחנות סיימו          │ │ 2+3 action band 64
│                                                          ⏱ שולחן 4 תקוע · הצגה          │ │
├════════════════════════════════════════════════════════════════════════════════════════┤ ┘
│                                                              [ מה כתבו (2) | שולחנות ]  │ view switch
│ ┌ שולחן 3 ────────────────┐ ┌ שולחן 2 ────────────────┐ ┌ שולחן 1 ────────────────┐     │
│ │           סבב 2 מתוך 3  │ │           סבב 3 מתוך 3  │ │           סבב 3 מתוך 3  │     │ 2 board
│ │ ...                     │ │ ✓ כולם סיימו            │ │ ✓ כולם סיימו            │     │ (scrolls under
│ └─────────────────────────┘ └─────────────────────────┘ └─────────────────────────┘     │  the sticky block)
│ ┌ שולחן 4 ─ ⏱ תקוע ───────┐ ...                                                         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

- Rows 1–3 form one sticky block (`position: sticky; inset-block-start: 0`), 164 px. On a short laptop (`max-height: 719px`) only the action band is sticky.
- The action band reads start→end: status (what the class is doing) → ready mark → primary → step menu. The eye goes from "what" to "do".
- The 9-dot progress at the end of the step line is decorative (`aria-hidden`). Done ● `--ink`, current ◉ `--terra-600`, later ○ outline `--border-medium` (today's rail colours, `--rail-*`).

### 1.2 Phone (≤ 767 px) — same moment

```
┌──────────────────────────────────┐
│          ‹ חזרה אל דילמת הטל…  ⌂  │ 0 back bar
├──────────────────────────────────┤
│ [עוד]          ח׳2 · דילמת הטלפונים │ 1 lesson bar, row 1 (name wraps to 2 lines max)
│ [❚❚ השהיית השיעור]   קוד: 482 913 │ 1 lesson bar, row 2  (44 px)
├──────────────────────────────────┤
│ ⏱ 12:40   [שלב 5 מתוך 9: שאלות חקירה ▾]│ 1 step line: the whole label is the "כל השלבים" button
├──────────────────────────────────┤
│              [ מה כתבו (2) | שולחנות ] │ view switch, full width
│ ┌ שולחן 1 ─────────── סבב 3 מתוך 3 ┐ │
│ │ ✓ כולם סיימו                     │ │ 2 board: one column, scrolls with the page
│ └──────────────────────────────────┘ │
│ ┌ שולחן 4 ⏱ תקוע ──── סבב 2 מתוך 3 ┐ │
│ │ ...                               │ │
│            (padding-block-end = dock) │
╞══════════════════════════════════╡ ┐
│ ⏱ שולחן 4 תקוע     5 מתוך 6 שולחנות סיימו │ │ 2 status line (1 line; 2 at most)
│ [עוד בשלב הזה] [ פתיחת השלב הבא: הצעות ] │ │ 3 primary 56 px, 2/3 width; step menu 1/3, 44 px
│          (safe-area-inset-bottom)       │ │ fixed dock
└──────────────────────────────────┘ ┘
```

- **The dock** (status line + primary + step menu) is `position: fixed; inset-block-end: 0` on the phone. The thumb reaches the primary; it never scrolls away. Height ≈ 112 px + safe area. `.console__board` gets the same `padding-block-end` so the last card is never hidden.
- When the step has no step menu (see §6), the primary takes the full width.
- What collapses on the phone: the 9-dot progress is dropped; the step line becomes one button; the lesson name wraps (max 2 lines, then ellipsis); the back bar keeps its existing short form; table cards go to one column (existing rule). The top bar is **not** sticky on the phone — pause and the code are one swipe up, never inside a menu (Decision 1; see Assumptions A2).
- When the on-screen keyboard is open (typing a "no device" name), the dock hides (`:has(input:focus)` on `.console` or a `keyboard-open` class), so the input is not covered.
- **Tablet (768–1023 px):** laptop layout, but the action band wraps to two rows (status on top, buttons below, primary at the end) and only the action band is sticky.

### 1.3 Region contents (DOM order = focus order)

| # | Region | Contents | Component |
|---|---|---|---|
| 0 | Back bar | ‹ חזרה אל {{plan}}, home icon | `TeacherBackBar` (unchanged) |
| 1 | Lesson bar | `h1` lesson name · class code (`dir="ltr"`) · **השהיית השיעור** (hidden when paused or ended) · **עוד** | `ConsoleBar` |
| 1 | Lesson banner | Only when not live: paused / open / ended (§7) | `LessonBanner` |
| 1 | Step line | "שלב n מתוך 9: {{step}}" · clock · **כל השלבים** · dots | `StepLine` (from `StepRail`) |
| 2+3 | Action band / dock | Status line · ready mark · **primary** · **עוד בשלב הזה** | `ClassStatusLine`, `NextAction`, `StepMore` |
| 2 | View switch | שולחנות \| מה כתבו (flag count). "מסך התלמידים" leaves (it is in "עוד") | `SwitchBand` → slimmed to the switch |
| 2 | Board | Per step (§5); the decision panel at Vote (closed), Summary and Ended (§7) | `TablesBoard`, `TableCard`, `DecisionPanel` |

The action band comes **before** the board in the DOM on both widths (on the phone it is only drawn at the bottom). A screen-reader user hears "what the class is doing → what to press" before 30 names.

---

## 2. The primary button (`NextAction`)

One element, keyed (`key: 'next-action'`), so it keeps focus when its label changes. Class `.btn.btn--primary.next-action`. Min height 48 px laptop, 56 px phone. Label never wraps on laptop (it may wrap to 2 lines on a 320 px phone).

### 2.1 States

| State | Look | Behaviour |
|---|---|---|
| Normal | `btn--primary`: `--terra-600` fill, `--text-inverse` text (6.4:1) | One tap runs the action |
| Working | Same fill, label = busy text (table below), `aria-busy="true"`, `disabled` | No spinner (no motion to disable). Returns to normal or to the next label when the write lands |
| Disabled with reason | `aria-disabled="true"` (not `disabled`, so it stays focusable and read). Fill `--paper-deep`, text `--ink-muted`, border `--border-medium`. The reason sits under/next to it as text, linked with `aria-describedby` | A tap does nothing but move focus to the reason, or to the place that fixes it (e.g. the question picker) |
| Confirm first | Normal look. The tap opens `ConfirmDialog` (native `<dialog>`, Cancel focused). The dialog's yes is `btn--danger` only when work is lost; else `btn--secondary` | Used only where §2.2 says "confirm" |
| Paused | Label "המשך השיעור", normal look; gets focus when the pause lands (today's banner behaviour moves here) | Resumes |

The primary is **never** red. Red belongs to the menus (§6).

### 2.2 Label per state (from the IA per-step table)

| Lesson state | HE | EN | Key | Action | Busy label |
|---|---|---|---|---|---|
| No question to solve (any step) | בחירת השאלה לפתרון | Choose the question to solve | `console.challenge.pick_label` (value changes) | Scroll to and focus `ChallengeNeeded` on the board | — |
| Students are joining | פתיחת השלב הבא: פתיחה | Open the next step: Opening | `console.next` | `goToStep(1)` | פותחים… `console.busy_opening` |
| Opening | פתיחת השלב הבא: בחירת צד | Open the next step: Choose a side | `console.next` | next step | פותחים… |
| Choose a side | פתיחת השלב הבא: חלוקה לשולחנות | Open the next step: Dividing into tables | `console.next` | next step | פותחים… |
| Tables, connected lesson, not copied | הבאת השולחנות מההרשמה | Bring the tables from the registration | `console.copy_seating` | copy seating | מביאים… NEW `console.busy_copying` |
| Tables, no tables (not split, or the split failed) | חלוקה לשולחנות | Divide into tables | `console.split` (EN value changes, see §9) | `assignTables(mid, false)` | מחלקים… NEW `console.busy_splitting` |
| Tables, 0 students | חלוקה לשולחנות — disabled. Reason: "עוד אין תלמידים לחלק" | Divide into tables — reason: "No students to divide yet" | NEW `console.blocked.no_students` | — | — |
| Tables, split | פתיחת השלב הבא: שאלות חקירה | Open the next step: Investigation questions | `console.next` | next step | פותחים… |
| Investigation questions | פתיחת השלב הבא: הצעות | Open the next step: Proposals | `console.next` | next step | פותחים… |
| Proposals | פתיחת השלב הבא: כל ההצעות (8-step lesson: …: הצבעה) | Open the next step: All proposals | `console.next` | next step | פותחים… |
| All proposals | פתיחת השלב הבא: הצבעה | Open the next step: Vote | `console.next` | next step | פותחים… |
| Vote, not open | פתיחת ההצבעה | Open the vote | `console.open_vote` | `freezeBallot` | פותחים… |
| Vote, not open, < 1 proposal | פתיחת ההצבעה — disabled. Reason: "אין עדיין הצעות להצבעה" | Open the vote — reason: "There are no proposals to vote on yet" | NEW `console.blocked.no_proposals` | — | — |
| Vote, open or paused, everyone voted | סגירת ההצבעה | Close the vote | `console.close_vote` | `closeBallot` | סוגרים… NEW `console.busy_closing` |
| Vote, open or paused, some not voted | סגירת ההצבעה → **confirm**: "{{n}} עוד לא הצביעו. לסגור את ההצבעה?" / "אחרי הסגירה אי אפשר לשנות הצבעה." / [לסגור] [ביטול] | Close the vote → "{{n}} have not voted yet. Close the vote?" | NEW `console.close_vote_title`, `console.close_vote_yes`; body = `console.close_and_go_body` | `closeBallot` | סוגרים… |
| Vote, closed | פתיחת השלב הבא: סיכום | Open the next step: Summary | `console.next` | next step | פותחים… |
| Summary, results hidden from the class | הצגה לכיתה | Show to the class | `console.close_and_go_show` | `setVoteDisplay(liveResults, true)` | מציגים… NEW `console.busy_showing` |
| Summary, results shown | סיום השיעור | End the lesson | `console.end` | opens `EndChoice` (existing dialog = the confirm) | — |
| Paused (any step) | המשך השיעור | Resume the lesson | `console.resume` | resume | ממשיכים… |
| Open to students / Ended | חזרה אל {{plan}} | Back to {{plan}} | `teacher.back.to` | `m.route.set(planBack(mid).href)` | — |

The vote-never-opened confirm (`console.vote_skip_title`) is reached from the Vote step menu ("לעבור לסיכום בלי הצבעה", §6), since the primary itself never skips.

### 2.3 "The class is ready" mark

Sits right before the primary (start side of it), inside the action band / dock.

```
 [ פתיחת השלב הבא: הצעות ]   ✓ אפשר להמשיך   6 מתוך 6 שולחנות סיימו
```

- A pill: `✓` icon + the words **אפשר להמשיך** / Ready to move on (`console.ready`). Text `--teal-ink` on `--teal-50` (~10:1), border 1.5 px `--teal-600`. Never colour alone: icon + words.
- Shown only when the step's ready rule (§4) is true. Not shown at Opening (her judgement), nor when paused or ended.
- When it turns on: the pill fades/scales in (`--dur-base`, `--ease-out`) and the primary gets one `--shadow-stamp` press (`--dur-celebrate`) once. Both are off under `prefers-reduced-motion: reduce` (the pill just appears).
- A visually-hidden polite live region says once: "הכיתה מוכנה. אפשר ללחוץ על {{label}}" (`console.ready_live`). See §4.2 for the live rules.
- Not ready is not an error: no mark, no grey-out. She may press the primary any time (except the confirms above).

---

## 3. The step line and "כל השלבים"

### 3.1 Step line

`p.step-line` — "שלב 5 מתוך 9: **שאלות חקירה**" (`console.step_of` + `: ` + step name in `--font-weight-bold`), clock `⏱ 12:40` (`dir="ltr"`, `--ink-muted`), the **כל השלבים ▾** button (`btn--tertiary`, `aria-expanded`, `aria-controls="step-list"`). On the phone the whole line is the button. While paused/ended the line reads the banner words (today's `heldKey` behaviour) and the list still opens, read-only.

### 3.2 The list

Laptop: popover under the button, 320 px wide, same frame as `.projector-menu__panel`. Phone: bottom sheet (same rules as `.console__settings-panel` on the phone). Esc or a tap outside closes; focus returns to the button.

```
┌ כל השלבים ─────────────────────────┐
│ ✓ 1  התלמידים נכנסים        לחזור ‹ │  done: a button, 48 px row
│ ✓ 2  פתיחה                  לחזור ‹ │
│ ✓ 3  בחירת צד               לחזור ‹ │
│ ✓ 4  חלוקה לשולחנות         לחזור ‹ │
│ ◉ 5  שאלות חקירה             עכשיו  │  current: not a button, bold, --terra-50 row
│ ○ 6  הצעות                   בהמשך  │  later: plain text, not focusable
│ ○ 7  כל ההצעות               בהמשך  │
│ ○ 8  הצבעה                   בהמשך  │
│ ○ 9  סיכום                   בהמשך  │
│ ─────────────────────────────────── │
│ לשלב הבא עוברים רק בכפתור הגדול,    │  --ink-muted, --font-size-sm
│ שלב אחרי שלב.                       │
└─────────────────────────────────────┘
```

| Row | Element | Look | Screen reader |
|---|---|---|---|
| Done | `<button>` in an `<li>` | `✓` in a filled `--ink` dot; name `--ink`; tag "לחזור ‹" `--teal-700`, underlined on hover/focus | "שלב 3: בחירת צד, הסתיים. לחזור לשלב הזה" (`console.rail_step` + `console.step_back_hint`) |
| Current | `<li aria-current="step">`, no button | `◉` `--terra-600` dot; name bold; row `--terra-50`; tag "עכשיו" | "שלב 5: שאלות חקירה, נוכחי" |
| Later | `<li>`, no button, not in tab order | `○` outline dot `--border-medium`; name `--ink-soft` (5.3:1, AA — never `--ink-faint`); tag "בהמשך" | "שלב 7: הצבעה, בהמשך" (`console.state_upcoming` value changes from "הבא" to "בהמשך") |

The list is an `<ol aria-label="שלבי השיעור">` — the ordinal and "בהמשך" tell a screen-reader user why those rows are not buttons; the footnote (`console.steps_forward_note`) says it in words for everyone.
Tapping a done row runs today's `confirmGoBack` (title "לחזור לשלב: {{name}}?", body "מה שהתלמידים כתבו, דירגו ובחרו נשמר.", yes "לחזור", `btn--secondary`).

---

## 4. The status line (`ClassStatusLine`)

One line, `--font-size-base` (laptop `--font-size-lg`), `--ink`. Count numbers in `--font-weight-bold`. At most 2 lines on a 360 px phone. Optional second part: the attention item (stuck), and at Proposals the "בלי מכשיר (x/y)" entry (existing `ActForEntry`, rendered as a `btn--tertiary` link-button inside the line).

### 4.1 Per step

| Step | Status line HE / EN | Ready when (shows "אפשר להמשיך") | Attention |
|---|---|---|---|
| Students are joining | "{{n}} נכנסו מתוך {{total}}" / "{{n}} of {{total}} have joined"; no class size: "{{n}} נכנסו" / "{{n}} have joined" | n ≥ class size (no class size: never) | — |
| Opening | "על המקרן: {{what}}" (הטקסט / video title) / "On the projector: {{what}}" | never (her judgement) | — |
| Choose a side | "{{chose}} מתוך {{total}} בחרו צד" (`console.sides_count`, moves here from the board) | chose = total, total > 0 | — |
| Dividing into tables | No tables: "עוד לא חילקנו לשולחנות" / "Not divided into tables yet". Else unseated: "{{count}} בלי שולחן" (`console.unplaced_live`); all seated: "כולם יושבים · {{t}} שולחנות" / "Everyone is seated · {{t}} tables" | tables > 0 and nobody "ללא שולחן" | Unseated > 0: the count is the attention item ("הצגה" scrolls to the "ללא שולחן" strip) |
| Investigation questions | "{{n}} מתוך {{m}} שולחנות סיימו" / "{{n}} of {{m}} tables are done" | n = m | Stuck tables |
| Proposals | "{{n}} מתוך {{m}} שולחנות מדרגים או סיימו" / "{{n}} of {{m}} tables are rating or done" · [בלי מכשיר (x/y)] | n = m | Stuck tables |
| All proposals | `console.all_rated_line` (unchanged) | the line is complete (n = m and every proposal ≥ k) | — |
| Vote | Not open: "ההצבעה עוד לא נפתחה" (`console.vote_status_not_open`, HE value aligned). Open: "{{voted}} מתוך {{present}} הצביעו". Paused: "ההצבעה בהפסקה · {{voted}} מתוך {{present}} הצביעו". Closed: "ההצבעה נסגרה" | Open/paused: everyone voted (text becomes "כולם הצביעו"). Closed: always | — |
| Summary | "התוצאות סגורות לכיתה" / "התוצאות פתוחות לכיתה" (existing results chips' words) | results shown | — |
| Paused / open / ended | Hidden: the banner says it | — | — |

**Stuck / attention:** a table is stuck by today's rule (`STUCK_AFTER_MS` in `tableTurnConsole`). The line adds, after a `·`: "⏱ שולחן {{t}} תקוע" (one) or "⏱ {{n}} שולחנות תקועים" (many), text `--warning` (5.1:1 on paper), with a `btn--tertiary` "הצגה" / "Show" that scrolls to the first stuck card and focuses its title. Glyph + words, never colour alone. The card itself gets the existing `table-card__wait--stuck` row plus a "⏱ תקוע" tag in its head.

### 4.2 Live announcements (no chatter)

- The visible line has **no** `aria-live` (it changes with every student).
- One visually-hidden `role="status"` region (`aria-live="polite"`) in the action band announces only transitions: ready turns on (`console.ready_live`); a table becomes stuck (the stuck text); the step changed ("עכשיו בשלב: {{name}}", `console.moved_to`); the lesson paused/resumed (banner words). Debounce 1 s; never repeat the same text twice in a row.
- The existing `tables-board__live` region (moves, unplaced count) stays.

---

## 5. The table card per step

Card anatomy, top to bottom (only the rows marked for the step are drawn):

```
┌ שולחן 2 ─────────────── [⏱ תקוע] ─ סבב 2 מתוך 3 ┐   head: title link · stuck tag · turn
│ מדברים › כותבים › מדרגים                          │   P: read-only marker (Proposals only)
│ 🎙 נועה מדבר/ת · 0:42                              │   speaker / pen / now row
│ ▓▓▓▓▓▓▓░░░░                                        │   time bar (existing)
│ "למה בכלל צריך טלפון בבית ספר?"                   │   question (Investigation only), 2 lines max
│ התור של אבי                                        │   asker (Investigation only)
│ [✓ נועה] [○ אבי] [דנה 🎙] [יואב · בלי מכשיר]        │   member chips (existing MemberChip)
│ topic / reserved names (connected lessons)         │   TableBridgeLines (unchanged)
│ [+ בלי מכשיר]                    [לכתוב] [סבב נוסף] │   footer: no-device · quick buttons
└────────────────────────────────────────────────────┘
```

| Row | Side | Tables | Investigation q. | Proposals | All proposals | Vote / Summary / Ended |
|---|---|---|---|---|---|---|
| Head: שולחן N (link to sheet) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Turn "סבב n מתוך m" | — | — | ✓ | ✓ | — | — |
| Stuck tag "⏱ תקוע" | — | — | ✓ when stuck | ✓ when stuck | — | — |
| Read-only marker מדברים › כותבים › מדרגים (current part bold `--ink`, others `--ink-soft`; `aria-label` "עכשיו: מדברים") — replaces "עכשיו: …" | — | — | — | ✓ | — | — |
| "עכשיו: …" / "✓ כולם סיימו" | — | — | ✓ | — | — | — |
| Talk: "🎙 {name} מדבר/ת · 0:42" or "אף אחד לא מדבר עכשיו" (`ProposalsSpeakerRow`, as is) | — | — | — | ✓ at talk | — | — |
| Talk done: "כולם דיברו" (`console.proposals_spoken`, other spec) | — | — | — | ✓ | — | — |
| Write: "{name} כותב/ת · שלחו 2 מתוך 4" / "אף אחד לא כותב · שלחו 2 מתוך 4" (other spec; same row slot and style as the speaker row, glyph ✎) | — | — | — | ✓ at write | — | — |
| Rate: "עכשיו: מדרגים" (existing key) in the same row slot | — | — | — | ✓ at rate | — | — |
| Timer line + bar | — | — | ✓ | ✓ at talk | — | — |
| Question, asker | — | — | ✓ | — | — | — |
| "n/m דירגו הכול" | — | — | — | — | ✓ | — |
| Member chips | ✓ with side mark | ✓ with side mark | ✓ with ask/answer marks | ✓ (🎙 tag on speaker) | ✓ | ✓ names only |
| Side mark on chip: ✓ "בחרו צד" / ○ "עוד לא בחרו צד" (`member-chip__mark`, as is) | ✓ | ✓ | — | — | — | — |
| "+ בלי מכשיר" | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Quick buttons (existing `quickActionFor` / `anotherTurnFor`) | — | — | ✓ | ✓ (לכתוב, סבב נוסף, לדרג) | — | — |

Before tables exist (Students are joining, Opening, Side in an unconnected lesson) the board shows the existing roster card ("הכיתה · n") with the same side marks from the Side step. At **Students are joining** the board starts with a code card: the code in `--font-size-3xl` `dir="ltr"`, the QR (`QRShare`, 200 px) beside it on the laptop, under it on the phone, then the roster. At **Opening** the existing `OpeningPanel` takes the main column and holds the projector choice ("על המקרן: [הטקסט] [סרטון 1]…", `ProjectorPick` moved in from the band).

The drag hint (`console.drag_hint`) shows above the grid **once per teacher**: a `--paper-soft` note with a "הבנתי" button (`console.drag_hint_close`). It is marked seen when she taps "הבנתי" or completes one move (drag, keyboard or "העברה לשולחן אחר"). Stored per teacher uid (A6).

---

## 6. The two menus

Both are **disclosure panels**, not ARIA menus (they hold radio groups): a button with `aria-expanded` + `aria-controls`, the panel is a labelled region. Laptop: popover (frame of `.projector-menu__panel`, max 360 px). Phone: bottom sheet (`max-block-size: 85dvh`, safe-area padding, existing mobile sheet rule). Every row ≥ 44 px. Esc closes and returns focus. A menu with nothing in it for the step is **not drawn** (no empty or disabled menu button).

**Red items:** always last, after a `--border-light` divider, drawn as full-width `btn--danger-outline` (`--danger` text and border on `--bg-card`). Tapping one closes the panel and opens `ConfirmDialog` with `destructive: true`: title = question, body ends with "אי אפשר לבטל." where true, Cancel focused, yes = `btn--danger`. This is today's reset pattern; the resplit moves from `window.confirm` to it.

### 6.1 "עוד" (lesson bar, the whole lesson)

| # | Item | Notes |
|---|---|---|
| 1 | קוד QR | Toggles the existing QR section under the bar (at Students are joining the QR is already on the board, so the item reads "הסתרת קוד QR" there only if shown) |
| 2 | מקרן ▸ מקרן בחלון נפרד · הצגה במסך הזה | Existing `ProjectorMenu` items, nested as two rows with their help lines |
| 3 | מסך התלמידים | Opens the `?view=student` sample view; a "חזרה לשולחנות" link in that view |
| 4 | תכנון השאלות | Link to `/t/:mid/plan` |
| 5 | הגדרות השיעור | Opens the existing `ConsoleSettings` panel (title adds "חל רק על השיעור הזה") |
| 6 | הרשמה מראש / לניהול ההרשמה | Students are joining, or a connected lesson (existing `RegisterAheadRow` / `RegistrationStrip` link) |
| — | divider | |
| 7 | **סיום השיעור** (red) | Opens `EndChoice` (existing dialog is the confirm). Hidden when ended. When open to students it reads the same and closes it |

### 6.2 "עוד בשלב הזה" (action band, the current step)

| Step | Items, in order | Red (last) |
|---|---|---|
| Students are joining | — (menu not drawn) | — |
| Opening | — | — |
| Choose a side | — | — |
| Dividing into tables | Unconnected: מקומות בשולחן… (opens settings at that field). Connected: עדכון מההרשמה (existing confirm), לניהול ההרשמה | **חלוקה מחדש** (only when tables exist): "לחלק מחדש את הכיתה?" / "הישיבה הנוכחית תתבטל. אי אפשר לבטל." / [חלוקה מחדש] |
| Investigation questions | — | **איפוס הסבבים בכל השולחנות** (existing confirm) |
| Proposals | כל השולחנות: מדרגים · סבב נוסף בכל השולחנות · כולם ביחד (disabled + "· פעיל" when on, as today) | — |
| All proposals | — | — |
| Vote, not open | ההצעות בהצבעה (radio: כל ההצעות / רק הצעות שעברו את השער, with the count line) · סדר ההצעות (radio) · מי רואה את התוצאות (radio) · לעבור לסיכום בלי הצבעה (opens the `console.vote_skip_title` confirm, `btn--secondary` yes) | — |
| Vote, open / paused | השהיית ההצבעה / המשך ההצבעה · סדר ההצעות · מי רואה את התוצאות · (scope shown read-only: "נקבע לפני פתיחת ההצבעה") | **איפוס ההצבעה** — enabled when paused or closed; else `aria-disabled` with "יש לסגור או להשהות קודם" under it (existing hint) |
| Vote, closed | סדר ההצעות · מי רואה את התוצאות | **איפוס ההצבעה** |
| Summary | מי רואה את התוצאות · מי רואה את התמיכה לפי צד | — |
| Paused | Same items as the step; actions disabled with the line "השיעור בהפסקה" at the top of the panel; the resets stay enabled (as today) | as the step |
| Ended | not drawn | — |

The menu buttons carry no badge or count; the status line already says what matters (A8).

---

## 7. Result panel and the not-live states (slice 4)

### 7.1 `DecisionPanel` — Vote (closed), Summary, Ended, Open

Sits at the top of the board, above the tables (which collapse to names only, as today at Vote/Summary). Card: `--bg-card`, `--card-line` border, `--radius-lg`, `--shadow-sm`, padding `--space-lg` (phone `--space-md`).

```
┌ ההחלטה ─────────────────────── רק את/ה רואה את זה ┐   h2 + audience note (--ink-muted)
│                                                    │
│  "טלפונים נשארים בתיק עד ההפסקה, חוץ מבשיעור       │   winner: --font-size-xl, bold, dir=auto
│   שהמורה מבקש."                                    │
│  58% · 14 קולות                                    │   --teal-ink, bold
│                                                    │
│  ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░  58%  טלפונים בתיק עד ההפסקה    │   top 3 rows: bar (--teal-600 fill on
│  ▓▓▓▓▓▓░░░░░░░░░░░  25%  ארגז טלפונים בכיתה        │   --paper-deep track), percent, text
│  ▓▓▓░░░░░░░░░░░░░░  17%  כל כיתה מחליטה לבד        │   (1 line, ellipsis)
│                                                    │
│  24 מתוך 26 הצביעו                                 │   summary.turnout
└────────────────────────────────────────────────────┘
┌ תמיכה לפי צד ... (existing SupportPanel, unchanged) ┐
```

| Case | Panel shows | Keys |
|---|---|---|
| Vote closed / Summary / Ended, a winner | as drawn | `console.decision`, `voting.result_votes`, `summary.turnout` |
| Tie | winner = the tie-break, plus line "תיקו, הוכרע לפי הדירוגים" | `summary.tie_by_ratings` |
| No vote held (skipped) | "לא הייתה הצבעה" + "ההצעה שהכי הסכימו עליה:" + that proposal | `summary.no_vote`, `summary.most_agreed` |
| Vote still open (only when she navigates back here) | "ההצבעה עוד פתוחה" | `summary.vote_open` |
| Audience note | results hidden: "זה מוצג כרגע רק במסך שלך." · shown: "גם הכיתה רואה את זה." | `console.support_panel_private` / `_shared` |

Reuse the projector's `VoteStage` result logic (`voteResults`, winner + tie rule) through a pure helper, so the console and the projector can never disagree.

### 7.2 Paused, Open, Ended

| State | Lesson banner (under the lesson bar, `role="status"`) | Pause button | Step line | Status line | Primary | Step menu |
|---|---|---|---|---|---|---|
| Paused | `--paper-deep` band, ❚❚ mark, "השיעור בהפסקה" — no button (resume moved to the primary) | hidden | "השיעור בהפסקה" + stopped clock | hidden | המשך השיעור | drawn, actions disabled (§6.2) |
| Open to students | `--teal-50` band + `--teal-600` underline, "השיעור פתוח לתלמידים" — no button (end is in "עוד") | hidden | step as it was | hidden | חזרה אל {{plan}} | not drawn |
| Ended | `--paper-deep` band, "השיעור הסתיים" + [פתיחה מחדש] (`btn--secondary`) | hidden | "השיעור הסתיים" + stopped clock | hidden | חזרה אל {{plan}} | not drawn |

After "סיום" in `EndChoice` the teacher **stays on the console** (no redirect); focus goes to the primary ("חזרה אל {{plan}}"), and the live region says "השיעור הסתיים".

---

## 8. Tokens and accessibility

### 8.1 Tokens per surface

| Surface / text / state | Token(s) |
|---|---|
| Page under the console | `--paper-soft` (today's `.console`) |
| Lesson bar, step line, action band | `--paper`; dividers `1px --paper-line` |
| Phone dock | `--bg-card`; top edge `1px --border-medium` (3:1); no shadow (see missing `--shadow-up`) |
| Code chip | `--terra-50` fill, value `--ink` bold, `dir="ltr"` (today's `.console__code`) |
| Primary | `.btn--primary`: `--terra-600` / `--text-inverse`; hover `--terra-700` |
| Primary disabled-with-reason | `--paper-deep` fill, `--ink-muted` text, `--border-medium` border; reason `--ink-muted` `--font-size-sm` |
| Secondary buttons (menus, pause) | `.btn--secondary`, `.btn--tertiary` |
| Ready pill | `--teal-50` fill, `--teal-ink` text, `--teal-600` border |
| Stuck / attention text | `--warning` on `--paper` (5.1:1); tint: missing `--warning-50` |
| Red items | `.btn--danger-outline` (`--danger` on `--bg-card`); confirm yes `.btn--danger` |
| Step list: done / current / later | `--rail-done` (`--ink`) / `--rail-current` (`--terra-600`) + `--terra-50` row / `--rail-upcoming` (`--border-medium`) dot, `--ink-soft` text |
| Table card | `--bg-card`, `--card-line`, `--radius-md` (existing) |
| Banners | paused/ended `--paper-deep`; open `--teal-50` + `--teal-600` |
| Decision panel bars | fill `--teal-600`, track `--paper-deep`, numbers `--teal-ink` |
| Focus | `--focus-ring-color`, `--focus-ring-width`, `--focus-ring-offset` on every control |
| Spacing / type / motion | `--space-*`, `--font-size-*`, `--dur-base`, `--dur-celebrate`, `--ease-out` |
| Tap size | `$tap: 44px` in `console-mobile.scss` (phone); primary 56 px phone / 48 px laptop |

Dark mode and the playful/high-contrast themes follow automatically: every value above is a token that `_tokens.scss` already overrides.

### 8.2 Missing tokens (do not invent; add to `_tokens.scss` with light + dark values)

| Token | For | Interim until added |
|---|---|---|
| `--warning-50` | Tint behind a stuck card head / attention item | `--paper-soft` |
| `--danger-50` | Hover/focus tint of a red menu item | `--terra-50` |
| `--z-dropdown`, `--z-modal` | Referenced with fallbacks (`10`, `9000`) in `console.scss` / `console-mobile.scss` but never defined | the fallbacks |
| `--z-sticky` | The laptop sticky block and the phone dock (must sit under popovers/sheets, over the board) | `5` in the component file |
| `--shadow-up` | Optional upward shadow for the phone dock (all shadows today fall downward) | border only |

### 8.3 Checklist

- **Touch:** every control ≥ 44 × 44 px; primary 56 px on the phone; step-list rows 48 px; chip menus keep their existing 44 px.
- **Contrast (AA):** all text pairs above are ≥ 4.5:1 per `_tokens.scss` notes; later steps use `--ink-soft`, never `--ink-faint`; the disabled primary is not `opacity: .5` (that fails) but the explicit pair above.
- **Not colour alone:** ready = ✓ + words; stuck = ⏱ + words; current step = ◉ + bold + "עכשיו"; done = ✓ + "לחזור"; red items = words that say what is lost + confirm.
- **Focus order:** back bar → lesson name (h1, not focusable) → code → pause → עוד → כל השלבים → status line items (בלי מכשיר, הצגה) → primary → עוד בשלב הזה → view switch → "ללא שולחן" strip → cards in number order. Popovers/sheets trap nothing but return focus on close; dialogs are native `<dialog>`.
- **After an action:** focus stays on the primary (keyed element). After resume, focus moves to the primary. After a confirm, focus returns to the control that opened it.
- **Live regions:** §4.2. The existing failure line stays `role="alert"`.
- **RTL:** logical properties only (`inset-inline`, `padding-inline-start`, `margin-inline-end`); the ‹ in "לחזור ‹" and the › in the Proposals marker mirror in LTR locales (use CSS `:dir(ltr)` transform or a logical icon); the code, clock and numbers carry `dir="ltr"`.
- **Reduced motion:** ready pill entrance, the primary's one-time press, sheet slide-up and the sticky shadow are all removed under `prefers-reduced-motion: reduce`.
- **Forced colours:** ready pill and red items keep borders (`CanvasText`) so they stay visible.

---

## 9. Labels — new or changed (he + en; the other five locales at build time)

| Key | HE | EN | Note |
|---|---|---|---|
| NEW `console.step.waiting` | התלמידים נכנסים | Students are joining | Console only; students keep `step.waiting` (IA §3) |
| `console.challenge.missing_title` | עוד אין שאלה לפתרון | There is no question to solve yet | IA §3 / Decision 4 |
| `console.challenge.pick_label` | בחירת השאלה לפתרון | Choose the question to solve | also the primary |
| `console.challenge.write_label` | כתיבת השאלה לפתרון | Write the question to solve | |
| `console.challenge.blocked` | קודם מוסיפים את השאלה לפתרון. בלעדיה אי אפשר להתחיל את השיעור. | First add the question to solve. Without it the lesson cannot start. | |
| `console.challenge.missing_live` | התלמידים בשלב ההצעות לא רואים שאלה לפתרון. בחרו אחת משאלות השיעור או כתבו שאלה חדשה. | Students at Proposals see no question to solve. Pick one of the lesson's questions or write a new one. | |
| `console.challenge.missing_start` | אי אפשר להתחיל את השיעור לפני שיש בו שאלה לפתרון. | The lesson cannot start before it has a question to solve. | |
| `plan.challenge.missing_title` | עוד אין שאלה לפתרון | There is no question to solve yet | same concept in the plan |
| `console.gate.label` | השער: כמה הסכמה צריך כדי לעבור | The goal: how much agreement passes | Decision 5; slider shows % |
| `console.gate.value` | השער: {{value}}% | The goal: {{value}}% | value is an integer percent |
| `console.gate.help` | הצעה עוברת את השער כשההסכמה אליה מגיעה לאחוז הזה. | A proposal passes the goal when its agreement reaches this percent. | was "רף" |
| `console.gate_at` | השער: {{gate}}% | The goal: {{gate}}% | |
| `console.vote_scope_above` | רק הצעות שעברו את השער | Only proposals that passed the goal | was "מעל היעד" |
| `console.vote_scope_count` | {{above}} מתוך {{total}} עברו את השער | {{above}} of {{total}} passed the goal | |
| `console.vote_scope_none` | פחות משתי הצעות עברו את השער, לכן ההצבעה תכלול את ההצעות המובילות | Fewer than two proposals passed the goal, so the vote will hold the top proposals | |
| `console.act_for_held` | השיעור בהפסקה: כרגע אי אפשר לשנות כלום | The lesson is paused: nothing can change right now | one word for paused |
| `console.vote_status_paused` | ההצבעה בהפסקה | The vote is paused | |
| `console.vote_status_not_open` | ההצבעה עוד לא נפתחה | The vote is not open yet | EN was "Not open" |
| `console.split` | חלוקה לשולחנות | Divide into tables | EN was the step name |
| `console.state_upcoming` | בהמשך | later | was "הבא" / "next" |
| `console.settings_scope` NEW | חל רק על השיעור הזה | Applies to this lesson only | under the settings title |
| NEW `console.more` | עוד | More | lesson menu button |
| NEW `console.more_label` | עוד פעולות לשיעור | More for the lesson | its `aria-label` |
| NEW `console.step_more` | עוד בשלב הזה | More for this step | |
| NEW `console.all_steps` | כל השלבים | All steps | |
| NEW `console.step_now` | עכשיו | Now | current row tag |
| NEW `console.step_back_hint` | לחזור לשלב הזה | Go back to this step | done row tag (visible "לחזור") + SR |
| NEW `console.step_back_tag` | לחזור | Go back | |
| NEW `console.steps_forward_note` | לשלב הבא עוברים רק בכפתור הגדול, שלב אחרי שלב. | You move forward only with the big button, one step at a time. | list footnote |
| NEW `console.ready` | אפשר להמשיך | Ready to move on | |
| NEW `console.ready_live` | הכיתה מוכנה. אפשר ללחוץ על {{label}} | The class is ready. You can press {{label}} | live region only |
| NEW `console.moved_to` | עכשיו בשלב: {{name}} | Now at step: {{name}} | live region only |
| NEW `console.status.joined` | {{n}} נכנסו מתוך {{total}} | {{n}} of {{total}} have joined | |
| NEW `console.status.joined_open` | {{n}} נכנסו | {{n}} have joined | no class size |
| NEW `console.status.on_projector` | על המקרן: {{what}} | On the projector: {{what}} | |
| NEW `console.status.no_tables` | עוד לא חילקנו לשולחנות | Not divided into tables yet | |
| NEW `console.status.seated` | כולם יושבים · {{t}} שולחנות | Everyone is seated · {{t}} tables | |
| NEW `console.status.tables_done` | {{n}} מתוך {{m}} שולחנות סיימו | {{n}} of {{m}} tables are done | |
| NEW `console.status.tables_rating` | {{n}} מתוך {{m}} שולחנות מדרגים או סיימו | {{n}} of {{m}} tables are rating or done | |
| NEW `console.status.vote_paused` | ההצבעה בהפסקה · {{voted}} מתוך {{present}} הצביעו | The vote is paused · {{voted}} of {{present}} voted | |
| NEW `console.status.stuck_one` | שולחן {{t}} תקוע | Table {{t}} is stuck | (?) native read |
| NEW `console.status.stuck_many` | {{n}} שולחנות תקועים | {{n}} tables are stuck | (?) |
| NEW `console.status.show` | הצגה | Show | jumps to the card / strip |
| NEW `console.stuck_tag` | תקוע | Stuck | card head |
| NEW `console.blocked.no_students` | עוד אין תלמידים לחלק | No students to divide yet | |
| NEW `console.blocked.no_proposals` | אין עדיין הצעות להצבעה | There are no proposals to vote on yet | |
| NEW `console.busy_closing` | סוגרים… | Closing… | |
| NEW `console.busy_showing` | מציגים… | Showing… | |
| NEW `console.busy_splitting` | מחלקים… | Dividing… | |
| NEW `console.busy_copying` | מביאים… | Bringing… | |
| NEW `console.close_vote_title` | {{n}} עוד לא הצביעו. לסגור את ההצבעה? | {{n}} have not voted yet. Close the vote? | body reuses `console.close_and_go_body` |
| NEW `console.close_vote_yes` | לסגור | Close | |
| NEW `console.vote_skip` | לעבור לסיכום בלי הצבעה | Go to the summary without a vote | step-menu item |
| NEW `console.vote_skip_title` | ההצבעה לא נפתחה. לעבור לסיכום בלי הצבעה? | The vote never opened. Go to the summary without a vote? | IA §3 |
| NEW `console.vote_skip_body` | בסיכום תוצג ההצעה שהכי הסכימו עליה. | The summary will show the most agreed proposal. | |
| NEW `console.vote_skip_yes` | לעבור לסיכום | Go to the summary | |
| `console.resplit_confirm` → split into NEW `console.resplit_title` / `console.resplit_body` | לחלק מחדש את הכיתה? / הישיבה הנוכחית תתבטל. אי אפשר לבטל. | Divide the class again? / The current seating will be lost. This cannot be undone. | moves to `ConfirmDialog`; delete the old key |
| NEW `console.decision` | ההחלטה | The decision | IA §3 |
| NEW `console.drag_hint_close` | הבנתי | Got it | |
| NEW `console.student_screen_back` | חזרה לשולחנות | Back to the tables | in the student-screen view |

Unchanged but used in new places: `console.next`, `console.open_vote`, `console.close_vote`, `console.close_and_go_show`, `console.end`, `console.resume`, `teacher.back.to`, `console.copy_seating`, `console.sides_count`, `console.unplaced_live`, `console.all_rated_line`, `console.vote_progress`, `console.all_voted`, `console.results_chip_*`, `console.support_panel_*`, `summary.*`, `voting.result_votes`.

---

## 10. Build notes per slice

### Slice 1 — One next button (M)

| File | New / change | Size |
|---|---|---|
| `src/lib/classroom/nextAction.ts` | NEW pure: `(stepKey, stepIndex, steps, status, ballot{frozen,paused,closed}, voted/present, hasChallenge, tables, students, connected+copied, resultsShown, proposalsCount) → { kind, labelKey, params, busyKey, blockedKey?, confirm? }`. Replaces `forwardControl` for the console | M |
| `src/lib/classroom/__tests__/nextAction.test.ts` | NEW: one case per row of §2.2 | M |
| `src/views/teacher/NextAction.ts` | NEW: the button + ready pill slot + reason text; runs the action, opens confirms | M |
| `src/views/teacher/StepRail.ts` → `StepLine.ts` + NEW `StepList.ts` | Step line; list popover/sheet; later steps not buttons; forward button removed | M |
| `src/views/teacher/consoleConfirms.ts` | Add `confirmCloseVote(n)`, `confirmSkipVote()`, move resplit to `ConfirmDialog` | S |
| `src/views/teacher/SwitchBand.ts`, `VoteBar.ts` | Remove what the primary now does: split (when no tables), copy seating (first copy), open vote, close vote | S |
| `src/views/teacher/TableCard.ts` | Side/Tables: no turn, no "now", no quick buttons (§5) | S |
| `src/views/teacher/LessonBanner.ts` | Resume button leaves (now the primary) | S |
| `src/views/teacher/TeacherConsole.ts` | Wire `NextAction` + `StepLine`; drop `onGo` forward path | S |
| `src/styles/console-next.scss` (NEW, imported in `TeacherConsole.ts`), `console.scss`, `console-mobile.scss` | Action band, sticky block, phone dock, step list | M |

Acceptance (tick):
- [ ] At Vote with the vote unopened, the primary reads **פתיחת ההצבעה**; after it opens, **סגירת ההצבעה**; after closing, **פתיחת השלב הבא: סיכום**.
- [ ] At Vote with 3 of 26 not voted, the primary opens "3 עוד לא הצביעו. לסגור את ההצבעה?"; Cancel has focus; Esc cancels.
- [ ] At Summary with results hidden, the primary reads **הצגה לכיתה**; after it, **סיום השיעור**, which opens the end dialog.
- [ ] At Dividing into tables with 0 students the primary is focusable, announced as unavailable, and its reason "עוד אין תלמידים לחלק" is read with it.
- [ ] In "כל השלבים" during Investigation questions, rows 6–9 are not buttons, are skipped by Tab, and read "…, בהמשך"; rows 1–4 open the go-back confirm.
- [ ] No control anywhere moves the lesson forward more than one step.
- [ ] Paused: the primary reads **המשך השיעור** and has focus right after pausing lands.
- [ ] At Dividing into tables the cards show no "סבב", no "עכשיו: בחרו שאלה", no "לדבר".
- [ ] Phone 360 × 640: the primary is fully visible at the bottom at every scroll position and never covers the last card.
- [ ] The primary keeps keyboard focus across its label change (open → close vote).

### Slice 2 — Quiet screen (M–L)

| File | New / change | Size |
|---|---|---|
| `src/views/teacher/LessonMore.ts` | NEW: the "עוד" panel (§6.1); takes QR, `ProjectorMenu` items, student screen, plan link, `ConsoleSettings`, registration, end | M |
| `src/views/teacher/StepMore.ts` | NEW: the "עוד בשלב הזה" panel (§6.2), red group + confirms | L |
| `src/views/teacher/ClassStatusLine.ts` + `src/lib/classroom/classStatus.ts` (+ test) | NEW: per-step line, ready rule, stuck count, transition announcer | M |
| `src/views/teacher/SwitchBand.ts` | Shrinks to the view switch (tables / texts); "מסך התלמידים" leaves | L (mostly deletions) |
| `src/views/teacher/VoteBar.ts`, `voteBarState.ts` | Split: status → `classStatus`; pause/order/scope/audience/reset → `StepMore`; file likely deleted | M |
| `src/views/teacher/ConsoleBar.ts` | Keeps name, code, pause, "עוד"; the rest moves to `LessonMore` | M |
| `src/views/teacher/TablesBoard.ts` | Drag hint once per teacher; sides count moves to the status line; Students-are-joining code card | S |
| `src/views/teacher/OpeningPanel.ts`, `ProjectorPick.ts` | Projector choice inside the Opening panel | S |
| `src/views/teacher/consoleView.ts` | `student` view opened from "עוד"; back link | S |
| `src/views/teacher/ConsoleSettings.ts` | Scope line; can open at a field (seats per table) | S |
| `src/styles/console-more.scss` (NEW), `console-mobile.scss` | Panels, sheets, red group | M |

Acceptance:
- [ ] At Vote, before the first table a laptop shows at most 8 controls (pause, עוד, כל השלבים, primary, עוד בשלב הזה, view switch ×2, בלי מכשיר).
- [ ] The phone's top bar is 2 rows at 360 px in Hebrew and English.
- [ ] Every red item sits last in its panel after a divider and asks before it acts; Cancel has focus.
- [ ] "עוד בשלב הזה" is not drawn at Students are joining, Opening, Choose a side, All proposals.
- [ ] The status line shows "אפשר להמשיך" with a ✓ at Choose a side when every student chose a side, and a screen reader hears it once.
- [ ] A stuck table adds "⏱ שולחן 4 תקוע · הצגה" to the status line; "הצגה" focuses that card's title.
- [ ] The drag hint shows once; after "הבנתי" (or one move) it does not return after reload.
- [ ] "סיום השיעור" exists in exactly one place (the "עוד" panel), plus the primary at Summary.

### Slice 3 — Words (S)

| File | Change | Size |
|---|---|---|
| `src/lib/locales/{he,en,ar,de,es,fa,nl}.ts` and `vote/`, `challenge/`, `actFor/`, `allProposals/` | §9 | S |
| `src/views/teacher/ConsoleSettings.ts` | Goal slider shows a whole percent (0–100, step 5) | S |
| `src/lib/lesson.ts` (`stepLabel`) or a console-only label helper | `console.step.waiting` for the teacher | S |

Acceptance:
- [ ] `grep` of all 7 locale files finds no "שאלה להצעות", "השאלה המרכזית", "רף", "יעד", "מושהית", "עצור" in console strings.
- [ ] Settings show "השער: 40%", never "0.40".
- [ ] The teacher's first step reads "התלמידים נכנסים"; the student's screen still reads "ממתינים למורה".

### Slice 4 — See the result (M)

| File | New / change | Size |
|---|---|---|
| `src/views/teacher/DecisionPanel.ts` + `src/lib/classroom/decision.ts` (+ test) | NEW: §7.1, shared with `projector/VoteStage.ts` | M |
| `src/views/teacher/projector/VoteStage.ts` | Uses `decision.ts` | S |
| `src/views/teacher/EndChoice.ts` | Stay on the console after ending; focus the primary | S |
| `src/views/teacher/TeacherConsole.ts` | Draw `DecisionPanel` at Vote (closed), Summary, Open, Ended | S |
| `src/styles/console-decision.scss` (NEW) | Panel | S |

Acceptance:
- [ ] At Summary the console shows "ההחלטה", the winning proposal, its percent and votes, and "24 מתוך 26 הצביעו" — the same winner as the projector.
- [ ] A skipped vote shows "לא הייתה הצבעה" and the most agreed proposal.
- [ ] After "סיום" the teacher stays at `/t/:mid`, sees "השיעור הסתיים", the decision, and a primary "חזרה אל {{plan}}" with focus.
- [ ] Reopening a lesson from the home shows the same ended view.

---

## 11. Assumptions

- **A1.** Screen designs live in `docs/ia/screens/` (the README prescribes no place; the folder exists). Named after the IA spec.
- **A2.** Decision 1 ("pause always visible in the top bar") means *never inside a menu*. On the phone the top bar scrolls with the page; making it sticky too would leave ~400 px for the board. If Tal wants it pinned on the phone, the fallback is an icon-only ❚❚ (with `aria-label`) inside the dock.
- **A3.** Pressing the primary before "אפשר להמשיך" is allowed without a confirm, except closing a vote with non-voters (it loses votes). The teacher's judgement wins; a confirm on every step would train her to click through.
- **A4.** "Open to students" (after "להשאיר פתוח") behaves like Ended for the primary ("חזרה אל {{plan}}"); closing it is "סיום השיעור" in "עוד".
- **A5.** Students are joining has no "ready" without a class size (the IA's "count stops growing" is not measurable without a timer).
- **A6.** "Once per teacher" for the drag hint is stored per teacher uid in `localStorage` (`class.dragHintSeen.<uid>`), so a second device shows it once more. A user-doc field is the upgrade if Tal wants it truly once.
- **A7.** The vote-skip path lives in the Vote step menu (the primary never skips; later steps are not tappable), so a lesson with too few proposals can still finish.
- **A8.** No badges/counts on the menu buttons; the status line carries what matters.
- **A9.** "Stuck" uses today's `STUCK_AFTER_MS` rule; no new timing.
- **A10.** Proposals rows (speaker, pen, "כולם דיברו", marker) follow `join-class-proposals-flow.md` as written; if that spec's open questions change the states, only the row slot here is fixed.
- **A11.** The read-only marker on the teacher card mirrors the students' marker (proposals-flow §4) instead of the "עכשיו: …" line at Proposals, so teacher and student see the same words.
- **A12.** `console.split`'s EN value changes from the step name to the verb "Divide into tables"; HE is unchanged.
