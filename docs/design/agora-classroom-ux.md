# Agora: classroom process — UX design

Status: draft · Date: 2026-10-21 · Designs against `docs/ia/agora-classroom.md` (fixed: the eight student screens and their order, one route per role, the teacher's single forward control, the four table steps and the asker-only forward control, 5-face rating -1..+1 open at any table step, slider for the side, the labels of §3, the states of §7, the budget of §9b, Tal's decisions in §9). Everything below is what §10 left to UX. Writing rules of `agora-student-clarity.md` §11.16 and the icon policy of §12 are binding: ≤ 7 words per instruction, numbers before words, no emoji, no slashes, no arrow glyphs in strings, icons only from `components/Icon.ts`.

Frames are 360 px wide (phone) or 1280 px (laptop), RTL: the **right edge is the start edge**. Strings are the spec's §3 values; a string the spec does not have is marked **NEW**. Hebrew marked (?) needs a native read.

## 1. Design principles
1. **Screens down.** The phone is a tool the table picks up for one thing and puts down again. Every screen is built so that it can be put down: no feed, no counter that invites checking, nothing that moves while nobody touches it.
2. **One instruction per screen.** The header says where the table is; one line (≤ 7 words) says what to do; one primary control does it. A second control is secondary in colour and size, never equal.
3. **Calm room.** No sound, no celebration, no toast, no badge. The only thing that changes on its own is the countdown and the step the teacher opens, and both change with a 220 ms fade, or instantly under reduced motion.
4. **Paper, not a stage.** Join's visual language: flat white cards on warm paper, ink text, terracotta for the one action, indigo and terracotta for the two sides, teal for "sent". No gradients, no blur, no shadow larger than `--shadow-sm`, no decoration that does not carry information.
5. **Cheap to render.** First screen ≤ 300 kB gzipped: one variable font (Assistant, 400 and 700), the five rating faces as one inline SVG sprite, stroke icons from the existing set, `transform` and `opacity` only, nothing animates continuously.
6. **Read from the table.** The countdown is readable from 60 cm with the phone flat on the table; the step rail is readable by a teacher glancing from the room back to the laptop; the projector shows one thing in type large enough for the back row.
7. **The teacher owns the clock.** Nothing advances on its own; a timer that ends shows "הזמן נגמר" and a control, and waits.

## 2. Student screens (`/play/:id`)
Shared frame for every student screen: a 56 px header (`--header-height`) with one line of ink text on paper, the content, and the primary action pinned to the bottom inside a 16 px safe-area pad (`.btn--primary`, full width, 56 px tall, 48 px minimum). The header never moves; the primary action never moves; only the content between them changes. The language cog (existing) stays in the header's end corner at 48 px.

### 2.1 Code (`/`)
```
┌──────────────────────────────────────────┐
│ (cog)                                    │ header: empty line, cog only
│                                          │
│                      הקלידו את הקוד       │ instruction (22px, 700)
│   ┌──────────────────────────────────┐   │
│   │  _ _ _ _ _ _                     │   │ one input, 6 digits, 32px tabular, ltr
│   └──────────────────────────────────┘   │
│                 קוד לא נכון. בדקו שוב NEW │ error line (danger ink), only after submit
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │               כניסה                  │ │ primary (existing home.* key)
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```
Instruction: "הקלידו את הקוד" (existing `home.*`). Primary: "כניסה", bottom. Header: empty. States: error = the line above the button, input border → `--danger`, focus stays in the input. The keyboard is numeric (`inputmode=numeric`). Nothing animates. The QR path lands here with the code filled and the button focused.

### 2.2 Join + Waiting (`/join/:code` → `/play/:id`)
```
│ שיעור · קוד 482 913                      │ header
│                         איך קוראים לכם?  │ instruction (existing join.*)
│   ┌──────────────────────────────────┐   │ name input, 48px, autocomplete off
│   └──────────────────────────────────┘   │
│                רק המורה רואה את השם NEW  │ one quiet line (ink-soft)
│ ┌──────────────────────────────────────┐ │
│ │               הצטרפות                 │ │ primary (existing)
│ └──────────────────────────────────────┘ │
                 — after joining —
│ ממתינים למורה                            │ header = the state
│                                          │
│             (lock icon, 48px, ink-soft)  │
│                 ממתינים למורה             │ 22px 700
│                  14 בכיתה NEW            │ count (numbers first)
│                                          │
│ (no button)                              │
```
Instruction: "ממתינים למורה". Primary: none while waiting (the spec's "wait" has no tap). Header: the step name. States: joining = the button shows the existing `.btn` disabled state with "מצטרפים…" **NEW** for ≥ 400 ms (shorter flashes are hidden); ended / removed = the existing `join.session_ended` and removed screens, unchanged in words, restyled to this frame. The count updates in place with no motion. Team-size question removed (spec §9).

### 2.3 Opening
```
│ פתיחה                                    │ header
│                      צופים ביחד           │ instruction (opening.watch)
│ ┌──────────────────────────────────────┐ │ card
│ │ השאלה של השיעור:                NEW  │ │ eyebrow (14px, ink-muted)
│ │ מה עושים כשחבר מבקש לשקר בשבילו?     │ │ the question (22px, 700)
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │ video card: poster (static jpg ≤ 40 kB)
│ │      [poster]        (play) לצפות כאן │ │ one 56px play control (icon `play` P2 + text)
│ └──────────────────────────────────────┘ │
│ (no primary; the teacher opens Side)     │
```
Instruction: "צופים ביחד". Primary: none; "לצפות כאן" **NEW** is secondary and only plays on tap (never autoplay). Header: "פתיחה". States: no video = the question card alone, centred; video loading = the poster with the play control disabled; video failed = "המורה מקרין" replaces the play control. Nothing moves until the teacher opens Side.

### 2.4 Side
```
│ צד                                       │ header
│                   לאיזה צד אתם קרובים?    │ instruction (side.*)
│                                          │
│   ┌────┐                        ┌────┐   │ two characters (see §7)
│   │ (י)│  יונתן           נועה  │ (נ)│   │ 56px circle + name, side colours
│   └────┘                        └────┘   │
│   ━━━━━━━━━━━━━━┿━━━━━━━━━━━━━━━━━━━━━   │ track, centre tick
│                 ◯                        │ thumb 48px, starts at centre
│              באמצע NEW                   │ live label under the thumb
│ ┌──────────────────────────────────────┐ │
│ │               אישור                   │ │ primary
│ └──────────────────────────────────────┘ │
```
Instruction: "לאיזה צד אתם קרובים?". Primary: "אישור", bottom, enabled from the first touch of the thumb (centre is a valid answer, but an untouched slider is not). Header: "צד". States: sending = the button's disabled state with "שומרים…" **NEW**; save failed = line above the button "לא נשמר. לנסות שוב" **NEW** and the button re-enabled; done = the button becomes a teal filled line "נשמר" (`.btn--agree`, disabled) and the slider stays interactive until the teacher opens Tables (a second "אישור" is allowed). The live label reads "קרוב ליונתן" / "באמצע" / "קרוב לנועה" **NEW** (names from the scenario).

### 2.5 My table
```
│ שולחן                                    │ header
│                                          │
│                    שולחן 3               │ 56px, 700 — the one thing to read
│                                          │
│ ┌──────────────────────────────────────┐ │ card: table.members
│ │ מי בשולחן שלי                        │ │
│ │ ● דנה      ■ עומר      ● לי      ◆ רן │ │ names with side marks (§7)
│ └──────────────────────────────────────┘ │
│                  לכו לשבת ליד השולחן NEW │ instruction (7 words max)
│ (no button)                              │
```
Instruction: "לכו לשבת ליד השולחן" **NEW**. Primary: none (spec: no tap). Header: "שולחן". States: not placed = the number is replaced by "עוד אין לכם שולחן. חכו למורה" at 22 px, no card; the moment the teacher places the student the number fades in (220 ms). When the teacher moves a student, the number changes in place with the same fade; no sound, no banner.

### 2.6 Table talk
Header inside every table step: "שולחן 3 · סבב 2 · עכשיו: כותבים" (spec §5), one line, 16 px, 400; the "עכשיו: …" part in 700 so the eye finds the step. The class's answers sheet (§2.6.5) is reachable from every table step through one secondary control in the header's end corner, "התשובות של הכיתה", with the unrated count before the words ("12 · התשובות של הכיתה").

**Asker vs non-asker.** The asker's device carries the forward control at the bottom; every other device shows the same content with the bottom slot empty except where the spec gives everyone a control (write: "שליחה"; talk after the minute: "הבא בתור"). The asker's device marks itself with one line under the header, "התור שלכם לשאול" **NEW** (the others see "התור של דנה לשאול"), in terracotta ink. No crown, no badge.

#### 2.6.1 Pick (asker)
```
│ שולחן 3 · סבב 1 · עכשיו: בחרו שאלה        │
│ התור שלכם לשאול NEW                       │ asker mark (terra-500 ink)
│                           בחרו שאלה       │ instruction (table.step_pick)
│ השאלות של המורה                           │ list title (14px ink-muted)
│ ┌──────────────────────────────────────┐ │ one tappable card per question, 56px+
│ │ ○ למה קשה לסרב לחבר?                 │ │ radio semantics (role=radio)
│ ├──────────────────────────────────────┤ │
│ │ ○ מה היה קורה אם כולם היו משקרים?    │ │
│ ├──────────────────────────────────────┤ │
│ │ ○ (greyed) מה זה חבר טוב?   נשאלה NEW │ │ used here: ink-faint, last, label
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │ + שאלה משלנו                          │ │ secondary, anyone at the table
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │        לקרוא בקול ולהתחיל NEW         │ │ primary (asker only), enabled after a pick
│ └──────────────────────────────────────┘ │
```
Non-asker: same list, read-only (cards are not buttons; the chosen one fills when the asker picks), "+ שאלה משלנו" available, no primary. Empty: no questions left → the list collapses to the "+ שאלה משלנו" button with "כל השאלות נשאלו" **NEW** above it. A student-added question appears in the list for the whole table within one snapshot, with "שאלה משלנו" as its eyebrow. Loading: the existing skeleton lines (two grey bars). Error on add: the language-gate refusal (existing) inline under the input.

#### 2.6.2 Talk (screens down) — see §3.

#### 2.6.3 Write
```
│ שולחן 3 · סבב 1 · עכשיו: כותבים           │
│ למה קשה לסרב לחבר?                        │ the question, 18px 700, stays on top
│ ┌─────────────────┬────────────────────┐ │ asker only, once per turn
│ │ ■ כולם כותבים   │ תשובה אחת לשולחן   │ │ segmented, default = everyone
│ └─────────────────┴────────────────────┘ │
│                              כותבים       │ instruction
│ ┌──────────────────────────────────────┐ │
│ │ התשובה שלנו…                         │ │ textarea 3 lines → grows to 6
│ └──────────────────────────────────────┘ │
│ 0 מתוך 280 NEW                            │ counter, ink-soft
│ ┌──────────────────────────────────────┐ │
│ │               שליחה                   │ │ primary (everyone, in "כולם כותבים")
│ └──────────────────────────────────────┘ │
```
Mode switch = Agora's `Segment` restyled (`.segment--paper`): two options, 48 px tall, selected = ink fill with paper text. It is on the asker's device only and locks (disabled, no fade) after the table's first send of this turn. In "תשובה אחת לשולחן": the asker's device shows the editor; the other devices show the same textarea read-only with "דנה כותבת לשולחן" **NEW** as its eyebrow and the draft mirrored live through Realtime Database, Join's `liveDrafts` pattern (one path per table per turn, throttled to one write per 2 s; never a Firestore doc, which would cost a document write per keystroke burst and a listener fan-out per tablemate); their bottom slot is empty; "שליחה" on the asker's device sends for the table. States: sending = the button disabled "שולחים…" **NEW**; sent = "נשלח" in teal (`.btn--agree` disabled) and the textarea stays editable with the button turning back into "שליחה" on the first keystroke (the spec's `changed`); send failed = "לא נשלח. לנסות שוב" **NEW**, the draft kept locally; language gate = the existing refusal line under the textarea. Asker's forward control after sending: "לדרג" (secondary, under "נשלח"). An unfinished draft when the teacher moves the table on: one-line confirm "לשלוח כמו שזה?" **NEW** with "שליחה" / "לוותר" **NEW**.

#### 2.6.4 Rate
```
│ שולחן 3 · סבב 1 · עכשיו: מדרגים            │
│                             מדרגים        │ instruction (table.step_rate)
│ ┌──────────────────────────────────────┐ │ the class's answers, inline here
│ │ תשובה · שולחן 5                      │ │ eyebrow: kind + table (never a tag)
│ │ כי אנחנו מפחדים לאבד אותו.           │ │ 18px
│ │ (☹)  (🙁)  (😐)  (🙂)  (☺)   — §4     │ │ 5 faces
│ └──────────────────────────────────────┘ │
│ ┌ next unrated … ┐                       │
│ ▸ דירגתם 4                                │ collapsed group, end of list
│ ┌──────────────────────────────────────┐ │
│ │               סבב הבא                 │ │ primary (asker); last turn: "סיימנו" NEW
│ └──────────────────────────────────────┘ │
```
Here the list is inline (the step is the list); at the other steps the same list opens as a sheet (§2.6.5). Order per spec §8: unrated first, newest first; own table's answers absent (auto +1, §4). Empty: "עוד אין תשובות" with the faces hidden. Done: when the asker taps "סבב הבא" the table returns to Pick with the header's סבב count +1; after the last turn the asker's device shows "סיימנו" **NEW** and all devices show "חכו לשאר השולחנות" in the bottom slot (text, not a button). Ratings save on tap with the face's selected state as the only feedback (no toast).

#### 2.6.5 The class list sheet
A bottom sheet (`.sheet`, NEW block, pattern from Join's `.modal` without the scrim blur): slides up 220 ms `--ease-out` (transform only), covers 92 vh, paper background, 1.5 px `--border-medium` top rule, a 56 px header with the title ("התשובות של הכיתה" or "ההצעות של הכיתה") and a labelled close "סגירה" **NEW** at the end corner (48 px, text + the `close` icon P2). Body scrolls; the page under it does not. Closing returns to the same table step with focus on the control that opened it. No drag-to-dismiss (cheap, and a 13-year-old finds the labelled close faster).

### 2.7 Proposals
Same frame and header ("שולחן 3 · עכשיו: מדברים", no סבב). The sheet's title is "ההצעות של הכיתה"; the written thing is "הצעה" everywhere.
- **Talk**: §3 with the table timer instead of a speaker; the prompt line is the challenge question; the asker's device shows "סיימנו, לכתוב" after the timer, non-askers nothing (the spec gives no speaker order here, so no "הבא בתור").
- **Write**: as §2.6.3 without the mode switch; eyebrow "ההצעה שלי"; "שליחה" → "נשלח"; editing allowed until the Vote opens (then the textarea becomes a card and the button disappears, no message).
- **Rate**: as §2.6.4 with "עוד אין הצעות"; no "סבב הבא"; the asker's device has no forward control (the teacher opens the plenum).
- **Plenum**: the phone shows one line in the content area, "ההצעות המובילות על המקרן", above the same rate list (re-rating allowed) with the list re-ordered to C_p rank and the top three pinned under a "ההצעות המובילות" title; the own proposal's card shows above the list as "ההצעה שלי" with "עריכה" (existing `edit` icon + text).

### 2.8 Vote
```
│ הצבעה                                    │
│                       בחרו הצעה אחת       │ instruction (voting.* title)
│ ┌──────────────────────────────────────┐ │ one card per proposal, radio semantics
│ │ ○ נאמר לו שאנחנו לא יכולים לשקר…     │ │ 56px min, full text, no truncation
│ ├──────────────────────────────────────┤ │
│ │ ◉ נדבר איתו על למה הוא מבקש…         │ │ selected: ink fill, paper text, check icon
│ ├──────────────────────────────────────┤ │
│ │ ○ …                                   │ │
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │               הצבעה                   │ │ primary → "הצבעתם" (teal, disabled)
│ └──────────────────────────────────────┘ │
```
The vote is one tap on a card plus "הצבעה" (two taps, not one: a mis-tap on a crowded list must not be a vote). Changing: tap another card → the button reads "לשנות הצבעה" **NEW**. States: saving = "שומרים…"; failed = retry line; closed = cards lose radio semantics and the button shows "ההצבעה נסגרה" **NEW**; empty ballot = the existing "אין מה להצביע". No evaluation numbers, no ranks, no author, no table on the cards (spec: never see numbers while voting).

### 2.9 Summary
```
│ סיכום                                    │
│ ┌──────────────────────────────────────┐ │ decision card, teal-50 bg, teal-600 border
│ │ ההחלטה                               │ │ eyebrow
│ │ נדבר איתו על למה הוא מבקש…           │ │ 22px 700
│ │ 18 מתוך 31 הצבעות NEW                │ │ one number line; no vote: "ההצעה המוסכמת ביותר" NEW
│ └──────────────────────────────────────┘ │
│              לאיזה צד אתם קרובים עכשיו?  │ side.again
│   (the §7 slider, pre-set to the first pick, ink-faint ghost tick at the old spot)
│ ┌──────────────────────────────────────┐ │
│ │               אישור                   │ │ primary, optional
│ └──────────────────────────────────────┘ │
│ מה השתנה · 9 מתוך 31 בחרו שוב            │ summary.shift + count (hidden until ≥ 1)
│ לפני  ▓▓▓▓▓▓▓▓░░░░░▒▒▒▒▒▒▒▒▒             │ §7 drawing
│ עכשיו ▓▓▓▓▓░░░░░░░░░▒▒▒▒▒▒▒              │
```
The decision is first and never waits. The re-pick slider is the same component as §2.4 with a ghost tick where the student stood before (ink-faint, labelled "הבחירה הראשונה" **NEW** in the thumb's aria-valuetext). States: nobody re-picked = "עוד אף אחד לא בחר שוב" in place of the drawing; computing = the existing skeleton; ended = the screen stays, the slider freezes (disabled, no fade). After "אישור" the button turns "נשמר" and the drawing updates in place.

## 3. The screens-down state (talk step)
**Decision: the screen goes dark.** Background `--ink`, text `--paper`: the one inverted screen in the product. Reasons: (1) a dark rectangle on a table reads as "closed" from across the room, so the teacher sees at a glance which tables are talking and which are still picking; (2) a bright screen on a table is the thing a 13-year-old's eye returns to, a dark one is not; (3) it is a solid colour, which costs nothing on a weak phone and saves battery on OLED; (4) it makes the countdown the only light on the screen, so it is readable obliquely from 60 cm. Not a scrim over the previous screen (that keeps the question and the list visible, which is the opposite of screens down), and not a dimmed brightness (the app cannot control it, and a half-dim screen looks broken). The question stays, in one line at the top, because the speaker needs it.

```
┌──────────────────────────────────────────┐ bg --ink
│ שולחן 3 · סבב 1 · עכשיו: מדברים          │ header, paper on ink
│ למה קשה לסרב לחבר?                        │ the question, 18px, paper, max 2 lines
│                                          │
│                 מסכים למטה. מדברים.      │ instruction (table.step_talk), 22px
│                                          │
│                  דנה מדברת (?)           │ speaker, 28px 700 (own device: "התור שלכם לדבר" NEW)
│                                          │
│                  0:42                    │ countdown: clamp(5.5rem, 34vw, 8rem), tabular, 700
│                                          │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░ │ 6px bar, scaleX per second (transform only)
│                                          │
│ ┌──────────────────────────────────────┐ │ asker: "הבא בתור" secondary (paper outline)
│ │               הבא בתור                │ │ non-asker: empty until the minute is over
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```
- **Before the first minute** (table just entered talk, no speaker yet): the speaker line reads "דנה קוראת את השאלה" **NEW** (the asker), the countdown slot shows "1:00" at full size but in `--ink-faint`, and the asker's device shows the primary "התחלה". Non-askers: nothing at the bottom.
- **Reading at 60 cm.** With the phone flat on the table and the student sitting back, the numerals are 128 px tall on a 360 px phone (≈ 22 mm), which subtends about 2° at 60 cm, roughly four times the size needed to read a digit at that distance even at a 45° viewing angle. Tabular figures (`font-variant-numeric: tabular-nums`) so the digits do not jitter. Contrast paper on ink ≈ 16:1.
- **The last 10 seconds.** The numerals switch to `--terra-300` (≈ 6.5:1 on ink) and the bar to the same colour; the countdown drops the minutes and shows two digits only ("09", "08", …) at the same size, so the change is in shape as well as colour. No pulse, no shake: a per-second step of colour and text, nothing in between.
- **"הזמן נגמר".** The numerals are replaced by the words, 36 px 700, paper, with the bar fully empty (`--terra-300`, 6 px, so the end is still marked). The screen stays dark; the words stay until the asker moves on. The speaker line stays ("דנה מדברת") so the table knows whose minute ended.
- **"הבא בתור".** On the asker's device the control is present throughout the minute as a paper-outline secondary (`.btn--secondary` inverted: paper border, paper text, transparent fill) so a speaker who finishes early can be moved on; at "הזמן נגמר" it becomes the primary (`.btn--primary`, terracotta fill, 56 px). On a non-asker's device the bottom slot is empty for the whole minute; at "הזמן נגמר" the same primary "הבא בתור" fades in (220 ms opacity), so a table is never stuck on a missing asker. After the last speaker the control reads "סיימנו, לכתוב" on every device by the same rule (asker always, others after the timer).
- **Proposals talk.** Same screen, no speaker line, the countdown is the table timer ("4:00" down), the control is "סיימנו, לכתוב" (asker during, everyone after).
- **Screen reader.** The countdown region is `aria-live="off"` with `role="timer"` and an `aria-label` "זמן לדבר, 42 שניות" **NEW** updated every 10 s and at 10, 5 and 0 (a per-second announcement would be unbearable); "הזמן נגמר" is announced once through a polite live region. The speaker line is a polite live region (announced on change).
- **Reduced motion.** The bar steps without transition (it already does), fades become instant. There is nothing else to turn off.

## 4. The 5-face rating (from Join's `.evaluation`)
Reused as is: five circular buttons, `role="radiogroup"` / `role="radio"`, DOM order -1 → +1, each face a fully coloured circle (`--emoji-sad` … `--emoji-smiley`), the selected face gets the ink ring + check badge + scale 1.18 + the siblings recede to 0.55 only after a choice. Adapted:
- **Size.** 48 px floor, 56 px cap (Join's 44 floor is below the spec's 48 px target). Five × 56 + four × 8 gaps = 312 px fits the 328 px card body at 360 px; at 320 px the faces are 48 px.
- **Spacing.** `gap: var(--space-sm)`, row padding 8 px, 16 px below the row so the next card's eyebrow does not sit against the faces.
- **Selected state without colour alone.** Three cues as in Join: the 3 px `--terra-600` ring with a paper halo (shape), scale 1.18 (size), the check badge with the `check` icon (symbol). On a card that was rated, the eyebrow also gets "דירגתם" **NEW** after the table ("תשובה · שולחן 5 · דירגתם"), so the state reads in text when the row is scrolled off.
- **Faces as one sprite.** The five SVGs become one inline `<symbol>` sprite in the shell (≈ 6 kB), not five `<img>` requests. The faces' expression is the non-colour difference between them; their `aria-label`s are the existing `rate.*` keys (strong against … strong for).
- **Own items.** A student's own proposal and their own table's answers are never in the list and the server writes +1 for them, so there is nothing to draw: no "your own" card, no disabled row, no explanation. The only trace is in the rate list's empty state when every other item is rated ("עוד אין תשובות" is reserved for a genuinely empty class list; a fully rated list shows just the collapsed "דירגתם n").
- **"דירגתם n" collapse.** Rated cards leave the unrated list on the next list refresh, not on the tap (the card must not jump under the finger). They collect under one disclosure line at the end of the list, "▸ דירגתם 4" (Agora's `Collapsible`, 48 px, ink-muted), closed by default; opened, the cards show with their faces still interactive (a rating can be changed). The number counts this student's ratings in this list, so it also serves as "how far am I".
- **Frozen.** Join's `--frozen` modifier (opacity 0.55, `disabled`) applies when the Vote opens for proposals; answers are never frozen.

## 5. The teacher console (`/teach/session/:id`)
Laptop, 1280 × 720 minimum, mouse or trackpad, projector in a second window. Three fixed bands: the step rail (96 px), the switch (48 px), the board. Nothing in the first two bands ever scrolls or moves.

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ TeacherNav (existing)                                                    קוד 482 913 · מקרן │ 56px
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────┐  (8)────(7)────(6)────(5)────[4]════(✓3)═══(✓2)═══(✓1)     │ rail: 96px
│ │ פתיחת השלב הבא: שיחה בשולחנות │  סיכום  הצבעה  הצעות  שיחה   שולחנות  צד   פתיחה  ממתינים│ labels 14px
│ └──────────────────────────────┘                           שלב 4 מתוך 8 · 00:12:40 NEW     │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ חלוקה לשולחנות   חלוקה מחדש                                  ┌──────────┬──────────┐      │ 48px: step actions
│                                                              │  מה כתבו │ שולחנות ■ │      │ Segment (existing)
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ ללא שולחן:  [ אורי · לשולחן ▾ ]  [ מאיה · לשולחן ▾ ]                                       │ strip, only when ≠ 0
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐                 │ 5 × 2 grid
│ │ שולחן 5    │ │ שולחן 4    │ │ שולחן 3    │ │ שולחן 2    │ │ שולחן 1    │   236 × 232 px  │
│ │ סבב 1      │ │ סבב 2      │ │ סבב 1      │ │ סבב 1      │ │ סבב 2      │                 │
│ │ עכשיו:     │ │ עכשיו:     │ │ עכשיו:     │ │ עכשיו:     │ │ עכשיו:     │                 │
│ │  מדברים    │ │  כותבים    │ │  מדברים    │ │ בחרו שאלה  │ │  מדרגים    │                 │
│ │ 0:42 ▬▬▬░░ │ │ הזמן נגמר  │ │ 0:08 ▬░░░░ │ │     —      │ │     —      │                 │
│ │ התור של דנה│ │ התור של רן │ │ התור של לי │ │ התור של גל │ │ התור של טל │                 │
│ │ ●דנה ■עומר │ │ ●רן  ◆נוי  │ │ ■לי  ●שיר  │ │ ●גל  ■בר   │ │ ■טל  ●מור  │  chips, draggable│
│ │ ◆לי  ●רון  │ │ ■יעל ●דור  │ │ ◆אור ■תום  │ │ ◆עדן       │ │ ●ליה ◆ניב  │                 │
│ │ + בלי מכשיר│ │ + בלי מכשיר│ │ + בלי מכשיר│ │ + בלי מכשיר│ │ + בלי מכשיר│  tertiary       │
│ │הבא·לכתיבה·לדירוג│ …        │ │ …          │ │ …          │ │ …          │  quick actions  │
│ └────────────┘ └────────────┘ └────────────┘ └────────────┘ └────────────┘                 │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐                 │ row 2 (tables 6-10)
│ └────────────┘ └────────────┘ └────────────┘ └────────────┘ └────────────┘                 │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```
**Step rail.** Eight 32 px circles joined by a 2 px line, RTL so step 1 is at the start (right). Done = `--ink` fill, paper `check` icon, the joining line to its left solid ink; current = `--terra-600` fill, paper number, 40 px (the one larger circle), label 700; upcoming = paper fill, `--border-medium` 2 px outline, ink-soft number, dotted line. Labels (14 px) are the step names of §3 under each circle. Under the rail's end: "שלב 4 מתוך 8" (`teacher.step_of`) and the lesson clock **NEW** (elapsed, tabular, not a countdown: nothing in the console counts down except table timers). The rail is `<ol aria-label="שלבי השיעור">` **NEW** with each `<li>` `aria-current="step"` for the current one and the words "הסתיים" / "הבא" **NEW** in visually hidden text, so the state does not depend on colour.

**The one forward control.** `.btn--primary`, 56 px, at the rail's end (left edge in RTL, the last thing in reading order) and nowhere else, always reading "פתיחת השלב הבא: {next step name}"; at the last step "סיום השיעור" (same place, `--danger` outline instead of terracotta fill, and a one-line confirm, existing). Disabled during the server transaction with "פותחים…" **NEW**; failure = the existing advance-failed line under the button. Step-specific actions ("חלוקה לשולחנות", "חלוקה מחדש", "כולם ביחד", "כל השולחנות: מדרגים", "לסיכום השיעור") are `.btn--secondary` 40 px in the switch band's start side, never on the rail.

**The switch.** Agora's `Segment` ("שולחנות | מה כתבו"), sticky under the rail, URL `?view=`. The Tables board is the default during Table talk and Proposals; before Tables the same board shows one card, "הכיתה" **NEW**, with every joined student as a chip (the roster), and "עוד לא הצטרפו" when empty.

**Table card** (`.table-card`, 236 × 232 px, 5 per row at 1280 with 16 px gaps; 36 students in 9-10 tables fit in two rows without scrolling; 11+ tables wrap to a third row and the board scrolls, which is acceptable above the spec's 10). Rows, top to bottom: title "שולחן 3" (18 px 700) with the turn "סבב 2" after it; the step line "עכשיו: מדברים" (700); the timer line; the asker line "התור של דנה"; the member chips (wrap, 2 rows); "+ בלי מכשיר" (tertiary); the quick actions. The timer line is "0:42" tabular plus a 4 px bar (transform scaleX, stepped per second) in `--ink`; the last 10 s turn both `--terra-500`; over = the words "הזמן נגמר" in 700 with the empty bar in `--terra-500`, so "over" reads in words and in the bar's emptiness, not in colour alone; no timer at pick / rate = an em dash. **No "stuck" mark** (spec §9.9).

**Member chips.** 32 px tall pill, `--paper-soft` fill, the student's display name, a side mark at the start: ● (filled circle, `--side-a`) for the first character's side, ■ (filled square, `--side-b`) for the second, ◆ (hollow diamond, `--side-center`) for centre, drawn as 10 px inline SVG with the side name in the chip's `title` and `aria-label` ("דנה, קרובה ליונתן" (?)). A "בלי מכשיר" member gets a dashed chip border and the chip text "דנה · בלי מכשיר". A chip is draggable (cursor grab) and a button (Enter opens its menu: "העברה לשולחן אחר ▸ שולחן 1 … שולחן 10", "הסרה מהשיעור" existing, "הודעה" existing).

**Quick actions.** Three 40 px text buttons in one row: "הבא בתור" · "לכתיבה" · "לדירוג", each calling `agoraTableStep` for that table; the one matching the table's next natural step is `.btn--secondary`, the others `.btn--tertiary`, so the likely tap stands out without being primary (primary is reserved for the rail). "+ בלי מכשיר" opens a 1-field inline form inside the card (name, 48 px, "הוספה" **NEW** / "ביטול" **NEW**).

**"ללא שולחן" strip.** Shown only when ≥ 1 student is unplaced: a 56 px band under the switch, `--terra-50` background, 2 px `--terra-300` top rule, the label "ללא שולחן:" and one chip per student with a "לשולחן ▾" select (tables 1-n) as the one action; chips here are draggable too. The strip disappears with a 220 ms fade when empty.

**Drag-to-move.** Pointer events (one handler, no library): press-and-move a chip ≥ 6 px lifts a translated clone (opacity 0.9, `--shadow-sm`); every table card except the source shows a 2 px dashed `--terra-500` inner outline and its title in terracotta; the card under the pointer fills `--terra-50`; release calls `agoraMoveStudent`; the chip appears in the new card (no fly animation; it is gone from one list and present in the other, 220 ms opacity in). Escape or release outside any card cancels. **Keyboard equivalent:** Tab to a chip, Space picks it up (`aria-pressed=true`, the chip gets the dashed outline, a polite live region says "דנה: בחרו שולחן בחיצים, רווח להעברה, Escape לביטול" **NEW**), Left/Right move a terracotta target outline between table cards (Home/End = first/last), Space or Enter drops, Escape cancels. Enter without a pick-up opens the chip's menu with "העברה לשולחן אחר", which is the equivalent a screen-reader user will actually use.

**Table sheet** (`/teach/session/:id/table/:n`). Opens on the card's title click as a side sheet from the end edge (Join's `.facilitator-panel` pattern, 420 px, transform only), the board still visible and dimmed by `--bg-overlay` (no blur). Contents: the card's rows at full width; the member list as rows (name, side mark + side name, "העברה לשולחן אחר ▾", "הסרה", "הודעה"); the current question and the turn count; three full-width secondary buttons "הבא בתור" / "לכתיבה" / "לדירוג"; "+ בלי מכשיר". Close = "סגירה" **NEW** at the header's end and Escape; focus returns to the card title. Empty table: "אין תלמידים בשולחן" **NEW** and the "+ בלי מכשיר" form.

**Plenum control.** At the Proposals step the switch band shows "כולם ביחד" (secondary). Tapping it sets `roundPhase = improve`, the button becomes a `--teal-600` filled state "כולם ביחד · פעיל" **NEW** (disabled, teal = on), the projector switches to top proposals, every card's step line reads "כולם ביחד", and the quick actions on every card collapse to "לדירוג" only. "כל השולחנות: מדרגים" sits beside it as a secondary at Table talk and Proposals.

**What they wrote** (`?view=texts`). Join's `.solution-card--display-only` list: grouped by step then table (sticky group titles "סבב 1 · שולחן 3"), each card the text, the author's display name, the rating count ("12 דירוגים" **NEW**) and the existing hide / restore; filter chips (table, hidden) and the existing search above; "לדרג בשם …" appears on a card only when the lesson has a "בלי מכשיר" member (a select of those names + the five faces). Empty: "עוד לא כתבו".

## 6. The projector (`/teach/screen/:id`)
One thing per step, paper background, ink text, nothing interactive, the smallest text 32 px, the main text ≥ 64 px; `--font-size` doubles the phone scale. A 64 px bottom band holds the join code and QR at every step (small, end corner) and the step name at the start corner, so a late joiner always has the code.
| Step | The one thing |
|---|---|
| Waiting | the code at 160 px tabular + the QR at 320 px + "14 בכיתה" |
| Opening | the question at 72 px, then the video (the only step with media; `YoutubePlayer` existing, the teacher presses play) |
| Side | the two characters (§7) at 240 px each with their names at 64 px, the centre tick, no counts (a count while picking pulls the undecided) |
| Tables | the table map: a grid, 5 columns × 2 rows, each tile "שולחן 3" at 64 px and its members' names at 32 px, in table order right-to-left, top-to-bottom; a "ללא שולחן" tile last when needed |
| Table talk | counts only: "7 שולחנות · 2 בשיחה · 3 כותבים · 2 מדרגים" **NEW** as four large tiles with the number at 96 px over the word; at "כל השולחנות: מדרגים" the tiles collapse to "מדרגים" + the answer count |
| Proposals | before the plenum: "27 הצעות נשלחו" **NEW**; plenum: the top proposals, up to 5, as full-width cards (text at 48 px, rank number at 96 px at the start edge, no author, no score) |
| Vote | the tally: a horizontal bar per proposal (text 40 px, bar `--ink`, the count at the bar's end at 64 px), live |
| Summary | the decision card (72 px, teal-50) above, the side shift drawing (§7) below with "9 מתוך 31 בחרו שוב" |
**Grid, not a room map, for now.** A grid is what the data has; the room is what the teacher has. Later: a "סידור הכיתה" **NEW** screen on the class (teacher-home spec territory) where the teacher drags table tiles on a 6 × 4 grid once per class, saved as `class.roomLayout` (tileIndex → tableN); the projector reads it when present and falls back to the grid. The Tables board on the console keeps the grid either way (ten cards in two rows is faster to scan than a sparse room).

## 7. The side slider and the side-shift drawing
**Slider** (`SideSlider`, re-draw of `CampScale`). An `<input type=range dir=ltr min=0 max=100 step=1>` (native: cheap, accessible, works with a thumb) under a custom track:
```
   ┌────┐                                            ┌────┐
   │ (י)│ יונתן                                 נועה │ (נ)│    56px circles, name 18px 700
   └────┘                                            └────┘
   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┿▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒      track 12px, two halves, centre tick 24px tall
                      ◯                                thumb 48px, paper fill, 3px ink border
                    באמצע
```
Character circle = the scenario's character portrait when the package has one (≤ 12 kB each), else the name's first letter on the side colour. Side A (left end, `dir=ltr` so the sides never swap under RTL) in `--side-a` (= `--terra-500`), side B in `--side-b` (= `--indigo-500`), the centre tick in `--side-center` (= `--ink-soft`), the track halves the 50-tints (`--terra-50`, `--indigo-50`) so a drift from the centre reads as moving onto a colour. Thumb: 48 px circle, paper fill, 3 px `--ink` border, no shadow; while dragging it gains the focus ring. The label under the thumb says the side in words ("קרוב ליונתן" / "באמצע" / "קרוב לנועה"), updated live, and is also `aria-valuetext`. Zones: 0-39 side A, 40-60 centre, 61-100 side B (the existing `camp` thresholds; the drawing does not change them). `aria-label`: "לאיזה צד אתם קרובים? יונתן בצד אחד, נועה בצד השני" **NEW**. Keyboard: arrows move 1, PageUp/Down 10, Home/End to the characters. On the Summary, a 2 px `--ink-faint` ghost tick marks the first pick.

**Side-shift drawing** (`SideShift`): two stacked horizontal bars, "לפני" and "עכשיו", each 100 % wide and split into three segments proportional to the counts, segment order A · centre · B (ltr, matching the slider), each segment carrying its count in 700 (numbers first, then the name on the projector; the phone shows the number only with the name in `aria-label`). Side A = `--side-a` with paper text, centre = `--paper-deep` with ink text, side B = `--side-b` with paper text: three fills, two of them also distinguished by text colour and by position, so colour is never the only cue. A segment of 0 collapses to a 2 px line. Phone: bars 32 px tall, 8 px apart, labels at 14 px at the start; projector: 96 px bars, 48 px labels, the character names on the segments. "n מתוך m בחרו שוב" above; the "עכשיו" bar counts only those n, so it is drawn at n/m of the width (a shorter bar, left-aligned to the same origin) rather than stretched, which keeps "fewer people" visible. No arrows, no animation between the two bars; the second bar fades in when the first re-pick arrives.

## 8. Motion, colour, type, spacing
**Reuse (Join `_tokens.scss`, unchanged names):** `--paper`, `--paper-soft`, `--paper-deep`, `--paper-line`, `--ink`, `--ink-muted`, `--ink-soft`, `--ink-faint`, `--terra-50/100/300/500/600/700`, `--indigo-50/100/500/600/700`, `--teal-50/100/500/600/700`, `--danger`, `--warning`, `--bg-card`, `--bg-overlay`, `--border-light/medium/strong/card`, `--space-xs…2xl`, `--font-size-xs…3xl`, `--font-weight-normal/bold`, `--line-height-tight/snug/normal`, `--radius-sm/md/lg/full`, `--shadow-xs/sm` (never `--shadow-md/lg` on a phone), `--dur-quick/base/slow`, `--ease-out/in-out`, `--touch-target`, `--focus-ring-*`, `--emoji-*`, `--header-height`, `--max-width` (520 px: student screens centre in it on a tablet). **Reuse from Agora:** `--camp-left/right/center` are retired in favour of the three side tokens below (one name per concept); `--ease-spring` is not used (no bounce).
**New tokens (in the shared tokens file):**
```scss
--side-a: var(--terra-500);  --side-a-soft: var(--terra-50);
--side-b: var(--indigo-500); --side-b-soft: var(--indigo-50);
--side-center: var(--ink-soft); --side-center-soft: var(--paper-deep);
--down-bg: var(--ink);  --down-ink: var(--paper);  --down-warn: var(--terra-300);   // screens-down
--count-size: clamp(5.5rem, 34vw, 8rem);                                           // the countdown
--rail-done: var(--ink);  --rail-current: var(--terra-600);  --rail-upcoming: var(--border-medium);
```
**Type.** Assistant variable, two instances (400, 700), `font-display: swap`, subset Hebrew + Latin + digits (≈ 30 kB). Scale: header 16 / instruction 22 / card text 18 / table number 56 / countdown `--count-size` / projector ×2. `--font-weight-semibold` (600) is not loaded: anything 600 in Join's CSS renders 700 here, which is fine for a classroom.
**Spacing.** 8-point: page gutter 16, card padding 16 (24 top), gaps 8, section gaps 24, bottom action pad 16 + safe area. Cards `--radius-lg` (22 px), buttons `--radius-full`, chips `--radius-full`, the sheet 22 px top corners only.
**Motion (all `transform`/`opacity`, all `--ease-out`).** Screen change on a step advance: 220 ms opacity cross-fade (`--dur-base`), nothing slides. Sheet open/close: 220 ms translateY. Card appearing in a list (new answer): 140 ms opacity (`--dur-quick`), no height animation, inserted at the top only while the list is not being scrolled (else queued until the scroll stops). Face selection: Join's `evaluation-pulse` 380 ms once. Button press: translateY(1 px). Timers: stepped per second, no transition. Drag: the clone follows the pointer with `transform: translate` only. Nothing loops. **Reduced motion:** `@media (prefers-reduced-motion: reduce)` sets `--dur-quick/base/slow: 0ms` and `animation: none` on the pulse; everything is instant and nothing is lost, because no state is conveyed by motion alone.
**Contrast.** Text ≥ 4.5:1: ink on paper 16.6, ink-soft 5.3, terra-500 5.8, teal-500 5.4, indigo-500 7.1, paper on terra-600 6.4, paper on ink 16, terra-300 on ink ≈ 6.5. Non-text ≥ 3:1: countdown bar paper on ink, terra-300 on ink; rail circles terra-600 / ink on paper, `--border-medium` outline 3.2; the side tokens on paper 5.8 / 7.1 / 5.3; chip side marks are 10 px shapes with text labels, not relied on. Dark mode and high contrast: Join's existing overrides (`[data-high-contrast]`, `prefers-contrast: more`) apply unchanged; the screens-down screen is already dark and keeps the same tokens.

## 9. Accessibility
- **Targets.** Every control ≥ 48 × 48 (buttons 56 tall, faces 48-56, chips on the console 32 tall but with 48 px hit areas via padding, quick actions 40 tall × ≥ 72 wide on a mouse surface; the spec's 48 is kept on every phone control).
- **Focus order, student.** Header (cog) → asker mark → instruction → content in reading order → the sheet control → the bottom primary. On the talk screen the focus starts on the speaker line (a live region), so a screen-reader user hears the state. A sheet traps focus; close returns it.
- **Focus order, console.** TeacherNav → rail (one Tab stop, arrows read the steps) → forward control → step actions → switch → "ללא שולחן" chips → table cards in order (each card: title button → chips → "+ בלי מכשיר" → quick actions) → table sheet when open (trapped).
- **Keyboard path for drag-to-move:** §5 (Space to pick up, arrows to choose, Space/Enter to drop, Escape to cancel), plus the chip menu's "העברה לשולחן אחר" as the equivalent that needs no modal interaction. The drop target during a keyboard move is announced ("שולחן 4" **NEW**) through the same polite region.
- **Screen-reader text.** Countdown: `role="timer"`, `aria-label` "זמן לדבר, {n} שניות" at 10 s steps and at 10/5/0; "הזמן נגמר" once, polite. Step rail: `<ol aria-label="שלבי השיעור">`, each `<li>` "{n}. {name}, הסתיים / נוכחי / הבא" **NEW** with `aria-current="step"`; the forward control's accessible name is its visible text. Table card: `<section aria-label="שולחן 3, סבב 2, עכשיו מדברים, דנה שואלת">` (?) summarising the rows, so the teacher can scan cards by heading. Timer on a card: `role="timer"` updated at 10 s steps. Faces: Join's radio group. Slider: native range with `aria-valuetext` in words. Side-shift bars: `role="img"` with `aria-label` "לפני: 12 קרובים ליונתן, 8 באמצע, 11 קרובים לנועה. עכשיו: …" **NEW**.
- **Colour.** Never the only cue: done/current/upcoming have fill + size + check + text; over has words + empty bar; sides have shape + colour + text; selected face has ring + scale + check.
- **Zoom.** 200 % text zoom: the student frame reflows (the countdown's `clamp` caps at 8 rem, the header wraps to two lines, the primary stays pinned); the console at 200 % becomes 3 cards per row and scrolls, which is accepted.
- **Live regions.** One polite region per screen; the asker's forward control appearing is announced ("הבא בתור זמין" **NEW**); list growth is not announced (it would be constant); the "ללא שולחן" strip appearing is announced on the console.

## 10. Handoff to implementation
**Build order (student first; each is a Mithril component with props in and vnodes out, writes through `lib/`):**
| # | Component (BEM block) | Props | Notes |
|---|---|---|---|
| 1 | `StudentFrame` (`.frame`, `__header`, `__content`, `__action`, `--down`) | `headerLine, askerMark?, instruction, action?: vnode, down?: boolean` | the shared phone frame; `--down` = §3 colours |
| 2 | `ActionButton` (Join `.btn`, `--primary/--secondary/--agree/--tertiary`, new `--on-dark`) | `label, onclick, disabled, busyLabel?` | busy swaps the label after 400 ms |
| 3 | `Countdown` (`.count`, `__num`, `__bar`, `__over`, `--warn`) | `endsAt, size: 'phone'\|'card'\|'screen', label` | one `setInterval` per screen (not per card); server clock offset from `lib/session.ts` |
| 4 | `SideSlider` (`.side`, `__char`, `__track`, `__tick`, `__thumb`, `__word`, `--ghost`) | `a: {name, portrait?}, b, value, ghost?, onChange, disabled` | replaces `CampScale` |
| 5 | `FaceRating` (Join `.evaluation`) | `value?, onRate(v), frozen` | Join's `Evaluation` with the Firestore call lifted to a prop (Agora rule: no firebase in components) |
| 6 | `TextCard` (`.text-card`, `__eyebrow`, `__body`, `__faces`) | `eyebrow, text, rating?: props of 5, rated?` | the answer / proposal card; no kind tag |
| 7 | `RatedList` (`.rated-list`, `__group`) | `items, ratings, emptyLine` | order rule §8 of the spec, "דירגתם n" via `Collapsible` |
| 8 | `Sheet` (`.sheet`, `__header`, `__close`, `__body`) | `title, open, onClose, children` | §2.6.5; focus trap; Escape |
| 9 | `QuestionPick` (`.pick`, `__item`, `--used`) | `questions, chosenId?, canChoose, onPick, onAddOwn` | radio list + "+ שאלה משלנו" |
| 10 | `WriteBox` (`.write`, `__mode`, `__area`, `__count`) | `mode?, canChooseMode, draft, mirrored?, onSend, state` | `Segment` + `LineTextArea` (existing) |
| 11 | `TalkScreen` (`.talk`) | `question, speaker?, isMe, endsAt, control?` | §3 composition over `StudentFrame --down` + `Countdown` |
| 12 | `SideShift` (`.shift`, `__bar`, `__seg`, `--a/--center/--b`) | `before, after, pickedAgain, total, size` | §7 |
| 13 | `VoteList`, `DecisionCard` | ballot, winner | radio list; teal card |
| 14 | `StepRail` (`.rail`, `__step`, `--done/--current/--upcoming`, `__forward`) | `steps, currentIndex, nextLabel, onForward, busy` | console |
| 15 | `TableCard` (`.table-card`, `__title`, `__step`, `__timer`, `__asker`, `__chips`, `__actions`, `--target`) | `table, members, onQuick(step), onDrop(uid), onAddNoDevice` | + `MemberChip` (`.chip`, `__mark`, `--a/--b/--center/--no-device/--lifted`) |
| 16 | `TablesBoard` (`.board`, `__strip`, `__grid`) | `tables, unplaced, dragState` | holds the one drag state object; keyboard move |
| 17 | `TableSheet` | `table` | Join `.facilitator-panel` pattern |
| 18 | `ProjectorScreen` (rewrite) | `session, tables, scores` | one view function per step |
**Shared package** (`packages/civic-ui`, name to confirm): `_tokens.scss` + `_fonts.scss` (Assistant variable) + `.btn` + `.evaluation` + the five face SVGs as a sprite + `Sheet` + `resilientOnSnapshot` (`apps/join/src/lib/resilientListeners.ts`) + `QRShare`. Join imports them from there; nothing in Join changes visually.
**Agora survives:** `Segment`, `Collapsible`, `ExplainHint`, `Icon` (+ `play`, `close`, `info` to add), `LineTextArea`, `YoutubePlayer`, `VideoScene` (play on tap only), `LanguagePicker`, `TeacherNav`, `TeacherSidebar`, `VoteTally` (restyled), `CountdownTimer`'s clock logic (its fuse drawing goes), `CampScale`'s range logic (its drawing goes). **Deleted:** everything in the spec's §2.1 deleted list plus `Toast`, `Celebration`, `DelibHud`, `PlaceBar`, `VillageShell`, `StageNav`, `LookPicker/LookBuilder/LookSheet`, `Coin`, `PointsPill`, the `_theme-*` blocks, `icons.scss` font rules.
**Could not decide (for Tal or the engineer):**
1. "דנה מדברת" / "דנה שואלת" gender the verb by the name; a gender-neutral form ("דנה: הזמן לדבר") would avoid the (?) but is a label change, which is the IA spec's call.
2. Whether the asker may cut a speaker short ("הבא בתור" during the minute): designed as allowed (quiet secondary) because a silent speaker is common; the spec's task flow only names the control after the minute.
3. The shared-draft mirror in "תשובה אחת לשולחן" goes through Realtime Database with Join's `liveDrafts` pattern (resolved by the parent review: one RTDB path per table per turn, throttled to one write per 2 s, no Firestore writes). The spec's §2.2 should mention the path when the engine is next touched.
4. Portraits on the slider depend on the scenario package carrying two small character images; the fallback (initial on colour) is designed, the field is not.
5. The room-mirroring layout is deferred by design (§6); its home is the class, not the lesson, so it belongs to the teacher-home spec.

## 11. Revision after Tal's simulation review (2026-10-21)
Applied in the simulation (https://claude.ai/artifact/YUK4XD19ZBvEv6pMCPXw5w) and binding on the screens above; IA spec §11 has the decisions.
- **Step rail**: each step is a `<button>`; press = jump the class there. Same look as §5; `aria-label` "שלב n: שם, הסתיים/נוכחי/הבא".
- **Talk screen**: line "הדוברת: דנה · זמן נותר: 34 שניות" (20 px 700) above the digits; digits 96 px to make room; under the bar a row of speaker chips (44 px, paper outline on ink; selected = paper fill; spoken = ✓ at 50 %), enabled for the asker always and for everyone once the minute is over; a hint line "בחרו את הדובר הבא" / "השואל בוחר את הדובר הבא". Before the first pick the digits read "1:00" in ink-faint and the line reads "מי מדבר ראשון?".
- **Write (Table talk)**: the answer box, then "הצעה לפתרון (לא חובה)" box, then the broadcast checkbox with a teal line showing what the class sees. "שליחה" enables when either box has text.
- **Rate list**: a dashed "● שולחן 5 כותבים עכשיו" live-draft card on top (Join's LiveDraftBanner), then answer and proposal cards mixed, each with the 5 faces and a −1 … +1 scale line under them. The header control is now "הכיתה כותבת".
- **Console**: a compact "הצעות מול השער" card under the table cards at Proposals (and at Table talk once a proposal exists): row = text (ellipsis) · track with a terracotta gate line · score · note. Teal fill past the gate. The gate is a Tweak in the simulation; in the product it is the lesson's `votingSettings` threshold.
- **Projector**: the same bars at 28 px before the plenum.
- **Summary**: the decision card, then "עד כמה אתם תומכים בהצעה?" with the 5 faces, then three bars (קרובים ליונתן / באמצע / קרובים לנועה) of mean support with the count, and one verdict line in teal or terracotta. The side-shift drawing of §7 is retired.
- **Sub-step strip (2nd review)**: under the asker line, four pills (36 px, flex 1, 14 px 700; current = ink fill / paper text, inverted on the dark talk screen) that switch the local view between שאלה · מדברים · כותבים · מדרגים. They never write to the table doc.

## 12. Host revised to `apps/join-class` (Tal, 2026-10-21)
Everything above still applies to the screens; the components in §10 are now built inside a copy of Join (`apps/join-class`), so the "shared package" step becomes unnecessary: the copy already carries Join's tokens, `.btn`, `.evaluation`, `resilientOnSnapshot`, `liveDrafts`, `QRShare`, `Sheet` pattern. The Agora survivors list in §10 is void; `Segment`, `Collapsible` and `Icon` are re-made in join-class from Join's primitives.
**New screen: plan the questions** (`/t/:mid/plan`, IA §12.1). Join's `MainHub` admin layout at `--max-width`: a pinned card "השאלה לפתרון" (one `EditableTitle`, 20 px 700), then the section "השאלות לשולחנות" as a list of cards (text as `EditableTitle`, a 14 px hint field under it, a drag handle at the start edge, "מחיקה" tertiary at the end), "+ שאלה" as a dashed full-width card at the bottom, and a sticky bottom bar with "שמירה" (primary) that turns teal "נשמר" and a secondary "לקונסולה". Phone: same list, drag by handle, bar fixed at the bottom. Empty state: the dashed "+ שאלה" card with "עוד אין שאלות. הוסיפו את הראשונה" above it.

## 13. Front door, teacher entry and lesson status

Status: draft · Date: 2026-10-22 · Designs against `../ia/agora-classroom.md` §13 (routes, labels, flows, the four statuses and their transitions are fixed there; this section decides layout, weight, presentation, motion and accessibility). Tal's defaults for §13.12 A/B/C hold: no automatic end, no rail moves while paused, ended shows the decision only.

Frames: phone 390 px (checked again at 360 × 640 with the keyboard open, the old-phone worst case), laptop 1280 px. RTL: the **right edge is the start edge**; wireframes are drawn as the user sees them. Strings are the IA's values. A string the IA does not have is marked **NEW** and is listed under 13.J as a gap; nothing below renames an IA label. Hebrew marked (?) needs a native read. The writing rules of §1 and the icon policy still bind: no emoji, no arrow glyphs in strings, nothing loops, `transform`/`opacity` only.

### 13.0 What every screen here shares
- **Weight.** No new font (Assistant 400/700 as in §8), no image except `BrandLogo` (the existing webp/png), no icon font, no new JS dependency. The four status marks are CSS-only shapes (13.A). The end choice uses the native `<dialog>` element (focus trap and Escape for free). The front door and the not-a-lesson state are the only screens here on a student's first load; their CSS is one small block (`.door`, ≤ 2.5 kB unminified) that replaces `.login*` in `_components.scss`. Everything teacher-side goes in the lazy `teacher.scss` / `console.scss`; the student paused and ended screens go in a new lazy `student-state.scss` imported by their view.
- **Tokens only.** Paper `--paper` / `--paper-soft` / `--paper-deep`, ink `--ink` / `--ink-muted` / `--ink-soft` / `--ink-faint`, `--terra-*` for the one action, `--teal-*` for "open" and links, `--danger` for errors only, `--space-*`, `--font-size-*`, `--radius-*`, `--dur-*`, `--ease-out`, `--touch-target`, `--focus-ring-*`.
- **Buttons.** Existing `.btn` + `--primary` (terracotta, one per screen), `--secondary` (paper with ink border), `--tertiary` (teal text). `--danger` is not used anywhere in this section: nothing here destroys data (an ended lesson can be reopened).
- **Motion.** One kind: a state swap (paused, ended, banner in or out) is a 220 ms opacity fade (`--dur-base`, `--ease-out`). Nothing slides, nothing pulses, no spinner loops (busy is a label change, §10 #2). `prefers-reduced-motion: reduce` already zeroes `--dur-*` (§8), so every swap becomes instant and nothing is lost, because no state is carried by motion.
- **Busy.** A button that writes swaps its label to the busy label after 400 ms (§10 #2 rule) and gets `aria-busy="true"` and `disabled`; on a slow 3G round trip the teacher sees one change, not a flicker.

### 13.A New atom: the status mark (`.status-mark`)
One tiny CSS-only shape, sized in `em` so the same atom serves the row chip (14 px), the console banner (18 px), the student screen (48 px) and the projector (96 px). It is never the only cue: it always sits next to the status words.

| Modifier | Shape (pseudo-elements, no SVG) | Colour | Used for |
|---|---|---|---|
| `--not-started` | hollow circle, 2 px **dashed** border | `--ink-soft` | row "עוד לא התחיל" |
| `--live` | filled circle | `--terra-600` | row "שלב n מתוך 8" |
| `--paused` | two vertical bars (`::before`, `::after`, 0.28em × 1em, gap 0.22em) | `--ink-muted` | row, banner, student, projector |
| `--open` | hollow circle, 2 px **solid** border, filled centre dot | `--teal-600` | row, banner |
| `--ended` | check (rotated L of two borders) | `--ink` | row, banner, student, projector |

Shapes differ by form, not only colour (dashed ring / dot / bars / ring+dot / check), so the five read in greyscale and for colour-blind teachers. `aria-hidden="true"` always; the words carry the meaning. ~0.5 kB of CSS, lives in `_components.scss` (both sides need it). No animation, ever (a "live" pulse would break §1.3).

### 13.B Front door `/`

**Job:** type 6 digits. **Second door:** "אני מורה", visible without scrolling, clearly secondary.

Phone 390 × 844 (keyboard closed):
```
┌────────────────────────────────────────┐
│                               [logo 32]│ header 56px: logo at start, nothing else
├────────────────────────────────────────┤ (the a11y widget floats at the start edge as today)
│                                        │
│                       הקלידו את הקוד   │ h1, 22px 700, ink        (door.code.title)
│  ┌──────────────────────────────────┐  │
│  │          4 8 2 9 1 3             │  │ one input, 64px tall, 32px 700 tabular, ltr,
│  └──────────────────────────────────┘  │ letter-spacing .3em, centred
│                                        │
│  ┌──────────────────────────────────┐  │
│  │              כניסה               │  │ .btn--primary, full width, 56px (door.code.enter)
│  └──────────────────────────────────┘  │
│                                        │
│  ────────────────────────────────────  │ 1px --paper-line, 24px above and below
│                 אני מורה               │ .btn--tertiary, 48px, teal text (door.teacher)
│                                        │
└────────────────────────────────────────┘
```

Phone, unknown code (back from `/c/:code`):
```
│                       הקלידו את הקוד   │
│  ┌══════════════════════════════════┐  │ border 2px --danger, aria-invalid
│  ║          4 8 2 9 1 4             ║  │ code kept, all digits selected, focus here
│  └══════════════════════════════════┘  │
│        לא מצאנו שיעור עם הקוד הזה      │ 16px 700, --danger      (lesson.code.unknown.title)
│   בדקו את ששת הספרות עם המורה ונסו שוב. │ 14px, --ink-muted       (lesson.code.unknown.body)
│  ┌──────────────────────────────────┐  │
│  │              כניסה               │  │
```

360 × 640 with the numeric keyboard open (≈ 360 px visible): header 56 + gap 24 + title 29 + gap 16 + input 64 + error (2 lines) 44 + gap 16 + button 56 + divider gap 24 + "אני מורה" 48 ≈ 377 px. To keep "אני מורה" in view on the smallest phone: on screens shorter than 700 px the header drops to 48 px and the logo to 24 px, and the divider gap to 16 px (≈ 353 px). The form is **not** pinned to the bottom (unlike §2.1's first sketch): a bottom-pinned button is the part the keyboard hides.

Laptop 1280: the same column, centred, `max-width: 400px`, starting at 20vh from the top, logo 48 px above the title instead of a header bar. One look serves both; teachers on a laptop see the two doors in one glance.

**Components**
| Element | Class | Notes |
|---|---|---|
| page | `.door` (NEW block) | flex column, `min-height: 100dvh`, `--paper`, gutter `--space-md` |
| header | `.door__header` | logo only (`BrandLogo size 32`, class `door__logo`) |
| form | `form.door__form` | `novalidate`; `onsubmit` → submit |
| title | `h1.door__title` | `id="door-title"` |
| input | `input.door__code` | see behaviour |
| error | `.door__error` (`__error-title`, `__error-body`) | `id="door-error"`, `role="alert"`, only when unknown |
| enter | `button.btn.btn--primary.door__enter` | type submit |
| divider + teacher | `.door__alt` containing `a.btn.btn--tertiary` | `m.route.Link` to `/t` |

**Input behaviour (one input, not six boxes: six boxes break paste, autofill and screen readers on old Android)**
- `type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" autocapitalize="off" spellcheck="false" dir="ltr"`, `aria-labelledby="door-title"`, `aria-describedby="door-error"` when the error shows.
- **No `maxlength`.** A pasted "482 913", "482-913" or a whole join URL would be cut by `maxlength=6`. On every `input` event: keep digits only (`\d`, including Arabic-Indic digits mapped to 0-9: Arabic and Farsi keyboards send them), slice to 6, write back.
- **Auto-submit** the moment the value becomes 6 digits by typing or pasting: navigate to `/c/:code` (its splash is the loading state; the front door needs no busy label). Not on prefill: when the door opens with a returned unknown code, it waits until the value changes and reaches 6 again, so a wrong code is never re-sent in a loop.
- "כניסה" submits the same way; with fewer than 6 digits it does not navigate, it keeps focus in the input and sets `aria-invalid` with no message (the 6 slots in the placeholder already say how many). It is never `disabled`, because a disabled primary on a student's only screen reads as "broken".
- **Placeholder:** six `·` (middle dot) in `--ink-faint`, ltr, same letter-spacing, so the count of digits is visible before typing. Visually only; the accessible name is the title.
- **Focus:** `autofocus` on load (the single job). Android opens the keyboard, iOS does not; both layouts fit (above). On return with an unknown code: focus in the input with all digits selected, so the first new digit replaces them.
- **Focus ring:** the global `--focus-ring-*` (3 px terracotta, offset 3) on the input and both buttons.

**States**
| State | Look |
|---|---|
| empty | placeholder dots, "כניסה" enabled |
| typing | digits; nothing else changes |
| 6 digits | navigates at once (no button flash) |
| unknown code | input border 2 px `--danger`, the two lines under the input, focus + selection in input |
| offline / resolver failed | see 13.J gap 2 (the IA has one message for both today) |
| signed-in Google teacher | never sees the door (`/` → `/t` before first paint; show `SplashLoader` until auth is known, max one frame on a warm session) |

**Screen reader:** heading "הקלידו את הקוד", edit field, then button "כניסה", then link "אני מורה". The error is `role="alert"` so it is read on arrival; the input's description repeats it on focus.

**Why "אני מורה" looks like this.** Tertiary teal text under a hairline: findable by a teacher reading top-down (it is the only other words on the page), yet no student mistakes it for the way in, because the way in is the terracotta button right above the field they are typing in. **A/B test:** this placement vs. a small "אני מורה" in the header's end corner (the web's usual sign-in spot). Measure: teacher time-to-`/login` on first visit, and student taps on "אני מורה" (mistakes).

### 13.C Teacher sign-in `/login`

Phone:
```
┌────────────────────────────────────────┐
│                                        │
│                [logo 56]               │
│               כניסת מורים              │ h1 22px 700            (login.title)
│     התחברו עם Google כדי ליצור שיעורים │ 16px, --ink-muted      (login.tagline)
│          ולמצוא אותם בכל מחשב.         │
│  ┌──────────────────────────────────┐  │
│  │  [G]       המשך עם Google        │  │ ink fill, paper text, 56px (login.google)
│  └──────────────────────────────────┘  │
│                                        │
│  ────────────────────────────────────  │ hairline
│         תלמידים לא צריכים להתחבר.      │ 14px --ink-soft        (login.hint)
│                 יש לי קוד              │ .btn--tertiary 48px    (login.have_code)
└────────────────────────────────────────┘
```
Laptop: the same column centred, `max-width: 400px`, 20vh from the top. No card frame or shadow: the screen has one thing on it, a card around it adds nothing (and the old `.login__card` shadow is not a token).

**Components:** the same `.door` block (`.door__logo`, `.door__title`, `.door__line` for the reason, `.door__alt` for hint + link). The Google button keeps its look under a new name `button.door__google` (ink fill, paper text, 56 px, `--radius-full` like every `.btn`; the "G" stays the existing letter in a 24 px paper circle, `aria-hidden`). Delete `.login__btn--guest`, `.login__divider` and the guest handler with `login.guest` / `login.or`.

**States**
| State | Look |
|---|---|
| booting (auth unknown) | `SplashLoader`, as today |
| ready | as drawn; Google button gets focus on desktop (Enter signs in), no autofocus on touch |
| busy | button label "מתחבר…" (`login.signing_in`), `aria-busy`, disabled; the popup is open |
| failed / popup closed | `.door__error` above the button: "ההתחברות נכשלה. נסו שוב." (`login.error.failed`), `role="alert"`, button re-enabled and focused |
| already signed in with Google | redirect to `?next` or `/t` before paint |

**Keyboard / SR:** heading, reason paragraph, button, hint paragraph, link. "יש לי קוד" is a real link to `/` (middle-click, back button behave as expected). Browser back also lands on `/` (IA 13.8).

### 13.D Teacher home `/t`

Laptop 1280 (content column `--teacher-width` 720 px, centred):
```
┌────────────────────────────────────────────────────────────────────────────┐
│ [logo 40]                         מחוברים כ־טל ירון (?)   התנתקות          │ header 56px
├────────────────────────────────────────────────────────────────────────────┤
│                                                     השיעורים שלי           │ h1 28px
│                                                  [ + שיעור חדש ]           │ .btn--primary
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  ┃ האיסור על טלפונים בבית הספר                                          │ │ row: name 18px 700
│  ┃ ● שלב 3 מתוך 8                                                       │ │ chip (live)
│  ┃                                   [ תכנון השאלות ]   [  לשיעור  ]     │ │ secondary · primary
│  └──────────────────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  ┃ שעות הלימודים                                                        │ │
│  ┃ ▮▮ בהפסקה · שלב 5                                                    │ │ chip (paused)
│  ┃                                   [ תכנון השאלות ]   [  לשיעור  ]     │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  ┃ תלבושת אחידה                                                         │ │
│  ┃ ◎ פתוח לתלמידים                                                      │ │ chip (open)
│  ┃                                   [ תכנון השאלות ]   [  לשיעור  ]     │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  ┃ מבחנים בסוף שבוע                                                     │ │
│  ┃ ✓ הסתיים                                                             │ │ chip (ended), muted row
│  ┃                                   [ תכנון השאלות ]   [ פתיחה מחדש ]   │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  ┃ טיול שנתי                                                            │ │
│  ┃ ◌ עוד לא התחיל                                                       │ │ chip (not started)
│  ┃                                   [ תכנון השאלות ]   [  לשיעור  ]     │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                     WizColFooter           │
└────────────────────────────────────────────────────────────────────────────┘
```
On a laptop wider than 600 px the actions sit on the row's end side on the same line as the chip (the existing `flex-wrap` row does this already); on a phone they drop to their own line, each `flex: 1`, primary at the end (left, the last thing read).

Phone 390, first-time teacher (empty state):
```
┌────────────────────────────────────────┐
│ [logo 32]                    התנתקות   │ header; account line moves under it:
│                  מחוברים כ־טל ירון (?) │ 14px --ink-soft, one line, ellipsis
├────────────────────────────────────────┤
│                           השיעורים שלי │ h1
│ 1. שם לשיעור · 2. תכנון השאלות ·       │ 14px --ink-muted, wraps (teacher.home.how)
│ 3. פותחים את השיעור ומראים לכיתה את הקוד│
│  ┌──────────────────────────────────┐  │
│  │      עוד אין שיעורים. תנו שם     │  │ card .teacher-home__form
│  │               לשיעור הראשון:     │  │ (teacher.home.empty) as the form's lead line
│  │ שם השיעור (הדילמה)               │  │ label 16px 700 (teacher.new.title_label)
│  │ ┌──────────────────────────────┐ │  │
│  │ │למשל: האיסור על טלפונים בבית ה│ │  │ input, focused
│  │ └──────────────────────────────┘ │  │
│  │ [   יצירה   ]                    │  │ primary; NO "ביטול" in the empty state
│  └──────────────────────────────────┘  │ (nothing to go back to)
└────────────────────────────────────────┘
```

**Header** (`.teacher-home__header`, now a flex row): `BrandLogo 40` at the start; `p.teacher-home__account` "מחוברים כ־{{name}}" (`teacher.account`, name = Google displayName, else the email) in `--ink-soft` 14 px; `button.btn.btn--tertiary.btn--small.teacher-home__signout` "התנתקות" (`teacher.signout`) at the end. On < 480 px the account line wraps under the row. Sign-out is a plain button, no confirm (undo = sign in again; shared school computers need it fast). After sign-out → `/`.

**"+ שיעור חדש"** (`teacher.new`): stays exactly where it is, first under the title, `.btn--primary`. Pressed → the same place becomes the inline form (button replaced by the form card, focus in the input). "יצירה" primary, "ביטול" tertiary (`teacher.new.cancel`); Escape in the input = "ביטול" and returns focus to "+ שיעור חדש". Enter submits. While a row list exists, the form pushes the list down; no overlay.

**Create states**
| State | Look |
|---|---|
| empty name + "יצירה" | `aria-invalid`, line "כתבו שם לשיעור" (`teacher.new.invalid`), focus stays |
| busy | "יוצרים..." on the button, input and buttons disabled. The five writes (13.5) can take seconds on 3G; the label must say something is happening |
| failed | "לא הצלחנו ליצור את השיעור. נסו שוב." under the buttons, `role="alert"`, "יצירה" enabled again (retry = press again; the typed name is kept) |
| done | → `/t/:mid/plan` |

**Row** (`li.teacher-home__row`, existing): name `h2.teacher-home__row-title` (18 px 700, wraps, `dir="auto"`); `p.status-chip.status-chip--{status}` (NEW block): `.status-mark` + words, 14 px 700, 28 px tall pill, `--paper-soft` fill (ended: `--paper-deep`), `--radius-full`, `--space-sm` inline padding; actions in `.teacher-home__row-actions`: "תכנון השאלות" (`.btn--secondary.btn--small`, `teacher.row.plan`) and the primary by status (`.btn--primary.btn--small`): "לשיעור" (`teacher.row.open`) or, on `ended`, "פתיחה מחדש" (`teacher.row.reopen`).

The row's start border (existing `--q-accent`, Join's per-question colour) now carries the status, so a list scans by edge: live `--terra-600`, paused `--ink-muted`, open `--teal-600`, ended `--paper-line`, not started `--border-medium`. Ended rows also drop the name to `--ink-muted`; still ≥ 8:1.

| Status (data) | Chip words | Mark |
|---|---|---|
| live, stepIndex 0 | עוד לא התחיל (`teacher.row.not_started`) | `--not-started` |
| live, step n > 0 | שלב n מתוך 8 (`lesson.step_of`) | `--live` |
| paused | בהפסקה · שלב n (`teacher.row.paused`) | `--paused` |
| open | פתוח לתלמידים (`teacher.row.open_after`) | `--open` |
| ended | הסתיים (`teacher.row.ended`) | `--ended` |

**"פתיחה מחדש" on a row:** busy label "פותחים…" (`console.opening`, existing), then → `/t/:mid`. Failure: the IA line "create or reopen failed inline + retry": the row gets `.teacher-home__error` under its actions, reusing `console.failed` / `console.retry` wording (see 13.J gap 4).

**Filter** (only when lessons > 10): `input[type=search].teacher-home__filter` directly under "+ שיעור חדש", full width, 48 px, the `.teacher-home__input` look with no icon (the label is the placeholder). Filters by name as you type (no debounce needed below a few hundred rows), case- and niqqud-insensitive. Escape clears. A polite live region (`.visually-hidden`, `role="status"`) says how many rows match. Label and no-match line are IA gaps (13.J gap 3).

**Loading:** two `.teacher-home__skeleton` blocks (existing shimmer; reduced motion already stops it). **Anonymous user:** never renders; `/t` → `/login?next=/t`.

**Keyboard / SR:** header (logo alt, account text, sign-out) → h1 → "+ שיעור חדש" → (filter) → rows. Each row is a list item with an `h2`, so a screen-reader user jumps lesson to lesson by heading; the chip is a plain paragraph read after the name ("האיסור על טלפונים בבית הספר, שלב 3 מתוך 8"). Each action's accessible name includes the lesson: `aria-label="לשיעור: {name}"` / `"תכנון השאלות: {name}"` / `"פתיחה מחדש: {name}"` (visible text unchanged), otherwise ten identical "לשיעור" links are indistinguishable in a links list.

#### 13.D+ A new lesson from a previous one (teacher home `/t`, delta, 2026-10-25)
Designed against IA 13.5 and 13.15. Everything else in 13.D (header, chip, row edge colours, filter, skeleton) is unchanged.
Designed against IA §13.5 (A) and §13.15 (`ia-join-class-new-from-previous.md`). Lands in `docs/design/agora-classroom-ux.md` after §13.D. Everything else in §13.D (header, chip, row edge colours, filter, skeleton) is unchanged. All classes below exist in `apps/join-class/src/styles/teacher.scss` / `_components.scss` unless marked NEW.

#### 13.D.1 Decisions in one place
- **Row third action = a tertiary text button on its own line at the row's start edge** (`.btn.btn--tertiary.btn--small`, teal text, no fill, 44 px tall). Not an "עוד" overflow: a menu hides the only door to this feature from the place teachers already look, adds a popup with its own focus trap and Escape rule (Escape already means "one step back" here), and costs two taps for one action. Not a third button in the cluster: the IA forbids three equal buttons. A text button on a separate line, on the opposite side from the buttons cluster, reads as "a different kind of action" without hiding it.
- **"פתיחה מחדש" hint = visible sub-line, linked by `aria-describedby`.** Not `title`: hover is unreliable on a shared school laptop with a touchpad or touch screen, and `title` is never read by touch screen readers. The line is 14 px `--ink-muted`, under the buttons cluster, ended rows only.
- **One create area.** Every step replaces "+ שיעור חדש" in place, inside the existing card `.teacher-home__form`. No dialog, no new route.
- **During nameCopy the list shows normal rows** (both paths). Pick mode lasts only while picking.

#### 13.D.2 Wireframes (RTL; right = start)

**Idle, laptop 1280** (column 720 px). Rows now have a third line.
```
│                                                     השיעורים שלי           │ h1
│                                                  [ + שיעור חדש ]           │ .btn--primary .teacher-home__new
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  ┃ האיסור על טלפונים בבית הספר        [ תכנון השאלות ]   [  לשיעור  ]    │ │ title · secondary · PRIMARY
│  ┃ ● שלב 3 מתוך 8                                                       │ │ chip
│  ┃ שיעור חדש עם אותן שאלות                                              │ │ tertiary text btn, start edge
│  └──────────────────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  ┃ מבחנים בסוף שבוע                   [ תכנון השאלות ]  [ פתיחה מחדש ]   │ │ ended row (muted title)
│  ┃ ✓ הסתיים          ממשיכים מהשלב שבו עצרתם, עם מה שהתלמידים כבר כתבו  │ │ chip · hint (end-aligned, under buttons)
│  ┃ שיעור חדש עם אותן שאלות                                              │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
```
**Idle, phone 375** (row actions drop to their own line, `flex: 1`, primary at the end = left).
```
┌───────────────────────────────────────┐
│ מבחנים בסוף שבוע                       │
│ ✓ הסתיים                               │
│ [ תכנון השאלות ] [   פתיחה מחדש   ]    │ 44 px each
│   ממשיכים מהשלב שבו עצרתם, עם מה       │ hint wraps, 14 px muted
│               שהתלמידים כבר כתבו       │
│ שיעור חדש עם אותן שאלות                │ tertiary, 44 px tall, start edge
└───────────────────────────────────────┘
```
**Choose** (replaces "+ שיעור חדש"; laptop: two items side by side, 375: stacked, full width).
```
┌─ .teacher-home__form (role=group, aria-labelledby=lead) ───────────────┐
│                                                  עם אילו שאלות?        │ lead, semibold
│  [      שאלות חדשות      ]   [    שאלות משיעור קודם    ]               │ two .btn--secondary, equal
│                              השאלות, ההקדמה והסרטונים של שיעור שכבר    │ help under its button
│                              הכנתם                                     │ 14 px muted
│  ביטול                                                                 │ .btn--tertiary
└────────────────────────────────────────────────────────────────────────┘
375:  [ שאלות חדשות ]  /  [ שאלות משיעור קודם ] + help  /  ביטול   (one column)
```
**Pick mode** (create area = lead card; list keeps order and filter; each row one button).
```
┌─ .teacher-home__form ──────────────────────────────────────────────────┐
│                         בחרו שיעור. נעתיק את השאלות וההקדמה.           │ lead (id=pick-lead, tabindex -1)
│  ביטול                                                                 │ .btn--tertiary
└────────────────────────────────────────────────────────────────────────┘
  [ חיפוש לפי שם ...                                              ]        (only > 10 lessons)
  ┃ האיסור על טלפונים בבית הספר                          [  בחירה  ]       .btn--primary.btn--small
  ┃ ● שלב 3 מתוך 8                                                         no plan / copy / hint lines
  ┃ מבחנים בסוף שבוע                                     [  בחירה  ]
  ┃ ✓ הסתיים
375: same, "בחירה" drops under the chip, full width.
```
**Copy name form** (from pick or from a row; same card, list back to normal rows).
```
┌─ form.teacher-home__form ──────────────────────────────────────────────┐
│                       השאלות מתוך „מבחנים בסוף שבוע”                   │ lead, name in <bdi>
│                                                      שם השיעור החדש    │ label
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                                        ▓▓מבחנים בסוף שבוע▓▓      │  │ prefilled, all selected, focused
│  └──────────────────────────────────────────────────────────────────┘  │
│   נעתיק את השאלות, ההקדמה והסרטונים. קוד חדש, בלי התשובות של הכיתה    │ help, 14 px muted
│                                                            הקודמת.     │ (aria-describedby of input)
│                                               [  יצירה  ]   ביטול      │ primary · tertiary
└────────────────────────────────────────────────────────────────────────┘
```
**Busy**: `[ מכינים את השיעור... ]` on the primary, input + both buttons disabled, form `aria-busy="true"`.
**Error**: under the buttons, `role=alert`, 14 px `--danger`: "לא הצלחנו להכין את השיעור. נסו שוב." (or "אפשר להעתיק רק שיעורים שלכם"); typed name kept; "יצירה" enabled; focus back in the input.
**Empty state**: unchanged from §13.D (name form open, focused, no "ביטול", no choice).

#### 13.D.3 Components and variants
| Element | Markup / class | Variant |
|---|---|---|
| "+ שיעור חדש" | `button.btn.btn--primary.teacher-home__new` | unchanged |
| Create area wrapper | `.teacher-home__create` NEW, `aria-live` none, holds one step | fade in (13.D.6) |
| Step card | `.teacher-home__form` (existing card) | form element only for nameNew / nameCopy |
| Lead line | `p.teacher-home__lead` | existing |
| Choice buttons | `.teacher-home__choices` NEW (grid: 2 cols ≥ 600 px, 1 col below); each `.teacher-home__choice` NEW = button + optional help | `.btn.btn--secondary` (full width of its cell) |
| Help lines (choice, copy form) | `p.teacher-home__help` NEW: 14 px, `--ink-muted`, margin 0 | |
| "ביטול" | `button.btn.btn--tertiary` | as today |
| Label / input / actions / error | `.teacher-home__label`, `.teacher-home__input`, `.teacher-home__form-actions`, `.teacher-home__error` | existing |
| Row primary | "לשיעור" link / "פתיחה מחדש" button | `.btn--primary.btn--small` (unchanged) |
| Row secondary | "תכנון השאלות" | `.btn--secondary.btn--small` (unchanged) |
| Reopen hint | `p.teacher-home__hint` NEW, `id="reopen-hint-{id}"`, `flex: 1 1 100%`, `text-align: end`, 14 px `--ink-muted`; on < 600 px `text-align: start` under the stretched buttons | ended rows only |
| Row tertiary | `button.btn.btn--tertiary.btn--small.teacher-home__row-copy` NEW element, `data-action="copy"`, on a full-width line (`flex: 1 1 100%` wrapper `.teacher-home__row-foot` NEW, `justify-content: flex-start`); the button itself is content-width, `margin-inline-start: calc(-1 * var(--space-md))` so its text aligns with the title | 44 px min (`.btn--small`) |
| Pick button | `button.btn.btn--primary.btn--small`, `data-action="pick"`, in `.teacher-home__row-actions` | replaces both row actions |
| Status chip | `p.status-chip` | unchanged in every mode |

Row DOM order (= reading and Tab order): title, chip, actions (secondary, primary), hint, foot (copy), row error. Visual order on laptop matches because the actions wrap onto the title line only by flex flow, not by `order`.

#### 13.D.4 Pick mode details
- **Rows shown:** all lessons, same order, any status (IA 13.15.5). Ended rows keep their muted title and edge colour.
- **Row look:** title, chip, one "בחירה" in the primary slot (end side). No "תכנון השאלות", no hint, no copy line, no reopen error line. Rows get shorter; that is the one layout change of the mode switch (no height animation).
- **Filter:** shown under the lead card when lessons > 10, same input and live count. Its text carries over from the home into pick mode and back (it is one list). Escape in the filter with text clears it; Escape with an empty filter goes back to choose.
- **Leaving:** "ביטול" under the lead, or Escape anywhere on the page → choose, focus on "שאלות משיעור קודם". "בחירה" → nameCopy. A row deleted elsewhere disappears from the live list; if the teacher had already chosen it the server call fails with the usual message.
- **Exactly one lesson:** pick mode still shows (IA 13.15.6).

#### 13.D.5 The copy name form
- Lead `p.teacher-home__lead`: `teacher.copy.source`; the name sits in `<bdi dir="auto">` so English titles and the Hebrew quote marks stay in order.
- Label `teacher.copy.title_label`, `for` the input. Input `id="teacher-copy-title"`, value = source title, `maxlength` 200; on create: `focus()` then `select()` so typing replaces and Enter keeps it.
- Help `p.teacher-home__help#teacher-copy-help` under the input; input `aria-describedby="teacher-copy-help"` (plus the error id when shown).
- Actions: "יצירה" `.btn--primary` (submit) then "ביטול" `.btn--tertiary`, same as the new-name form. Empty name → `teacher.new.invalid`, `aria-invalid`, focus stays.
- **From a row far down the list:** the form renders at the top; call `scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })` on the create area before focusing, so the teacher sees where the step went.
- Pressing another row's copy action while a copy form is open replaces the source and drops the old form's lesson id (IA: closing the form drops the id).

#### 13.D.6 Motion
- Create area: each step mounts with `opacity 0 → 1`, `var(--dur-quick)` `var(--ease-out)`. No height, slide or scale animation; the list below moves once, instantly, as content changes height.
- Row action cluster in pick mode: same fade on the new buttons. Rows are never re-ordered or animated.
- Busy: no spinner; the label change is the feedback (as §13.D create states).
- `prefers-reduced-motion: reduce`: no fade (`animation: none`), `scrollIntoView` uses `behavior: 'auto'`.

#### 13.D.7 Accessibility
**Focus after each transition** (IA 13.15.2 back table, plus forward moves):
| Transition | Focus goes to |
|---|---|
| idle → choose | "שאלות חדשות" (group name "עם אילו שאלות?" is read with it) |
| choose → nameNew | the name input (as today) |
| choose → pick | the pick lead (`tabindex="-1"`), so the instruction is read; next Tab = "ביטול", then filter, then first "בחירה" |
| pick → nameCopy | copy input, text selected |
| row copy → nameCopy | copy input, text selected (after scroll) |
| back: choose → idle | "+ שיעור חדש" |
| back: nameNew → choose | "שאלות חדשות" |
| back: pick → choose | "שאלות משיעור קודם" |
| back: nameCopy (pick) → pick | the chosen row's "בחירה" (matched by lesson id; if the row is gone, the pick lead) |
| back: nameCopy (row) → idle | that row's "שיעור חדש עם אותן שאלות" (if gone, "+ שיעור חדש") |
| error | the input (refocus after re-enabling; disabled fields drop focus to `body`) |
| success | route change to `/t/:new/plan` (plan screen owns focus) |

- **Escape:** one keydown handler on `.teacher-home` while the flow is not idle; ignored while busy; in the filter, clears text first. In the empty state there is no back step.
- **Live regions:** busy: a `.visually-hidden` `role="status"` inside the create area says `teacher.copy.busy` (the button label change alone is not announced); `aria-busy="true"` on the form and on "יצירה". Error: `.teacher-home__error` `role="alert"`, id linked from the input's `aria-describedby`.
- **List in pick mode:** stays a `ul` of `li` with `h2` titles (heading navigation still works). It gains `aria-labelledby="pick-lead"` so entering the list announces the instruction. No `listbox`: the rows contain real buttons, and listbox would hide them and need arrow-key handling.
- **Accessible names** via the existing `teacher.row.for` (`{{action}}: {{name}}`): "בחירה: {name}" (`teacher.row.pick`), "שיעור חדש עם אותן שאלות: {name}" (`teacher.row.copy`). Visible text unchanged.
- **Reopen hint:** "פתיחה מחדש" gets `aria-describedby="reopen-hint-{id}"`; name stays "פתיחה מחדש: {name}".
- **Choice help:** "שאלות משיעור קודם" gets `aria-describedby` → its help line.
- **Targets:** every control ≥ 44 px tall (`.btn--small` min-height 44, inputs `--touch-target` 48); tertiary copy button has ≥ 8 px gap from the buttons line above.
- **Contrast:** tertiary `--teal-700` on `--bg-card` and help/hint `--ink-muted` already pass AA in §13.D; no new colours.

#### 13.D.8 Strings (copied from IA §13.15.4; no rewording)
| Key | HE | EN |
|---|---|---|
| teacher.new (kept) | + שיעור חדש | + New lesson |
| teacher.new.choose | עם אילו שאלות? | Which questions? |
| teacher.new.from_scratch | שאלות חדשות | New questions |
| teacher.new.from_previous | שאלות משיעור קודם | Questions from a previous lesson |
| teacher.new.from_previous_help | השאלות, ההקדמה והסרטונים של שיעור שכבר הכנתם | The questions, intro and videos of a lesson you already planned |
| teacher.new.pick_lead | בחרו שיעור. נעתיק את השאלות וההקדמה. | Choose a lesson. We'll copy its questions and intro. |
| teacher.row.pick | בחירה | Choose |
| teacher.row.copy | שיעור חדש עם אותן שאלות | New lesson, same questions |
| teacher.copy.source | השאלות מתוך „{{name}}” | Questions from "{{name}}" |
| teacher.copy.title_label | שם השיעור החדש | Name of the new lesson |
| teacher.copy.help | נעתיק את השאלות, ההקדמה והסרטונים. קוד חדש, בלי התשובות של הכיתה הקודמת. | We'll copy the questions, intro and videos. New code, none of the last class's answers. |
| teacher.copy.busy | מכינים את השיעור... | Preparing the lesson... |
| teacher.copy.failed | לא הצלחנו להכין את השיעור. נסו שוב. | Couldn't prepare the lesson. Try again. |
| teacher.copy.not_yours | אפשר להעתיק רק שיעורים שלכם | You can only copy your own lessons |
| teacher.row.reopen_hint | ממשיכים מהשלב שבו עצרתם, עם מה שהתלמידים כבר כתבו | Carry on from the step where you stopped, with what students already wrote |
| plan.copied_from | הועתק מהשיעור „{{name}}” | Copied from the lesson "{{name}}" |
| teacher.new.create / .cancel / .invalid (kept) | יצירה / ביטול / כתבו שם לשיעור | Create / Cancel / Write a name for the lesson |

Fit at 375 px: nothing needs a shorter variant. The longest button labels ("שיעור חדש עם אותן שאלות", "Questions from a previous lesson", "מכינים את השיעור...") sit in full-width or own-line buttons; `.btn` text may wrap to two lines (min-height, not fixed height). Question for the orchestrator only if a translator's DE/NL/ES "teacher.row.copy" exceeds ~32 characters: it would wrap to two lines inside its own row line, which is acceptable; no shorter key proposed.

#### 13.D.9 Not in this delta
`plan.copied_from` placement on the plan screen ("פרטי השיעור", one muted line, plain text) follows IA 13.15.2; it uses the existing muted paragraph style of §13.H.

### 13.E Console additions (`/t/:mid`, laptop 1280)

**Where the controls go, and why.** The step rail and its one forward control stay exactly as §5/§11 (rail band, forward at the rail's end). The status controls go in the **console bar**, at its end corner, as a group `.console__status` (NEW element), after "מקרן" and "תכנון השאלות":
- "השהיית השיעור" (`console.pause`): `.btn--secondary.btn--small` with a `--paused` mark before the words.
- "סיום השיעור" (`console.end`): `.btn--tertiary.btn--small`, `--ink` text (not danger: ending is reversible).

They are in a different band from the forward control and a different style (secondary/tertiary vs. the one primary), so pausing is never a mis-hit for "פתיחת השלב הבא". The forward control at the last step still reads "סיום השיעור" (as today) and opens the same choice, so the natural end and the early end are one dialog.

Live:
```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ ‹ השיעורים שלי   האיסור על טלפונים…   קוד: 482913  קוד QR  מקרן  תכנון השאלות │[▮▮ השהיית השיעור] סיום השיעור│ bar
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ (8)──(7)──(6)──(5)──[4]══(✓3)══(✓2)══(✓1)                 ┌ פתיחת השלב הבא: הצעות ┐       │ rail (unchanged)
│                                                            שלב 4 מתוך 8 · 00:12:40         │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ switch band · board (unchanged)                                                            │
```
(Drawn with the bar's start at the right, end group at the left; the separator `│` is a 1 px `--paper-line` inline-start border on `.console__status`.)

Paused:
```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ ‹ השיעורים שלי   האיסור על טלפונים…   קוד: 482913  קוד QR  מקרן  תכנון השאלות │            │ bar: status group empty
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ ▮▮  השיעור בהפסקה                                              [   המשך השיעור   ]          │ .lesson-banner--paused, 64px
├────────────────────────────────────────────────────────────────────────────────────────────┤  --paper-deep, ink text
│ (8)──(7)──(6)──(5)──[4]══(✓3)══(✓2)══(✓1)                 ┌ פתיחת השלב הבא: הצעות ┐ 50%   │ rail held: opacity .5,
│                                                            השיעור בהפסקה · 00:12:40        │ disabled, not-allowed
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ switch band: step actions disabled · board: chips not draggable, quick actions disabled    │
```
- **One primary while paused: "המשך השיעור"** (`console.resume`), `.btn--primary`, 56 px, in the banner's end corner, directly under the spot where "השהיית השיעור" was, so the eye that pressed pause finds resume one band lower. It gets focus when the pause lands (the button the teacher pressed is gone).
- The banner text reuses "השיעור בהפסקה" (`lesson.paused.title`): the same words the room sees; one name per concept.
- Rail: new modifier `.step-rail--held` → every step button and the forward control `disabled`, `opacity: .5`, `cursor: not-allowed` (today's `:disabled` uses `cursor: wait`, which means "busy", not "held"). The status line under the forward control replaces "שלב 4 מתוך 8" with "השיעור בהפסקה"; the clock keeps its value but stops (it is lesson time, not wall time).
- Switch band step actions, table quick actions, "+ בלי מכשיר" and chip drag are disabled (the callables refuse anyway). The "שולחנות | מה כתבו" switch, table sheets (read) and the projector link stay usable: looking is fine while paused.
- Table timers on cards freeze at their value (the server shifts them on resume).

Open (kept open after class, teacher came back):
```
│ bar: [▮▮ השהיית השיעור]  (no "סיום השיעור" here: it is in the banner)                      │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ ◎  השיעור פתוח לתלמידים                                        [   סיום השיעור   ]          │ .lesson-banner--open, 64px
├────────────────────────────────────────────────────────────────────────────────────────────┤  --teal-50, 2px --teal-600 block-end rule
│ rail: fully enabled (moving a step makes the lesson live; the banner then fades out)        │
```
"סיום השיעור" here is `.btn--secondary` (the open lesson is fine as it is; ending is a choice, not the expected next press). It opens the end choice with "סיום" only (IA 13.6).

Ended:
```
│ bar: status group empty                                                                    │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ ✓  השיעור הסתיים                                                [   פתיחה מחדש   ]          │ .lesson-banner--ended, 64px
├────────────────────────────────────────────────────────────────────────────────────────────┤  --paper-deep
│ rail held (as paused); status line "השיעור הסתיים"; board read-only (look back)             │
```
"פתיחה מחדש" (`teacher.row.reopen`) `.btn--primary`, busy "פותחים…", then the banner fades out and the rail unlocks at the step it ended on. Failure: the existing `.console__failure` band with `console.retry`.

**New block `.lesson-banner`** (console.scss): full width, 64 px min, flex, `--space-md` gutter, `.status-mark` 18 px + `__text` 18 px 700 at the start, `__action` at the end; modifiers `--paused` / `--open` / `--ended` set only the fill and rule. It is a `role="status"` region, so its text is announced once when it appears (polite). Appears and leaves with the 220 ms opacity fade; layout shift is accepted because it happens only on the teacher's own press (or on reopen).

**The end choice** (`dialog.end-choice`, NEW block on the native `<dialog>` opened with `showModal()`; visual from `.modal__body`: `--paper`, 1.5 px ink border, `--radius-lg`, 440 px wide; `::backdrop` = `--bg-overlay`, **no blur**: `.modal__overlay`'s `backdrop-filter` is costly on old laptops and §1.4 forbids it):
```
        ┌──────────────────────────────────────────────┐
        │ לסיים את השיעור?                             │ h2 22px 700 (console.end_confirm)
        │                                              │
        │ ┌──────────────────────────────────────────┐ │
        │ │                  סיום                    │ │ .btn--primary, full width, 56px,
        │ └──────────────────────────────────────────┘ │ autofocus             (console.end_now)
        │ ┌──────────────────────────────────────────┐ │
        │ │          להשאיר פתוח לתלמידים            │ │ .btn--secondary, full width, 56px
        │ └──────────────────────────────────────────┘ │                       (console.keep_open)
        │  התלמידים יוכלו להמשיך לכתוב ולדרג אחרי השיעור │ 14px --ink-muted, under its button
        │                                              │                 (console.keep_open_help)
        │                                     ביטול    │ .btn--tertiary, end corner (teacher.new.cancel / common.cancel)
        └──────────────────────────────────────────────┘
```
- Stacked full-width buttons, not a side-by-side pair: each option is a sentence, and the default is the first thing in reading order and the only filled one. The help line is tied to its button with `aria-describedby`.
- Already `open`: the dialog shows "סיום" and "ביטול" only.
- **Keyboard:** focus lands on "סיום" (Enter ends; this is the IA default). Tab: סיום → להשאיר פתוח לתלמידים → ביטול, trapped by `showModal`. Escape = "ביטול". Focus returns to the control that opened it.
- **Busy:** the pressed button keeps its own label with `aria-busy` and all three disabled (no new string); on success → `/t`. **Failed:** a line above the buttons reusing `console.failed` with `{label}` = the pressed option, and the buttons re-enabled (IA: "write failed inline + retry"; retry = press again).
- `aria-labelledby` = the title. No `role="alertdialog"`: nothing is destroyed.
- Phone fallback (a teacher on a phone): the same dialog at `width: calc(100% - 32px)`.

**Pause/resume busy and failure:** "השהיית השיעור" → busy (400 ms rule) → the paused layout. Resume failure: the `.console__failure` band with `console.retry` (IA: "resume failed inline + retry"); the banner stays.

**Keyboard order (console):** bar (back, title, code, QR, מקרן, תכנון השאלות, השהיית השיעור, סיום השיעור) → banner action when present → rail → forward → switch band → board. Shortcut: none (a single-key pause invites accidents with a projector remote).

### 13.F Student and projector: paused and ended

**Student paused** (`/m/:mid`, inside `StudentFrame`):
```
┌────────────────────────────────────────┐
│                    שולחן 5 · שיחה      │ header: the frame's usual line (step, table)
├────────────────────────────────────────┤
│                                        │
│                                        │
│                   ▮ ▮                  │ .status-mark--paused, 48px, --ink-soft
│              השיעור בהפסקה             │ 22px 700 ink            (lesson.paused.title)
│                חכו למורה               │ 18px --ink-muted        (lesson.paused.body)
│                                        │
│                                        │
└────────────────────────────────────────┘   no action footer, no cog change, nothing moves
```
**Student ended:**
```
┌────────────────────────────────────────┐
│          האיסור על טלפונים בבית הספר   │ header: the lesson name (there is no step any more)
├────────────────────────────────────────┤
│                    ✓                   │ .status-mark--ended, 48px, --ink
│              השיעור הסתיים             │ 22px 700                (lesson.ended.title)
│              תודה שהשתתפתם             │ 18px --ink-muted        (lesson.ended.body)
│  ┌──────────────────────────────────┐  │
│  │ ההחלטה                           │  │ existing DecisionCard (.decision), teal
│  │ טלפונים בתיק בזמן השיעור, בהפסקה  │  │ only when a decision exists; no dashed
│  │ מותר                              │  │ "waiting" variant here (no decision = two lines only)
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```
**How "paused" reads as calm, not as an error:** the same paper, ink and centred composition as "ממתינים למורה" (the screen every student has already seen calmly); the mark is ink-soft, never terracotta or danger; no exclamation, no countdown, no spinner; the words are about the teacher, not about a problem. The header line stays, so the student knows they have not been thrown out of their table.

**Components:** new block `.lesson-state` (`student-state.scss`, lazy, ≈ 1 kB): `__mark` (wraps `.status-mark`), `__title`, `__body`, modifiers `--paused`, `--ended`; layout copies `.waiting` (centred, `min-block-size: 50dvh`). The view is one component `LessonStateScreen({ status, headerLine, decision? })` rendered by `StudentStage` before the step slot.

**Draft:** the paused screen replaces the step's view, so WriteBox unmounts. The draft must be held in the step's controller state (or `liveDrafts`' local copy) and put back when "המשך" arrives (IA 13.6); the student sees their text exactly as left, cursor at the end.

**SR / focus:** the `.lesson-state` container is `role="status"` (polite), so "השיעור בהפסקה. חכו למורה." is read once on arrival. If focus was inside the removed step, move it to the `h1` (`tabindex="-1"`) so it is not lost on `<body>`. On resume, focus goes to the step's instruction heading the same way.

**Motion:** 220 ms opacity in, nothing else; instant under reduced motion. The phone does not vibrate or sound (§1.3).

**Projector paused** (`/t/:mid/screen`):
```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│                                  ▮ ▮                                     │ .status-mark 96px, --ink-soft
│                             השיעור בהפסקה                                │ .projector-instruction 64px
│                                                                          │
│                              4 8 2 9 1 3                                 │ .projector-code (160px), so late
│                                                                          │ joiners can join during the pause
├──────────────────────────────────────────────────────────────────────────┤
│ שיחה בשולחנות                                          קוד 482913 [QR]   │ .projector-band unchanged
└──────────────────────────────────────────────────────────────────────────┘
```
"חכו למורה" is not shown on the projector: the teacher is in the room; the IA gives the projector the title and the code only.

**Projector ended:**
```
│                                   ✓                                      │ mark 96px, --ink
│                             השיעור הסתיים                                │ 64px
│                             תודה שהשתתפתם                                │ 48px --ink-muted
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ ההחלטה                                                             │  │ existing .projector-decision
│  │ טלפונים בתיק בזמן השיעור, בהפסקה מותר                               │  │ (72px), only when decided
│  └────────────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────────┤
│ השיעור הסתיים                                                           │ band: no code, no QR (an ended
└──────────────────────────────────────────────────────────────────────────┘ lesson does not invite joining)
```
**Components:** existing `.projector-step`, `.projector-instruction`, `.projector-empty` (for the body line), `.projector-code`, `.projector-decision`, `.projector-band`; one modifier `.projector-band--ended` hides `__join`. The projector's existing 220 ms `projector-fade` covers the swap.

### 13.G Not your lesson, and not a lesson

**Not your lesson** (state of `/t/:mid`, `/t/:mid/plan`, `/t/:mid/table/:n`, `/t/:mid/screen`), the `.door` layout:
```
┌────────────────────────────────────────┐
│                [logo 48]               │
│      השיעור הזה שייך לחשבון אחר        │ h1 22px 700             (teacher.denied.title)
│        מחוברים כ־טל ירון (?)           │ 14px --ink-soft         (teacher.account)
│  ┌──────────────────────────────────┐  │
│  │           החלפת חשבון            │  │ .btn--primary, full     (teacher.denied.switch)
│  └──────────────────────────────────┘  │   → /login?next=<same path>
│  ┌──────────────────────────────────┐  │
│  │           השיעורים שלי           │  │ .btn--secondary, full   (teacher.home.title) → /t
│  └──────────────────────────────────┘  │
│                 יש לי קוד              │ .btn--tertiary          (login.have_code) → /
└────────────────────────────────────────┘
```
Same on a laptop, centred column 400 px. The account line is what makes the screen understandable: the teacher sees *which* account they are in. "החלפת חשבון" is primary because the IA's main case is "signed in with another account on a second computer". It signs out and goes to `/login?next=…`; after Google the same path loads. On the projector route the state is shown at normal size (the teacher sees it on the laptop before dragging the window).

**Not a lesson** (`/m/:mid` for a statement that is not a lesson, or not found), also `.door`:
```
│                [logo 48]               │
│      הקישור הזה לא מוביל לשיעור        │ h1                      (lesson.not_lesson)
│  ┌──────────────────────────────────┐  │
│  │             יש לי קוד            │  │ .btn--primary (the only way on) → /
│  └──────────────────────────────────┘  │
```
**Both:** `h1` gets focus on render (`tabindex="-1"`), so a screen reader starts with the reason. No `role="alert"` (it is the page, not an interruption). No retry button: neither is a network error. Loading before either: `SplashLoader`.

### 13.H Plan screen: "שפת השיעור" in "פרטי השיעור"

```
│ פרטי השיעור                                 │ h2 (plan.details.title)
│ ┌──────────────────────────────────────────┐ │ .plan-card.plan-details
│ │ שפת השיעור                               │ │ label 14px 700, visible  (plan.details.language)
│ │ ┌──────────────────────────────── ▾ ┐   │ │ native <select>, 48px, .plan-card__text look
│ │ │ עברית                              │   │ │
│ │ └────────────────────────────────────┘   │ │
│ │ ─────────────────────────────────────── │ │
│ │ [ סרטון פתיחה (קישור https, לא חובה) ]   │ │ existing fields, unchanged order
│ │ [ שם הדמות בצד הראשון ]                  │ │
│ │ [ שם הדמות בצד השני ]                    │ │
│ └──────────────────────────────────────────┘ │
```
- **First field of the card.** It changes every student screen and the projector, so it sits before the optional video and the names. One select, saved on `change` (the plan screen's save-on-blur rule, for a select), through the existing `runSave` / `fieldError` (inline "שמירה נכשלה" + retry) path.
- Options: the 7 languages of `getAvailableLanguages()`, each in its own native name with `dir="auto"` (as the a11y widget does), plus a first "unset" option (13.J gap 5). Default for a new lesson: the teacher's current UI language, written at creation, so a Hebrew teacher's lesson is Hebrew without touching the field.
- **Visible label**, unlike the other fields here (which use `aria-label` + placeholder only): a select has no placeholder, so without a visible label the teacher sees just "עברית" with no clue what it controls. New element `.plan-details__label` (`<label for>`), 14 px 700 `--ink-muted`.
- The teacher's own screens (home, plan, console) stay in the teacher's UI language; only the student side and the projector follow the lesson language. The plan screen does not re-render in the chosen language.
- On a student phone with a set lesson language, the a11y widget's language row shows its existing lock chip (13.J item 6 on its wording).

### 13.I Build order for the implementer
1. **Tokens/atoms:** `.status-mark` (+5 modifiers) in `_components.scss`; `.door` block replacing `.login*` (delete `.login__btn--guest`, `.login__divider`, `.login__card` shadow).
2. **Front door** `views/FrontDoor.ts` on `/` (replaces `requireAuth(Main)`): digit-only input, paste, auto-submit, prefill + error from the resolver; signed-in Google → `/t`. `ClassCode` stops rendering its own unknown screen and replaces to `/` with the code and the error flag.
3. **Login** restyle on `.door`, guest path removed, "יש לי קוד", `?next` default `/t`.
4. **Teacher home:** header account + sign-out, empty state (form open, no "ביטול", how-line), `.status-chip` rows, status-coloured row edge, reopen action, filter at > 10, per-row `aria-label`s.
5. **Lesson status read path** (`lessonCore` `status`, absent = live) wired into StudentStage, projector and console, before any write path, so old lessons render unchanged.
6. **Student** `LessonStateScreen` + `student-state.scss` (paused, ended + DecisionCard), focus/live-region handling, draft hold.
7. **Projector** paused and ended frames, `.projector-band--ended`.
8. **Console:** `.console__status` group (pause, end) in the bar; `.lesson-banner` (paused/open/ended); `.step-rail--held`; disabled board actions; `dialog.end-choice` replacing `window.confirm` in `confirmEnd`; last-step forward opens the same dialog.
9. **Not-your-lesson** state on the four `/t/:mid*` routes; **not-a-lesson** on `/m/:mid` (MainHub loader).
10. **Plan:** "שפת השיעור" select first in "פרטי השיעור".
11. **i18n:** every NEW key in all 7 locale files; delete `login.guest`, `login.or`.
12. **Verify** with Playwright at 360 × 640 (keyboard-open height ≈ 360 px: "אני מורה" in view), 390 × 844 and 1280 × 720, `dir=rtl` and `en`, `prefers-reduced-motion`, 200 % zoom; axe on each screen.

### 13.J IA gaps and conflicts found (reported, not changed)
1. **Teacher banner while paused has no own label.** The design reuses "השיעור בהפסקה" (`lesson.paused.title`) on the console banner, as the IA does for open/ended with `console.open_banner` / `console.ended_banner`. If the IA wants a separate `console.paused_banner` key for symmetry, the value should be the same words.
2. **Offline vs unknown code.** `/c/:code` today shows "unknown" when the lookup itself fails (no network). On slow school Wi-Fi a correct code would read as wrong and students would retype it. Proposed **NEW** `lesson.code.offline`: "אין חיבור. נסו שוב בעוד רגע." (?), shown in the same inline slot, code kept.
3. **Filter field has no label, and no "no match" line.** Proposed **NEW** `teacher.home.filter`: "חיפוש לפי שם" (?) (visually hidden label + placeholder) and `teacher.home.filter_none`: "אין שיעור בשם הזה" (?).
4. **Row reopen failure copy.** The IA says "create or reopen failed inline + retry" but names no string for reopen. The design reuses `console.failed` ("{label}") + `console.retry`; an IA-owned `teacher.row.reopen_failed` would be cleaner.
5. **"Unset" option of "שפת השיעור".** The IA rule "device language applies only when unset" needs a way to unset. Proposed **NEW** `plan.details.language.device`: "לפי השפה של כל תלמיד" (?). Also: the IA's code-type column says "statementSettings language field (Join's existing one)", but Join's existing fields are top-level `statement.defaultLanguage` + `statement.forceLanguage` (`lib/store.ts` ~l.1159, read by `applyStatementLanguage`). "Set" should map to `defaultLanguage = x, forceLanguage = true`; "unset" to `forceLanguage = false`.
6. **Lock chip wording on student phones.** The a11y widget's lock reads "נקבע על־ידי המנחה" (`a11y.language.locked`) with a 🔒 emoji, and its label has 🌐. In this app the concept is "המורה" (one name per concept) and the icon policy bans emoji. Proposed value: "נקבע על־ידי המורה"; drop both emoji.
7. **Ended console has no entry from the home.** The ended row offers "פתיחה מחדש" only, yet the IA lists "Console, ended: look back; reopen". The only way in without reopening is the plan screen's "‹ השיעור". Either accept (looking back = reopen, then end again) or make the row's lesson name a link to `/t/:mid`. Not designed in; IA's call.
8. **Early end location.** The IA puts "סיום השיעור" on the console but only "השהיית השיעור" is placed ("console bar"). §5 had the end only on the forward control at the last step, which makes ending at step 4 impossible. This design adds "סיום השיעור" to the bar (live) and to the open banner, and keeps it on the last-step forward; all open the same choice.
9. **Not-your-lesson "השיעורים שלי".** The IA uses `teacher.home.title` as a button label there; fine, noted only so nobody adds a synonym ("חזרה לשיעורים").
10. **`teacher.home.empty` with a colon** ("…לשיעור הראשון:") is now the lead line of the open form, which is how the colon reads correctly. The old value "עוד אין שיעורים. התחילו בשיעור חדש." must be replaced in all 7 locales, not appended.
11. **(?) items for a native read:** "מחוברים כ־{{name}}" (gender-plural address to one person is the app's register, but "מחובר/ת" is the alternative), and all proposed NEW strings above.
12. **Busy label for the end choice.** No IA string; the design avoids one (button keeps its label, `aria-busy`, disabled). If a visible busy word is wanted, `console.opening` ("פותחים…") does not fit; a NEW `console.ending` would be needed.

## 14. Lesson introduction

> **Decisions at build time (2026-10-22), they override the text below where they differ.**
> - **The text limit is 600 characters** (`INTRO_TEXT_MAX = 600`), not 800. Every "800" below reads 600. At 600 the projector keeps the question at 72 px, so the "shrink the question to 48 px" last step (UX 14.D, 14.J-4) is **dropped**: the text steps 48 -> 40 -> 32 px and stops there.
> - **Editor:** one textarea holding markdown-lite, with the three-button toolbar (UX 14.A / 14.B).
> - **Stored fields** (UX 14.J-8): paragraph children exactly as `createParagraphChildStatement` writes them: top-level `order` and `blockType` (`paragraph` | `li`), and `doc.listType`, `doc.contentHtml`, `doc.paragraphType`. The plain text is `statement`.
> - **"Video failed"** applies only to direct mp4 / webm files (a YouTube embed's own error is invisible to the page). On the phone it reads "המורה מקרין"; on the projector the text comes back with `projector.video_failed`.
> - **Firestore rules (IA 14.12 F):** checked, no change needed. The creator, or an admin of the lesson, may create, update and delete the paragraph children (`tests/rules/join-class-intro.test.mjs`).
> - **One embed reader** is `introVideoEmbed()` in `lib/classroom/introVideos.ts` (not `classSettings.ts`, so the student entry chunk does not carry it).

Status: draft · Date: 2026-10-22 · Designs against `../ia/agora-classroom.md` §14. The IA fixes the storage (paragraph children of the main statement + `statementSettings.introVideos` + `lessonPlan.projectorVideoId`), the limits (800 characters, 12 blocks, 5 videos, 60-character titles, 500-character links), the section order on the plan screen, the student order (question card, text, videos), the console as the only thing that drives the projector, no autoplay, no thumbnails, one player at a time, the labels of 14.3 and the states of 14.10. Open questions A-D take their defaults: the screen stays "תכנון השאלות", only YouTube and direct https `.mp4` / `.webm`, the introduction appears at Opening only, and the title is optional ("סרטון n").

This section decides layout, the editor's form, weight, motion and accessibility. Frames: phone 390 px (checked at 360 × 640), laptop 1280 px, projector 1280 × 720 (the worst real case) and 1920 × 1080. RTL: the **right edge is the start edge**, and wireframes are drawn as the user sees them. Strings come from IA 14.3. A string the IA does not have is marked **NEW** and listed in 14.J; nothing here renames an IA label. The rules of §1, §8 and §13.0 still bind: Assistant 400/700 only, tokens only, `transform` / `opacity` only, nothing loops, no emoji, no arrow glyphs in strings, busy after 400 ms.

### 14.0 Decisions in one place
| Question the IA left to UX (14.13) | Decision | Why, in one line |
|---|---|---|
| Editor form | **One `<textarea>` holding markdown-lite**, a 3-button toolbar above it that writes the markers, and a preview that appears once the text has formatting | Native IME, undo, autocorrect and RTL on every old phone and laptop. Zero dependencies. About 1.5 kB of teacher-only JS |
| Video row on the plan screen | A `.plan-card` like the question cards: handle, number, link, title, "מחיקה" | Same reorder code and keyboard, so a teacher who has ordered questions already knows how to order videos |
| Video row on the phone | A flat row: number and title, "לצפות כאן" at the end, and the "על המקרן עכשיו" tag under the title. Tapping the button opens the player in place inside the row | No poster, no sheet. The student never leaves the scroll |
| "על המקרן עכשיו" without colour alone | An inverted pill (paper text on ink), a CSS screen shape, and a 3 px ink start rule on the row | It still reads in greyscale and to a colour-blind student. A screen reader reads it as part of the row text |
| Projector text size | Measured fit: **48 → 40 → 32 px**, and a last step that shrinks the question (see 14.J-4) | 800 characters do not fit at 40 px under a 72 px question on 1280 × 720 |
| Text to video switch on the projector | A remount with the existing 220 ms `projector-fade`. The text is not kept behind the player | One thing per step (§6) |
| Console chooser | A labelled button group in the switch band's start side: "על המקרן:" then "הטקסט · 1. … · 2. …", with `aria-pressed` | The same pattern as the band's existing segment. Nothing to learn |
| Should the phone's open player stick while scrolling? | **No.** | `position: sticky` on an iframe repaints on every scroll frame on old Android. With at most 5 rows, the player is never far away |
| Should the projector show the title during play? | **Yes, always.** | A YouTube iframe gives no play event without the IFrame API (≈ 30 kB more). The title stays at 40 px, above the player and outside it |

### 14.A The text format (markdown-lite), and why not a rich editor
**What the teacher types** (one line = one block):
| Typed line | Block written | Shown as |
|---|---|---|
| `כמה משפטים…` | `paragraph` | a paragraph |
| `- דבר ראשון` (also `• ` or `* ` followed by a space) | `li`, `listType: ul` | a bullet item |
| `1. דבר ראשון` (any number, then `.` or `)`, then a space) | `li`, `listType: ol` | a numbered item. The renderer numbers each run 1, 2, 3, so the typed number never matters |
| `**מילה**` anywhere in a line | `contentHtml` gets `<strong>מילה</strong>`. `content` keeps the plain text without the stars | bold |
| an empty line | nothing (it only spaces the textarea) | — |

- **Count:** the counter counts the plain `content` of all blocks: no stars, no list markers, no line breaks. This is the same number the projector has to fit, and the same number the save refuses beyond.
- **Round trip:** loading the plan turns the children back into lines. A `paragraph` becomes its `content`, with `**` around each `<strong>` run. A `ul` item becomes `- ` plus its text. An `ol` run becomes `1. `, `2. ` and so on.
- **Rendering (phone, projector, preview):** one function `introNodes(blocks)` in `components/IntroText.ts`. It splits `contentHtml` on `<strong>` / `</strong>` with one regex and toggles bold. Every other tag is dropped, and the five HTML entities are decoded to text. The output is Mithril nodes, so nothing is injected as HTML (IA 14.2 "Video safety"). Consecutive `li` blocks with the same `listType` share one `<ul>` / `<ol>`.

**Why not `contenteditable` with Bold / List buttons (rejected):**
1. **Weight.** A usable one needs `execCommand` (deprecated, and it behaves differently per browser) and a paste sanitizer. In practice that means a library, which breaks Tal's "no editor library" rule.
2. **Unpredictable output.** Chrome writes `<div>`, Safari `<br>`, and pasted Word text brings `<span style="font-weight:700">`. Each would need mapping back into paragraph children.
3. **IME and bidi.** Hebrew and Arabic composition inside a `contenteditable` list item has known caret bugs on old Android WebViews. A textarea has none.
4. **What students see is unchanged:** they never see a star, because the renderer turns the markers into formatting. Only the teacher sees them, the preview shows the result, and the toolbar means the teacher never needs to learn the syntax.

### 14.B Plan screen, section "הקדמה" (`/t/:mid/plan`)
Its place in the page is fixed by IA 14.4: פרטי השיעור → השאלה לפתרון → **הקדמה** → השאלות לשולחנות. The video field leaves "פרטי השיעור" (`plan.details.video*` keys are retired).

**Laptop (720 px column, inside the existing `.plan__body`):**
```
┌────────────────────────────────────────────────────────────────────────┐
│ הקדמה                                                                   │ h2.plan__section-title (plan.intro.title)
│ מוצגת בשלב הפתיחה: גדול על המקרן ובטלפונים של התלמידים.                   │ p.plan__help (plan.intro.help)
│ ┌────────────────────────────────────────────────────────────────────┐ │ .plan-card.intro-editor
│ │ טקסט                                                                │ │ label 14px 700 ink-muted (plan.intro.text.label)
│ │ [ מודגש ] [ רשימה ] [ רשימה ממוספרת ]                                 │ │ .intro-editor__tools, role=toolbar, 40px
│ │ ┌────────────────────────────────────────────────────────────────┐ │ │
│ │ │ השבוע הנהלת בית הספר שוקלת **לאסור טלפונים** בכל שעות היום.     │ │ │ textarea.intro-editor__input
│ │ │ לפני שמחליטים, נשמע את שני הצדדים:                               │ │ │ rows=6, 16px 400, line-height 1.5
│ │ │ - יונתן חושב שהטלפון מפריע ללמידה                                │ │ │ dir=auto, resize: vertical
│ │ │ - נועה חושבת שהטלפון עוזר בחירום                                 │ │ │
│ │ └────────────────────────────────────────────────────────────────┘ │ │
│ │                                                       214 מתוך 800 │ │ .intro-editor__count, end side, tabular
│ │ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │ │ .intro-editor__preview (only when the
│ │   כך זה ייראה NEW                                                   │ │ text has ** or a list line)
│ │   השבוע הנהלת בית הספר שוקלת לאסור טלפונים בכל שעות היום.            │ │ the shared .intro-text block at 16px
│ │   לפני שמחליטים, נשמע את שני הצדדים:                                │ │ ("לאסור טלפונים" in 700)
│ │    • יונתן חושב שהטלפון מפריע ללמידה                                 │ │
│ │    • נועה חושבת שהטלפון עוזר בחירום                                  │ │
│ │ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│ סרטונים                                                                 │ h3.intro-videos__title 16px 700 (plan.intro.videos)
│ ┌────────────────────────────────────────────────────────────────────┐ │ li.plan-card.intro-video
│ │ ⋮⋮  1   [ https://youtu.be/abc123                          ]  מחיקה │ │ handle · number · link (ltr) · delete
│ │         [ איך זה נראה בכיתה בלי טלפונים                     ]        │ │ title field (plan.intro.video.title)
│ └────────────────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ ⋮⋮  2   [ https://vimeo.com/123                             ]  מחיקה │ │ aria-invalid → --danger border
│ │         אפשר קישור YouTube או קובץ וידאו שמתחיל ב־https://           │ │ .plan-card__error (plan.intro.video.invalid)
│ │         [ שם הסרטון                                         ]        │ │ placeholder = label
│ └────────────────────────────────────────────────────────────────────┘ │
│ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │
│                               + סרטון                                  │ button.plan__add (plan.intro.video.add)
│ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │
└────────────────────────────────────────────────────────────────────────┘
```

**Phone (390 px):** the same column. The toolbar's three buttons fit on one row (≈ 250 px at 14 px). The textarea is full width with `rows=6`. In each video row, the link field takes the full width and "מחיקה" drops under the title field at the end side:
```
┌──────────────────────────────────────┐
│ ⋮⋮ 1 [ https://youtu.be/abc123     ] │
│      [ איך זה נראה בכיתה בלי טל…   ] │
│                              מחיקה  │
└──────────────────────────────────────┘
```

**Toolbar (`.intro-editor__tools`, `role="toolbar"`, `aria-label` = "טקסט", `aria-controls` = the textarea):**
- **Three text buttons**, `button.intro-editor__tool`, 40 px tall with a 48 px hit area through padding, paper fill and a 1 px `--border-light` border, `--radius-full`, 14 px, in this order: "מודגש" (`plan.intro.bold`, drawn in 700 so the button shows what it does), "רשימה" (`plan.intro.list`), "רשימה ממוספרת" (`plan.intro.numbered`).
- **Words, not glyphs:** a "B" or a list icon would need an icon the set does not have, and a teacher reads words faster.
- **They are actions, not toggles:** no `aria-pressed`. Each button wraps or unwraps; it does not hold a state.
  - **מודגש:** wraps the selection in `**…**`. If the selection is already wrapped, the stars are removed. With no selection it inserts `****` and puts the caret in the middle.
  - **רשימה / רשימה ממוספרת:** adds `- ` or `1. ` to every non-empty line the selection touches. If all of those lines already carry that marker, the markers are removed. Switching from one list type to the other replaces the marker.
- **Each button calls `preventDefault()` on `pointerdown`.** The textarea therefore keeps its focus and selection, and **blur, and with it the save, does not fire on a toolbar press.** This is the detail that makes save-on-blur and a toolbar work together.
- **Inserts go through `document.execCommand('insertText')`, with `setRangeText` as the fallback**, so that Ctrl+Z undoes a toolbar action. `setRangeText` alone bypasses the browser's undo stack.

**Keyboard in the textarea:**
- `Ctrl` / `Cmd` + `B` toggles bold. It matches `e.code === 'KeyB'`, not `e.key`, because on a Hebrew layout `e.key` is "נ".
- **Enter on a list line** continues the list: `- ` is copied, and `n. ` becomes `n+1. `. Enter on a list line that has only its marker removes the marker, which ends the list (the behaviour of every word processor).
- Tab is not captured, so focus leaves the textarea as usual (no keyboard trap). Shift+Enter is a plain newline.

**Counter and limits (`p.intro-editor__count`, 14 px, `--ink-soft`, `tabular-nums`, end side):**
- It reads "214 מתוך 800" (`plan.intro.text.count`) and is tied to the textarea by `aria-describedby`, so a screen reader hears it on focus. It is **not** a live region: it would announce every keystroke.
- **Over 800:**
  - the count turns `--danger` in 700;
  - the textarea gets `aria-invalid="true"` and a `--danger` border;
  - `p.plan-card__error` "ארוך מדי. קצרו ל־800 תווים." (`plan.intro.text.too_long`) appears at the start side, `role="alert"`, so it is announced once, when the limit is crossed.
  - Blur does not save. "שמירה" in the bar moves focus to the textarea and does not save the text (the other fields still save).
  - There is **no `maxlength`:** a pasted long text would otherwise be cut without a word. The teacher sees the overflow and shortens it.
- **Over 12 blocks:** the same treatment, with the line **NEW** "אפשר עד 12 שורות" (?) (14.J-2).

**Preview (`.intro-editor__preview`):**
- It appears only when the text contains `**` or a list line. Plain paragraphs look the same in the textarea, so a preview of them would only take space.
- The look is a dashed 1 px `--border-medium` box with an `--paper-soft` fill, the label **NEW** "כך זה ייראה" (?) at 14 px `--ink-muted`, then the shared `.intro-text` at 16 px.
- It is rendered by the same `introNodes()` the phone uses, so it costs no extra code. It updates on input, throttled to one `requestAnimationFrame`.
- It is `aria-hidden="true"`: it repeats the textarea, and a screen-reader user already gets the structure from the markers.

**Saving the text (IA 14.4):**
- **On blur of the textarea, save the whole text, through the existing `runSave(key 'intro:text')` / `fieldError` path.** "שמירה נכשלה" + "נסו שוב" appear under the textarea.
  - The controller parses the lines into blocks and diffs them against the loaded children by position.
  - It creates, updates or deletes only the blocks that changed, through `createParagraphChildStatement` (create) and the existing update and delete helpers, in one batch.
  - So one edited sentence is still one write. See 14.J-1 for how this reads the IA's "per block".
- **Saved:** the bar's "שמירה" turns to the teal "נשמר" (existing). The section has no saved mark of its own: one place says "saved".

**Video rows (`li.plan-card.intro-video` inside `ul.plan__list.intro-videos__list`):**
- **Handle `span.plan-card__handle`**, the existing element. A second `createDragReorder` instance (`introReorder`) is used, because its ids are video ids. Drag works by the handle; on the handle, ArrowUp / ArrowDown move the row, and focus stays on the moved handle (the existing `focusHandleAfterMove`).
  - The handle's `aria-label` is `plan.reorder.aria` with `{name}` = the title, or "סרטון n".
  - The move announcement needs a masculine form (14.J-3).
- **Number `span.intro-video__n`**, 16 px 700 `--ink-soft`, `tabular-nums`, 24 px wide. It is the same number the console and the phone show, so "video 2" means the same row everywhere. It is `aria-hidden`, since the labels already carry the position.
- **Link field:** `input.plan-card__text.intro-video__url`, `type="url"`, `inputmode="url"`, `dir="ltr"`, `autocomplete="off"`, `spellcheck="false"`, `maxlength` 500.
  - Placeholder "https://…"; `aria-label` "קישור" + the number (`plan.intro.video.url`).
  - Weight 400, not the question card's 600: a URL is not a heading.
- **Title field:** `input.plan-card__hint.intro-video__title`, `maxlength` 60, `dir="auto"`. Its placeholder and `aria-label` are "שם הסרטון" (`plan.intro.video.title`), and the `aria-label` adds the number.
  - Enter in the link field commits and moves focus to the title field. Enter in the title field blurs (saves).
- **Delete:** `button.btn.btn--tertiary.btn--small.plan-card__delete` "מחיקה" (`plan.delete`).
  - `aria-label` uses `plan.delete.aria` with `{name}` = the title, or "סרטון n".
  - There is no confirm, the same as for the questions.
  - If the deleted video is the one on the projector, readers fall back to the text, because the id no longer resolves.

**Video validation and saving:**
- **On blur of the link:** an empty link in a row that was never saved does nothing; the row stays a draft.
  - An invalid link (not https, or not YouTube / `.mp4` / `.webm`, checked by `introVideoEmbed()`) gives `aria-invalid`, a `--danger` border, and the line "אפשר קישור YouTube או קובץ וידאו שמתחיל ב־https://" (`plan.intro.video.invalid`, `role="alert"`) under the field. Nothing is saved.
  - **The error is shown on blur, never while typing. Once shown, it is re-checked on every input and clears the moment the link is valid,** so the teacher sees the fix land.
- **Valid link:** the row is saved through `runSave('intro:video:<id>')`. One write sends the whole `introVideos` array (order and titles travel together, IA 14.2), and on the first such write it also deletes `videoUrl`.
- **Title:** saved on blur. An empty title saves too and shows as "סרטון n".
- **A draft row** (no valid link yet) is drawn with the idle handle (`.plan-card__handle--idle`, the existing new-card look). It cannot be dragged and is not sent. "שמירה" drops empty draft rows silently, and draft rows with an invalid link keep their error.
- **"+ סרטון"** (`button.plan__add`, existing dashed card) adds a draft row at the end and focuses its link field.
  - At 5 rows the button is replaced by `p.plan__help` "אפשר עד 5 סרטונים" (`plan.intro.video.max`). The text is not a disabled button, because a disabled button hides why.
- **Legacy lesson:** `introVideosOf(main)` returns the old `videoUrl` as row 1 with an empty title. The teacher sees one row and changes nothing to keep it.

**Empty state:** the section title, the help line, the toolbar and the empty textarea with the placeholder "כמה משפטים על הדילמה ועל מה שמחכה לכיתה" (`plan.intro.text.placeholder`), the count "0 מתוך 800", then "סרטונים" and the dashed "+ סרטון". No "empty" message is needed: the dashed button and the placeholder are the invitation.

**Loading:** the existing `.plan__skeleton`, with one extra `--tall` block for this section.

**Focus order:** h2 → toolbar (3 buttons) → textarea → (error line is read through `aria-describedby`, not as a tab stop) → for each row: handle → link → title → "מחיקה" → "+ סרטון".

### 14.C Student Opening (`/m/:mid`, step 1, 390 px)
```
┌──────────────────────────────────────┐
│                                פתיחה │ header (stepLabel)
│                         צופים ביחד   │ instruction: opening.watch, or opening.read with no videos
│ ┌──────────────────────────────────┐ │
│ │ השאלה של השיעור                  │ │ .opening__card (existing)
│ │ לאסור טלפונים בבית הספר?         │ │ 22px 700
│ └──────────────────────────────────┘ │
│                                      │ 24px
│ השבוע הנהלת בית הספר שוקלת **לאסור   │ .intro-text, 18px 400, line-height 1.55
│ טלפונים** בכל שעות היום. לפני        │ on paper, no card (§1.4: the card is
│ שמחליטים, נשמע את שני הצדדים:        │ the question; the text is reading matter)
│   • יונתן חושב שהטלפון מפריע ללמידה  │ ul, markers at the start (right)
│   • נועה חושבת שהטלפון עוזר בחירום   │
│                                      │ 24px
│ סרטונים                              │ h2.intro-videos__title 14px 700 ink-muted (opening.videos)
│ ┌──────────────────────────────────┐ │ ol.intro-videos > li.intro-video-row
│ ┃ 1. איך זה נראה בכיתה בלי טלפונים │ │ 3px ink start rule = on the projector
│ ┃ [▭ על המקרן עכשיו]               │ │ .intro-video-row__live (ink pill, paper text)
│ ┃                    [▶ לצפות כאן] │ │ .btn--secondary 48px (opening.play)
│ ├──────────────────────────────────┤ │
│ │ סרטון 2                          │ │ untitled: "סרטון n", no number prefix
│ │                    [▶ לצפות כאן] │ │
│ └──────────────────────────────────┘ │
│ (no primary; the teacher opens Side) │
└──────────────────────────────────────┘
```
**Row open** (after "לצפות כאן" on row 2; row 1, if it was open, closes):
```
│ ├──────────────────────────────────┤ │
│ │ סרטון 2                          │ │
│ │ ┌──────────────────────────────┐ │ │ .intro-video-row__player, 16:9, radius-md
│ │ │       (YouTube player)       │ │ │ iframe created now, not before; no autoplay
│ │ └──────────────────────────────┘ │ │ the student presses the player's own play
│ └──────────────────────────────────┘ │
```

**Layout and components:**
- `.opening` (existing) keeps the card. Then come `div.intro-text.intro-text--phone`, a new shared block (14.G), and `section.intro-videos` (new, in `student-c2.scss`).
- With no text and no videos, `.opening--centered` is kept: exactly today's screen (IA 14.8 Empty).
- **Row `li.intro-video-row`:**
  - a grid with two columns: `1fr` for the title and the tag, `auto` for the button;
  - 12 px block and 16 px inline padding, `--bg-card`, a 1 px `--paper-line` divider between rows; the list sits in one `--radius-lg` box, like a settings list;
  - a minimum height of 64 px.
- **Title `.intro-video-row__title`:** 18 px 700, wraps (never ellipsis on the phone), `dir="auto"`. The label is "n. title". Untitled rows show "סרטון n" with no prefix, the same rule as the console (14.J-6).
- **Button `.intro-video-row__play`:** `.btn.btn--secondary`, 48 px, with the existing `.opening__play-icon` CSS triangle and "לצפות כאן". It is the only interactive control in a closed row; the row itself is not a button, so it is one clear target.
- **On the projector, `.intro-video-row--live`:**
  - a 3 px `--ink` `border-inline-start`;
  - under the title, `span.intro-video-row__live`: a 24 px pill, `--ink` fill, `--paper` text, 14 px 700, `--radius-full`, holding a 10 × 7 px CSS screen shape (`::before`: a 1.5 px paper outline box) and "על המקרן עכשיו" (`opening.on_projector`).
  - That makes three cues besides colour: words, a shape, and a heavier edge. The pill is part of the row's text, so a screen reader reads "1. איך זה נראה…, על המקרן עכשיו, לצפות כאן".
  - **No live region:** the students are looking at the wall, and an announcement every time the teacher switches would be noise.
- **Open player:** the button is replaced in place by the player (`iframe` or `video`, `.intro-video-row__player`, `inline-size: 100%`, `aspect-ratio: 16 / 9`), spanning both grid columns.
  - Focus moves to the player, so a keyboard or screen-reader user can press play.
  - The row is scrolled into view with `scrollIntoView({ block: 'nearest' })`: `behavior: 'smooth'` normally, `'auto'` under reduced motion.
  - **There is no close button.** Opening another row closes this one, and the teacher opening Side closes it too (IA 14.6). Each extra control is one more thing on a screen that should be put down.
  - The iframe is `youtube-nocookie.com/embed/<id>?playsinline=1&rel=0`, `allow="encrypted-media; picture-in-picture; fullscreen"`, `allowfullscreen`, `referrerpolicy="strict-origin-when-cross-origin"`, `title` = the row's label. A file is `<video controls playsinline preload="none">`.
- **Video failed (file `onerror`):** "המורה מקרין" (`opening.video_failed`) replaces that row's button or player, as `p.intro-video-row__note`, 16 px `--ink-muted`, `role="status"`. A YouTube embed error shows inside the player itself; the app cannot see it (14.J-5).

**States (IA 14.8):**
| State | Look |
|---|---|
| Empty | today's centred card |
| Loading text | `main.description` split on line breaks, as plain `<p>`s, in the same `.intro-text` block. When the `get` returns, the formatted nodes replace them **with no fade** (a fade would draw the eye to a change that carries no meaning). The block keeps its size where it can: same font, same line height |
| Text fetch failed | the plain `description` stays. No error |
| Video failed | "המורה מקרין" in that row |
| Done | the teacher opens Side; any player unmounts with the view |

**Focus order:** header → instruction → card → text (not focusable; read in order) → the "סרטונים" heading → each row's button (or player). There is no bottom action.

**Weight (phone):** no image, no poster, no iframe until a tap. The new CSS is about 1.4 kB unminified in the lazy `student-c2.scss`, plus `intro-text.scss` at about 0.5 kB. The JS is `IntroText.ts` (the renderer, about 0.6 kB) and the row logic inside `OpeningView`. There is one extra `get`, and only when `description` is non-empty.

### 14.D Projector Opening (`/t/:mid/screen`)
**Text (default, `projectorVideoId` absent or null), 1280 × 720:**
```
┌──────────────────────────────────────────────────────────────────────────┐
│                          השאלה של השיעור                                 │ .projector-eyebrow 32px ink-muted
│                     לאסור טלפונים בבית הספר?                             │ .projector-question 72px 700
│                                                                          │ 32px gap
│      השבוע הנהלת בית הספר שוקלת לאסור טלפונים בכל שעות היום.             │ .intro-text.intro-text--projector
│      לפני שמחליטים, נשמע את שני הצדדים:                                  │ 48 / 40 / 32px by fit, line-height 1.4
│        •  יונתן חושב שהטלפון מפריע ללמידה                                │ text-align: start (right), the column
│        •  נועה חושבת שהטלפון עוזר בחירום                                 │ centred, max-inline-size 30em
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│ פתיחה                                                  קוד 482913 [QR]   │ .projector-band (unchanged)
└──────────────────────────────────────────────────────────────────────────┘
```
- **The text column is start-aligned, not centred.** Centred multi-line paragraphs and centred list markers are hard to read from the back row. The column itself sits in the centre of the stage, under the centred question.
- **Fit:**
  - `.intro-text--projector` starts with `data-fit="48"`.
  - After render and on `resize`, and when the text changes, the view checks `stage.scrollHeight > stage.clientHeight`. If it overflows, it steps to 40, then to 32. That is at most two re-measures, on a laptop.
  - If the text still overflows at 32, `.projector-step--opening-long` sets the question to 48 px (14.J-4). On 1280 × 720 that fits about 800 characters at a 30em measure; at 1920 × 1080 it never comes to that.
  - The stage never scrolls: the projector is not interactive.
- **Empty text:** today's projector, the eyebrow and the question, without the old "להפעיל את הסרטון" button (removed, together with `.projector-video-play` and `projector.playVideo`).

**Video n (`projectorVideoId` = an id):**
```
┌──────────────────────────────────────────────────────────────────────────┐
│                     לאסור טלפונים בבית הספר?                             │ the question as the eyebrow: 32px ink-muted,
│                  1. איך זה נראה בכיתה בלי טלפונים                        │ one line, ellipsis · the title: 40px 700
│      ┌──────────────────────────────────────────────────────────────┐    │
│      │                                                              │    │ .intro-stage__player 16:9
│      │                  (YouTube player, not playing)               │    │ width = min(100%, (free height) × 16/9)
│      │                                                              │    │ radius-md, no border, no shadow
│      └──────────────────────────────────────────────────────────────┘    │
├──────────────────────────────────────────────────────────────────────────┤
│ פתיחה                                                  קוד 482913 [QR]   │
└──────────────────────────────────────────────────────────────────────────┘
```
- ~~**Size:** the player takes the largest 16:9 box the stage allows: `inline-size: min(100%, calc((100dvh - 64px band - 2 × var(--space-xl) - 32px eyebrow - 56px title - 2 × var(--space-md)) * 16 / 9))`. On 1280 × 720 that is about 860 × 484.~~ Superseded by §15.C (the player fills the window above a 64 px strip; the "Video n" wireframe above, with its eyebrow, is replaced by the layouts in §15.C).
  - ~~"Full screen" is the player's own fullscreen button (`allowfullscreen`). The app adds no control of its own (§6, IA 14.6).~~ Superseded by §15.C: the projector document has its own full screen and control.
- **Loaded, never playing:** the same embed URL as the phone, no `autoplay`. The teacher clicks the player's play on the projector window. A file uses `<video controls preload="none">` on the phone; on the projector it is `preload="metadata"` (§15.C).
- **The title stays during play** (decision in 14.0). It sits outside the iframe, so it never covers the picture.
- **Video failed (file `onerror`):** the text layout comes back, and the video's label shows above the eyebrow at 32 px `--ink-muted`. The IA gives no words for the failure itself (14.J-5).

**Switch:** the step section is keyed by `projectorVideoId ?? 'text'`, so any change remounts it with the existing `projector-fade` (220 ms opacity). Under reduced motion `--dur-base` is 0, so the swap is instant. The old iframe is removed on the swap, which stops its sound: a video never keeps playing behind the text.

**Live text:** the projector listens to the paragraph children (IA 14.2), so a typo fixed on the plan screen reaches the wall. That change re-runs the fit check, with no fade (it is the same item).

**SR:** the projector is not a reading surface, but the iframe still gets `title` = the video label, and the text is real headings and lists.

### 14.E Console switch band at Opening (`/t/:mid`, 1280)
```
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ על המקרן:  [▭ הטקסט] [1. איך זה נראה בכיתה…] [2. ראיון עם המנהלת] [סרטון 3]   │ שולחנות│מה כתבו│ │ 48px band
├────────────────────────────────────────────────────────────────────────────────────────────┤
          ▲ on = ink fill, paper text, the screen shape before the words
```
- **Block `.projector-pick`** (NEW, `console-board.scss`), in `.switch-band__actions`, as the Opening step's only action:
  - `span.projector-pick__label` "על המקרן:" (`console.opening.show`), 14 px 700 `--ink-muted`, with an `id`;
  - `div.projector-pick__group`, `role="group"`, `aria-labelledby` = that label;
  - one `button.projector-pick__item` per choice: first "הטקסט" (`console.opening.text`), then each video as "n. title", or "סרטון n" when it has no title.
- **Item:**
  - 40 px tall, `0 var(--space-md)` padding, 14 px, `--radius-full`, a 1 px `--border-medium` outline on paper;
  - `max-inline-size: 14ch` with ellipsis, the full label in `title` and in the accessible name. Five long titles fit on 1280 next to the "שולחנות | מה כתבו" segment (≈ 1160 px).
- **On, `.projector-pick__item--on` + `aria-pressed="true"`:**
  - `--ink` fill, `--paper` text, 700;
  - the CSS screen shape (`.projector-pick__mark`, 12 × 8 px, the same drawing as the phone's tag) before the words.
  - Off items carry `aria-pressed="false"`. This is the band's own segment pattern (`.switch-band__segment-btn` with `aria-pressed`), drawn heavier, because this one changes what the room sees, not what the teacher sees.
- **Why buttons with `aria-pressed`, not a `radiogroup`:** in a radio group, the arrow keys select as they move. Every arrow press would write `projectorVideoId` and flash the projector. With buttons, Tab moves between them and Enter or Space chooses one.
- **Press:**
  - The chooser writes `lessonPlan.projectorVideoId` (null for "הטקסט").
  - The **on** state follows the lesson doc (the truth the projector also follows), not the click.
  - If the snapshot has not confirmed within 400 ms, the pressed item gets `aria-busy="true"` and a 1.5 px dashed `--ink` outline, and the group is disabled until the confirmation (no new string).
  - **Failed:** the existing `.console__failure` band shows `console.failed` with `{label}` = the item's label, plus `console.retry`, and the on-state stays where the doc says.
- **Shown when** the step is Opening **and** the lesson has at least 1 video. With no videos the row is not drawn (IA 14.6), and the band holds only the segment. With no text, "הטקסט" stays, and the projector then shows the question alone.
- **Held (paused or ended):** disabled with the other step actions (`heldNow`), since the projector shows the paused screen anyway.
- **Next step:** the server clears `projectorVideoId` on every step change (IA 14.2), and the row leaves with the step.
- **Below 1280** (a small laptop, or a teacher on a tablet): `.switch-band` gets `flex-wrap: wrap`, and the chooser takes its own line above the segment. This is an exception to §5's "the band never moves", accepted because it only happens on a screen narrower than the one §5 designs for. It never scrolls sideways.
- **Keyboard order:** rail → forward control → "על המקרן:" items → segment → board, which is the reading order of the band.

### 14.F Motion and reduced motion
| Where | Motion | Reduced motion |
|---|---|---|
| Preview appearing on the plan screen | none (it simply appears; it is below the caret) | none |
| Video row added or removed on the plan screen | 140 ms opacity in (`--dur-quick`); removal is instant | instant |
| Reorder | the existing `dragReorder` behaviour (no new motion) | as it is |
| Phone: a player opening | none, then `scrollIntoView` `smooth` | `auto` |
| Phone: the "על המקרן עכשיו" tag moving | 140 ms opacity on the new tag | instant |
| Phone: plain text swapped for formatted | none | none |
| Projector: text to video and back | `projector-fade` 220 ms on remount | instant (`--dur-base: 0`) |
| Console: on-state change | none (fill swap) | none |
Nothing loops, and nothing moves by itself on a phone.

### 14.G New and changed blocks
| Block | File | Notes |
|---|---|---|
| `.intro-text` (`--phone`, `--preview`, `--projector`; `[data-fit]`) | NEW `styles/intro-text.scss`, imported by `components/IntroText.ts`, so Vite puts it once in the shared lazy chunk | `--intro-size` per modifier (phone `--font-size-lg`, preview `--font-size-base`, projector 48/40/32 px); `p + p` 0.6em; `ul`/`ol` `padding-inline-start: 1.4em`, `disc` / `decimal`; `li + li` 0.25em; `strong` 700; `dir="auto"` on each block, so an Arabic or English lesson reads correctly |
| `.intro-editor` (`__tools`, `__tool`, `__input`, `__count`, `__count--over`, `__preview`, `__preview-label`) | `teacher.scss` | `__input` copies the `.plan-card__text` field look at weight 400, `min-block-size: 9em`, `resize: vertical` |
| `.intro-video` (`__n`, `__url`, `__title`) | `teacher.scss` | a modifier on `.plan-card`, reusing `__handle`, `__delete`, `__error` |
| `.intro-videos` (`__title`, `__list`) | `teacher.scss` + `student-c2.scss` | the plan list and the phone list share the name; each lazy file styles its own context |
| `.intro-video-row` (`--live`, `--open`, `__title`, `__live`, `__play`, `__player`, `__note`) | `student-c2.scss` | the phone row |
| `.intro-stage` (`__eyebrow`, `__title`, `__player`) + `.projector-step--opening-long` | `projector.scss` | replaces `.projector-video` and `.projector-video-play` |
| `.projector-pick` (`__label`, `__group`, `__item`, `__item--on`, `__mark`) | `console-board.scss` | the console chooser |
| Removed | — | `.projector-video-play`, `projector.playVideo`, `plan-details__video`, `plan.details.video*`, `opening.video_title`, `projector.videoTitle` |

Tokens only. The pill and the "on" item use `--ink` / `--paper` (16:1). `--danger` appears on errors only. Dark mode and high contrast follow Join's existing overrides; nothing here hardcodes a colour (the projector QR's `#fff` is untouched).

### 14.H Accessibility summary
- **Targets:** toolbar buttons 40 px tall with 48 px hit areas (mouse-first teacher surface, as §9 allows for the console); every phone control is 48 px or more.
- **Labels:** the textarea has a visible `<label>` "טקסט". The toolbar has `role="toolbar"` and a name. Link and title fields have `aria-label`s with the row number. Each delete and handle names its video.
- **Errors:** `aria-invalid` plus a `role="alert"` line, announced once. The counter is described, not live.
- **No keyboard traps:** Tab leaves the textarea. Reorder works with arrows on the handle. The console chooser works with Tab and Enter.
- **Language:** `dir="auto"` on the textarea, the titles and each rendered block. Links are `dir="ltr"`.
- **Zoom 200 %:** the plan column reflows (the toolbar wraps to two rows). Phone rows stack the button under the title. On the projector, zoom is not a concern.

### 14.I Build order
1. **Shared types first:** `introVideos`, `lessonPlan.projectorVideoId`, and `videoUrl` marked `@deprecated`. Repack them to functions and deploy rules before any client writes them (IA 14.2, the strict-parse trap). Check the rules for paragraph children (IA 14.12 F).
2. **`lib/classroom`:** the `INTRO_*` constants, `introVideosOf(main)`, `introVideoEmbed(url)` (replaces `youtubeEmbedUrl` and `embedUrlOf`; `videoUrlOf` is deleted), and the markdown-lite `parseIntro(text) → blocks` / `introToText(blocks)`, with unit tests: lists, bold, entity escaping, limits, round trip.
3. **`components/IntroText.ts` + `intro-text.scss`:** the safe renderer, with tests showing that only `<strong>` survives.
4. **Plan screen:** the "הקדמה" section (`planIntro.ts` + `PlanIntro.ts`, so `PlanScreen.ts` stays under 500 lines): the editor, the toolbar, keys, the counter, the preview, the diff save, video rows with `introReorder`, the max line, the legacy migration on first save. Remove the video field from "פרטי השיעור".
5. **Student Opening:** the text (description first, then one `get`), the rows, one player at a time, the live tag, "קוראים ביחד".
6. **Projector:** the paragraph listener, the text with fit, the video stage keyed by `projectorVideoId`, removal of the play button.
7. **Console:** `.projector-pick` in `SwitchBand` (new attrs `introVideos`, `projectorVideoId`, `onProject`), the write, busy and failure. The server clears `projectorVideoId` on step change.
8. **i18n:** every 14.3 key and the NEW keys of 14.J in all 7 locales; delete the retired keys.
9. **Verify with Playwright:**
   - phone at 390 × 844 and 360 × 640, in `he` and `en`: 0, 1 and 5 videos; a 60-character title; text at 800 characters;
   - projector at 1280 × 720 and 1920 × 1080 with 800 characters (no overflow), and on a video;
   - console at 1280 with 5 long titles (no overflow);
   - reduced motion, 200 % zoom, and axe on each screen.

### 14.J IA gaps and conflicts found (reported, not changed)
1. **"Saved per block on blur" vs. one textarea.** The design saves on the textarea's blur and writes only the changed blocks (create / update / delete by position, in one batch). Writes stay per block, but the blur belongs to the whole text. If the IA means one input per block, the editor becomes a list of inputs, and lists and bold get much harder to type. I recommend that the IA adopt the textarea reading.
2. **No string for "more than 12 blocks".** `INTRO_BLOCKS_MAX` has no message. Proposed **NEW** `plan.intro.text.too_many`: "אפשר עד 12 שורות" (?). It is shown and blocks the save the same way as `too_long`.
3. **`plan.reorder.moved` is feminine** ("הועברה", for שאלה). For a video (סרטון) it must be masculine. Proposed **NEW** `plan.intro.video.moved`: "הועבר למקום {{n}} מתוך {{total}}". `plan.reorder.aria` has no gendered verb and can be reused.
4. **800 characters do not fit at 40 px on 1280 × 720 under a 72 px question.** About 670 characters fit at 32 px with a 2-line 72 px question. The design measures and steps the text 48 → 40 → 32, and as a last step shows the question at 48 px (`.projector-step--opening-long`). That conflicts with IA 14.9's "the question … at 72 px" for long texts only. The alternative is to lower `INTRO_TEXT_MAX` to about 600.
5. **Projector "video failed" has no words, and YouTube failures are invisible.** IA 14.10 says "the text comes back, with the video's title" but gives no string. The design shows the label alone, which reads as a heading rather than as a failure. Proposed **NEW** `projector.video_failed`: "{{title}} · לא נטען" (?). Also, a YouTube embed that fails (removed, private, embedding disabled) shows YouTube's own error inside the iframe. Detecting it needs the YouTube IFrame API, about 30 kB, which is not worth it. So "video failed" on the phone and on the projector applies only to direct files.
6. **"1. <title>" with no title** would read "1. סרטון 1". The design drops the number prefix for untitled videos on the console, the phone and the projector ("סרטון 1"). The IA's wording "1. <title>" should note this.
7. **Preview label.** The plan screen's preview needs a label. Proposed **NEW** `plan.intro.preview`: "כך זה ייראה" (?). If the IA prefers no preview, the toolbar alone still works, but teachers will see the stars with nothing to explain them.
8. **Field names to check against the model.** IA 14.2 writes `blockType: paragraph | li` and `doc.listType`. The shared `ParagraphSchema` uses `type` (`ParagraphType.paragraph | li`) and `listType`, and its `contentHtml` also allows `<em>`. The renderer here keeps `<strong>` only (as the IA says), and drops `<em>` to plain text. The build lane should write whatever `createParagraphChildStatement` actually emits.
9. **Plain-text placeholder may be shorter than the final text** (IA 14.12 E): `description` can be a three-paragraph preview. Swapping in the formatted text then grows the block. That is accepted: it happens once, within a second, with no animation.
10. **Console band wraps below 1280 px.** This is an exception to §5's "nothing in the first two bands ever moves", and it is limited to narrower screens. It never scrolls sideways.

## 15. Projector: one screen or two, full-screen video

> **Decisions of the orchestrator (2026-10-22), applied while building:**
> - The `<details>` "מקרן" menu stays (UX 15.A); "show control on arrival" in `here` mode is accepted (UX 15.K-2).
> - The IA rule "no button on the projector window ever navigates it to the console" is narrowed to: **a window the console opened never navigates to the console.** If `window.close()` is refused in a window the console did not open, "סגירת המקרן" becomes "חזרה לשיעור".
> - The 64 px video strip stays (UX 15.K-4). The hint is hidden where Fullscreen is unsupported (UX 15.K-7).
> - §14.D's text "player's own full screen only; the app adds no control" is struck: the projector document has its own full screen and control (15.5).
> - Projector-only `preload="metadata"` for file videos; the control's aria label is "כפתורי המקרן"; the projector root is `role="region"`.

Designed against IA §15 (`ia-join-class-projector.md`, Tal 2026-10-22). Open questions A-G use their defaults. Routes, labels and behaviour are the IA's. This section decides only what IA 15.12 hands to UX: the form of the bar group, where and how the teacher control looks, the window size, letterboxing, and the title before play. It also covers the busy-label fix.

### 15.0 Decisions in one place
| Question (IA 15.12) | Decision | Why, in one line |
|---|---|---|
| Bar group: two buttons or a menu | **A small menu**: `details.projector-menu`, with the summary "מקרן" and a panel holding the two actions, each with its help line under it | Two buttons push the bar past 1280 px and the help lines have nowhere to go. The menu costs one extra click (reported in 15.K-1). |
| Where the teacher control sits | **The start corner of the bottom band** (bottom-right in Hebrew), over the step name. The step name fades out while the control shows. | It is the one corner that never covers the stage, and the code and QR stay in the band's end corner. Slideshow controls sit in a bottom corner, so teachers already know the place. |
| How it reads on a 4 m wall | An inverted pill pair (`--ink` fill and `--paper` text), 48 px tall, 24 px text, with a 2 px ring. The ring keeps it visible on paper and on black. It fades in over 140 ms and out over 220 ms. The pointer is hidden while the control is hidden. | It is visible to the teacher who woke it, and it is gone 3 s later, before the class has a reason to look at it. |
| Window opening size | 1280 × 720, `popup`, named `projector-<mid>` | The projector type is designed for 1280 × 720 (UX §6, 14.D), it matches most projectors at 16:9, and it gets dragged and made full screen anyway. |
| Video letterboxing | Video mode is a **black screen**. The player is the largest box that fits above a 64 px **video strip** (the dark twin of the code band), centred, with black bars. | The iframe swallows pointer and key events, so the strip is the one place where a mouse move still reaches the page. It also carries the title. |
| Title before play | The video's label in the strip's start corner: 32 px, one line, ellipsis. It stays during play. | Keeps the 14.0 decision ("the title stays during play"). It never covers the picture, and the app cannot detect a YouTube play without the IFrame API anyway. |
| IA question: show in the console that a window is open? | **No, in phase 1.** Pressing "מקרן בחלון נפרד" again brings the same window forward. | No new string, no polling. Revisit if teachers lose the window. |
| IA question: does the hint need a drawing? | Words, plus a 64 × 32 inline SVG glyph (a laptop, an arrow, a big screen) before them, `aria-hidden` | About 300 bytes, and it says "the other screen" before the teacher has read a word. |

### 15.A Console bar: the "מקרן" menu (`/t/:mid`)
Bar at 1280, closed. The single `console__link` "מקרן" is replaced by the menu, in the same place:
```
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ‹ השיעורים שלי   האיסור על טלפונים…   קוד: 482913  קוד QR  [מקרן ▾]  תכנון השאלות  הגדרות │[▮▮ השהיית השיעור] סיום השיעור│
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```
Open (the panel hangs under the summary and grows toward the bar's end, which is left in RTL):
```
                                   [מקרן ▴]
                 ┌──────────────────────────────────────┐
                 │ ┌──────────────────────────────────┐ │
                 │ │ ⧉  מקרן בחלון נפרד               │ │ .btn--secondary, full width, 48px, text start
                 │ └──────────────────────────────────┘ │
                 │  לשני מסכים: גררו את החלון למסך       │ 14px --ink-muted (teacher.screen.open_window_help)
                 │  של הכיתה                             │
                 │ ┌──────────────────────────────────┐ │
                 │ │ ▣  הצגה במסך הזה                 │ │ .btn--secondary, full width, 48px
                 │ └──────────────────────────────────┘ │
                 │  למחשב אחד שמחובר למקרן. Esc מחזיר     │ 14px --ink-muted (teacher.screen.show_here_help)
                 │  לשיעור.                              │
                 └──────────────────────────────────────┘
                   340px, --paper, 1.5px --ink border, --radius-lg, --shadow-sm
```
Window blocked (the panel stays open; the message sits between the two actions, so the alternative is right under it):
```
                 │ ┌──────────────────────────────────┐ │
                 │ │ ⧉  מקרן בחלון נפרד               │ │
                 │ └──────────────────────────────────┘ │
                 │  לשני מסכים: גררו את החלון למסך…      │
                 │ ┃ הדפדפן חסם את החלון. אפשרו חלונות   │ .projector-menu__blocked, role="alert"
                 │ ┃ קופצים לאתר, או בחרו "הצגה במסך     │ --terra-50 fill, 3px --terra-300 inline-start
                 │ ┃ הזה".                               │ rule, --ink text 14px 700 (teacher.screen.blocked)
                 │ ┌──────────────────────────────────┐ │
                 │ │ ▣  הצגה במסך הזה                 │ │
```

**Why a menu, not two buttons.** I measured the bar at 1280 with today's items (back, code, "קוד QR", "תכנון השאלות", "הגדרות", pause, end): about 935 px before the title. Two small buttons plus a group label add about 330 px, which leaves the lesson title about 15 px, so it disappears. The menu adds about 70 px, and the title keeps about 260 px. The help lines are what tell a teacher which action is theirs (IA 15.4). In a menu they can sit, readable, under each action. In a bar they could only be tooltips, which a first-time teacher never sees. The menu is also the bar's existing pattern (`ConsoleSettings`, a native `<details>`), so it opens, closes and handles Escape the way the teacher already knows.

**Block `.projector-menu`** (NEW, `console.scss`, bar section). `views/teacher/ProjectorMenu.ts`:
- `details.projector-menu`, `position: relative`.
- `summary.btn.btn--tertiary.btn--small.projector-menu__toggle`: the text "מקרן" (`teacher.screen.title`) and `span.projector-menu__chevron` (a CSS border-chevron, 8 px, `aria-hidden`, which turns 180° with `transform` when `[open]`). It drops the marker the same way `.console__settings-toggle` does. The native `<details>` gives the summary its expanded state for screen readers.
- `div.projector-menu__panel`: absolute, `inset-block-start: calc(100% + var(--space-xs))`, `inset-inline-start: 0`, `inline-size: min(340px, calc(100vw - 2 * var(--space-md)))`, `padding: var(--space-md)`, flex column, `gap: var(--space-xs)`, `z-index: var(--z-dropdown, 10)`. It uses the look of `.console__settings-panel`.
- `button.btn.btn--secondary.projector-menu__item` × 2: `inline-size: 100%`, `justify-content: flex-start`, `min-block-size: 48px`, with `aria-describedby` = its help line's id. Inside: `svg.projector-menu__glyph` (16 px, `aria-hidden`; ⧉ = two overlapping windows for the window action, ▣ = one screen with corner marks for this screen) and the label.
- `p.projector-menu__help`: `--font-size-sm`, `--ink-muted`, `margin: 0 0 var(--space-sm)`, `padding-inline-start: var(--space-md)`. Its ids are `projector-help-window` and `projector-help-here`.
- `p.projector-menu__blocked`: shown only after a blocked open. `role="alert"`, `--terra-50`, `border-inline-start: 3px solid var(--terra-300)`, `padding: var(--space-sm) var(--space-md)`, `--radius-sm`, 14 px 700 `--ink`. This is an instruction, not a lesson failure, so it uses ink text, not `--danger`.

**Behaviour.**
| Press | What happens |
|---|---|
| "מקרן בחלון נפרד" (`teacher.screen.open_window`) | If the module still holds a live reference (`win && !win.closed`), it calls `win.focus()`. Otherwise it calls `window.open('', 'projector-<mid>', 'popup,width=1280,height=720')`. If that returns a window whose `location.href` is `about:blank`, it sets the location to `/t/<mid>/screen?mode=window`. If the window already shows the projector, it is **not** reloaded, so its full screen survives. Then `focus()`. The panel closes and focus returns to the summary. Never `noopener`: the console needs the reference, and `window.close()` needs a script-opened window. |
| …returns `null` (blocked) | No navigation. The panel stays open and `.projector-menu__blocked` appears (announced once). Focus stays on the pressed item, so the next Tab lands on "הצגה במסך הזה". The message clears when the panel closes or the next open succeeds. |
| "הצגה במסך הזה" (`teacher.screen.show_here`) | In the same click handler, **first** `requestFullscreen()` on `document.documentElement` (the gesture belongs to this document), **then** `m.route.set('/t/<mid>/screen', {}, { state: { fromConsole: true } })`. A full-screen refusal is swallowed: the projector then opens windowed and shows "מסך מלא" (15.B). |
| Escape, or a click outside | Closes the panel. Escape returns focus to the summary (same code as `ConsoleSettings`). |

Paused, open or ended lesson: the menu stays usable. Looking is fine while held (13.E).

Clean-code note: `ConsoleSettings` and `ProjectorMenu` share "details + Escape + click outside". Extract it once as `barPopover(vnode)` (oncreate/onremove helpers) rather than copying it.

Keyboard order (replaces 13.E's): bar (back, title, code, QR, **מקרן** → [panel: מקרן בחלון נפרד → הצגה במסך הזה], תכנון השאלות, הגדרות, השהיית השיעור, סיום השיעור) → banner action → rail → forward → switch band → board.

### 15.B The teacher control on the projector (`/t/:mid/screen`, both modes)
**Place.** Fixed in the **start corner of the bottom band**: `position: fixed; inset-block-end: var(--space-sm); inset-inline-start: var(--space-xl)`, which matches the band's own padding. While the control shows, the band's step name (`.projector-band__step`, or in video mode the strip's title) fades to `opacity: 0`, so the control replaces it rather than lying over it. The code and the QR in the band's end corner are never covered. It is fixed, not inside the band's DOM, so it is in the same place on loading and load-error screens, which have no band.

`here` mode, shown (1280 × 720, Opening, text):
```
┌──────────────────────────────────────────────────────────────────────────┐
│                          השאלה של השיעור                                 │
│                     לאסור טלפונים בבית הספר?                             │
│      השבוע הנהלת בית הספר שוקלת לאסור טלפונים בכל שעות היום…             │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│ [מסך מלא] [‹ חזרה לשיעור]                             קוד 482913 [QR]    │ band 64px: control at the start
└──────────────────────────────────────────────────────────────────────────┘   corner, "פתיחה" faded out under it
   (drawn RTL: "חזרה לשיעור" is first, at the right edge; "מסך מלא" only while not full screen)
```
`here` mode, hidden (the normal state on the wall): the band as in UX §6, "פתיחה" at the start corner, no pointer.

`window` mode, first load (the hint, 15.D):
```
┌──────────────────────────────────────────────────────────────────────────┐
│                     לאסור טלפונים בבית הספר?                             │
│                                                                          │
│                         ┌─────────────────────────────────────────────┐  │
│                         │ [💻→▭]  גררו את החלון הזה למסך של הכיתה      │  │ .projector-hint, 32px
│                         │         ולחצו "מסך מלא"                     │  │
│                         └──────────────────────────────────────▼──────┘  │ arrow over "מסך מלא"
├──────────────────────────────────────────────────────────────────────────┤
│ [סגירת המקרן] [■ מסך מלא]                             קוד 482913 [QR]    │
└──────────────────────────────────────────────────────────────────────────┘
```
`window` mode, full screen, shown: `[סגירת המקרן] [יציאה ממסך מלא]` in the same place.

**Contents per mode** (IA 15.4, in reading order from the start corner):
| Mode | Buttons | Filled (`--on`) |
|---|---|---|
| `here`, full screen | "חזרה לשיעור" (`projector.back`) | "חזרה לשיעור" |
| `here`, not full screen, and full screen is supported | "חזרה לשיעור", "מסך מלא" (`projector.fullscreen`) | "חזרה לשיעור" |
| `window`, not full screen | "מסך מלא", "סגירת המקרן" (`projector.close`) | "מסך מלא" |
| `window`, full screen | "יציאה ממסך מלא" (`projector.fullscreen_exit`), "סגירת המקרן" | none |
| `window`, close refused | "מסך מלא" / "יציאה ממסך מלא", "חזרה לשיעור" (15.K-3) | as above |
| Full screen unsupported (`fullscreenEnabled` false, e.g. iPhone) | no full-screen button in either mode | — |

"חזרה לשיעור" carries the bar's back chevron (`‹`, the same character and spacing as `.plan__back-chevron`), so "back" looks the same in the console and on the projector.

**Block `.projector-controls`** (NEW, `projector.scss`). `views/teacher/projector/ProjectorControls.ts`:
- `div.projector-controls`, `role="group"`, `aria-label` = `projector.controls` "פקדי המקרן" (?). `display: flex; gap: var(--space-sm); z-index: 2`. Hidden = `opacity: 0; pointer-events: none`. It stays in the tab order on purpose (see Focus).
- Custom properties set on the block and re-pointed in video mode:
  - `--pc-bg: var(--ink); --pc-fg: var(--paper)` on paper. These flip together in dark mode, so the pair always contrasts (16:1 light, 13:1 dark).
  - `.projector--video .projector-controls { --pc-bg: var(--video-ink); --pc-fg: var(--video-letterbox) }` on the black strip.
- `button.projector-controls__btn`: `min-block-size: 48px`, `padding: 0 var(--space-lg)`, `font-size: 24px`, 700, `--radius-full`, `color: var(--pc-bg)`, `background: var(--pc-fg)`, `border: 2px solid var(--pc-bg)`. On paper this reads as an ink-outlined paper pill. On black, the pill is black with a light outline.
- `.projector-controls__btn--on`: `background: var(--pc-bg); color: var(--pc-fg); box-shadow: 0 0 0 2px var(--pc-fg)`. The outer ring is what keeps a filled ink pill visible against the black video strip, and a filled light pill visible against a light page.
- `:focus-visible`: `outline: var(--focus-ring-width) solid var(--pc-bg); outline-offset: var(--focus-ring-offset)`. It uses the inverse colour, not terra, because terra-600 on black falls to about 3:1.
- `span.projector-controls__chevron` inside the back button, `aria-hidden`.
- Below 1100 px wide: `font-size: 20px; min-block-size: 44px`. Then the widest set (window mode, about 370 px) plus the band's code group (about 440 px) still fit a 1024 px projector with no overlap.
- Root state: `.projector[data-controls='on'|'off']`. `[data-controls='off'] { cursor: none }`. `[data-controls='on'] .projector-band__step, [data-controls='on'] .intro-stage__title { opacity: 0 }`.

**Showing and hiding.** One module, `projectorControls` state + `wake()` / `sleep()`. Listeners go on `document` from `oncreate` and are removed in `onremove`:
| Input on that device | Effect |
|---|---|
| `pointermove` that moved ≥ 4 px from the last position (`POINTER_WAKE_PX`) | show, restart the 3 s idle timer. The distance check drops the synthetic `mousemove` Chrome fires when the page re-renders under a still pointer, so a step change never wakes the control on the wall. |
| `pointerdown` (a tap, a click on the stage) | show, restart |
| `keydown` Tab / Shift+Tab | show and move focus into the control (first button, or last for Shift+Tab). `preventDefault` only when it was hidden. |
| `focusin` inside the control (Tab arriving from the YouTube iframe) | show |
| Pointer over the control (`pointerenter` … `pointerleave`) | the idle timer pauses. It never hides under a resting cursor. |
| Any other key (arrows, PageUp/PageDown, B, F5: what presentation clickers send) | nothing. A clicker press must not flash the control on the wall. |
| 3 s with none of the above (`PROJECTOR_CONTROLS_IDLE_MS`) | hide. If focus was inside, move it to the root (`.projector`, `tabindex="-1"`) so focus never sits on something invisible. |

On arrival in `here` mode, the control shows for one idle period (the teacher has just clicked), so the way back is seen once (15.K-2). In `window` mode it shows with the hint (15.D).

**Focus.**
- `here`, arrival: `focus({ preventScroll: true })` on "חזרה לשיעור". A screen-reader user hears "פקדי המקרן, חזרה לשיעור, כפתור". Because the last input was a mouse click, `:focus-visible` draws no ring on the wall.
- `window`, first load: focus on "מסך מלא", so Enter makes the window full screen.
- Hidden = transparent, not `visibility: hidden`. It stays reachable: a keyboard user's Tab from anywhere, including out of the iframe, lands on it, and `focusin` shows it in the same frame.
- Fullscreen toggle: the label swaps and focus stays on the same button. No `aria-pressed`, because the label already names the action.

**Esc, per mode** (IA 15.4):
| | `here` | `window` |
|---|---|---|
| Esc while full screen | The browser leaves full screen (the page may never see the key). `fullscreenchange` / `webkitfullscreenchange` with no fullscreen element → **leave** (below). | The browser leaves full screen. The page stays; the control label becomes "מסך מלא". |
| Esc while not full screen | `keydown` Escape → **leave** | Hides the control and blurs it. Never navigates. |
| Esc with focus inside the YouTube iframe, not full screen | The key never reaches the page (iframe). The way back is the strip: a mouse move or tap there shows the control (15.K-6). | — |
| Player's own fullscreen, exited by its own button | Chrome pops back to document full screen, so nothing happens. A full exit (Esc) → leave (IA G). | — |

**Leave (`here`):** a `leaving` flag makes it run once, because Safari can deliver both the key and the fullscreen change. If still full screen, `exitFullscreen()` first. Then, if `history.state?.fromConsole`, `history.back()`, which keeps the console's `?view=` exactly as it was. Otherwise `m.route.set('/t/<mid>', {}, { replace: true })`. Browser back does the same through the router.

**Close (`window`):** `window.close()`, then on the next tick, if `!window.closed`, the button swaps to "חזרה לשיעור" (IA 15.4; see 15.K-3).

### 15.C Video mode fills the window
At Opening with a `projectorVideoId`, `TeacherProjector` adds `.projector--video` to the root and **does not render the code band** (IA 15.5: no band, no question line). The stage becomes a black screen with a 64 px strip at the bottom, in the same place and at the same height as the band, so the control has one home on every screen.

```
1920 × 1080 (16:9)                                   1024 × 768 (4:3 projector)
┌────────────────────────────────────────────┐       ┌──────────────────────────────┐
│▌┌────────────────────────────────────────┐▐│       │██████████ 68px █████████████│
│▌│                                        │▐│       │┌────────────────────────────┐│
│▌│     YouTube 16:9, 1806 × 1016          │▐│ 49px  ││  16:9 player, 1024 × 576   ││
│▌│     (YouTube's thumbnail + its play)   │▐│ bars  │└────────────────────────────┘│
│▌└────────────────────────────────────────┘▐│       │██████████ 68px █████████████│
├────────────────────────────────────────────┤       ├──────────────────────────────┤
│ 1. איך זה נראה בכיתה בלי טלפונים             │ 64px  │ 1. איך זה נראה בכיתה…         │
└────────────────────────────────────────────┘ strip └──────────────────────────────┘

2560 × 1080 (21:9 ultrawide)                         1280 × 800 (16:10, common projector)
┌──────────────────────────────────────────────────┐ ┌──────────────────────────────┐
│███ 377px ███┌──────────────────────┐███ 377px ███│ │█████████ 8px ███████████████│
│█████████████│  16:9, 1806 × 1016   │█████████████│ │  16:9 player, 1280 × 720     │
│█████████████└──────────────────────┘█████████████│ │█████████ 8px ███████████████│
├──────────────────────────────────────────────────┤ ├──────────────────────────────┤
│ 1. איך זה נראה בכיתה בלי טלפונים                   │ │ 1. איך זה נראה בכיתה…         │
└──────────────────────────────────────────────────┘ └──────────────────────────────┘
```

**Layout (`.intro-stage`, changed; `projector.scss`):**
- `.projector--video .projector__stage { padding: 0; }`
- `.intro-stage`: `display: grid; grid-template-rows: minmax(0, 1fr) $projector-band-height; block-size: 100vh; block-size: 100dvh;` (the `vh` line is the fallback for Safari before 15.4). `background: var(--video-letterbox)`. The 220 ms `projector-fade` stays.
- `.intro-stage__screen` (NEW element): `display: grid; place-items: center; min-block-size: 0; overflow: hidden`.
- `.intro-stage__player`:
  - **YouTube iframe:** `inline-size: min(100vw, calc((100dvh - #{$projector-band-height}) * 16 / 9)); aspect-ratio: 16 / 9; border: 0; border-radius: 0;`. YouTube letterboxes a 4:3 or vertical upload inside its own 16:9 frame.
  - **File `<video>`:** `inline-size: 100%; block-size: 100%; object-fit: contain`. The browser letterboxes to the file's own ratio (16:9, 4:3, or a vertical phone video), so the box never forces 16:9 on a file.
- `.intro-stage__strip` (NEW element): `display: flex; align-items: center; padding: 0 var(--space-xl); color: var(--video-ink); border-block-start: 1px solid var(--video-rule)`.
- `.intro-stage__title`: 32 px (the projector floor), 700, one line, ellipsis, `max-inline-size: 100%`. It fades to 0 while the control shows (15.B).
- Retired: `.intro-stage__eyebrow` and the old `calc(100dvh - band - …)` width formula (14.D's "Video n" wireframe and its Size bullet).

**New tokens** (shared `_tokens.scss`, **not** overridden by dark mode or the playful themes: a letterbox is black on any theme, the same physical rule as the QR's white quiet zone):
```scss
--video-letterbox: #000000;
--video-ink: #f4ece0;            // = dark-mode --ink, 17.6:1 on black
--video-rule: rgba(244, 236, 224, 0.16);
```
High contrast (`[data-high-contrast]`, `prefers-contrast: more`): `--video-ink: #ffffff`, `--video-rule: #ffffff`.

**What shows before play:**
- YouTube: its own thumbnail and big play button (no `autoplay`, as §14), plus our title in the strip.
- File: `<video controls playsinline preload="metadata">` on the projector only, so the first frame and the duration show instead of a black box. The phone keeps `preload="none"` (15.K-9).

**Entering and leaving full screen with video:**
- Full screen belongs to the document, not the player (IA 15.2). A video chosen while full screen just fills the full-screen window. Another video swaps the iframe inside the same document, so full screen stays. "הטקסט" or the next step brings back the band and the text, and full screen stays.
- The player's own fullscreen button still works (`allowfullscreen` stays). The teacher never needs it, and it ends with its player.
- `here` mode, the one-screen video flow:
  1. Console: "על המקרן: 1. …".
  2. "מקרן ▾" → "הצגה במסך הזה": full screen, video mode.
  3. Click the player's play. The pointer is now over the iframe, and YouTube hides its own cursor.
  4. Esc: full screen ends, back to the console. The iframe is removed with the page, so the sound stops.
- Swap motion: the step section stays keyed by `projectorVideoId ?? 'text'`, with the 220 ms `projector-fade`. The band and strip swap with it: there is no separate animation, and the fade covers both.

### 15.D The first-open window hint (`window` mode)
**Block `.projector-hint`** (NEW, `projector.scss`):
- `p.projector-hint`, `role="status"`, so it is read once, politely.
- Position: fixed, `inset-block-end: calc(#{$projector-band-height} + var(--space-md))`, `inset-inline-start: var(--space-xl)`, `max-inline-size: min(18em, calc(100vw - 2 * var(--space-xl)))`.
- Look: 32 px, 700, `background: var(--pc-bg); color: var(--pc-fg)`, `padding: var(--space-md) var(--space-lg)`, `--radius-lg`, flex with `gap: var(--space-md)`.
- `svg.projector-hint__glyph`: 64 × 32, `currentColor` strokes, a small laptop, an arrow, and a larger screen. `aria-hidden`.
- `::after`: a 12 px CSS triangle on the block-end edge, `inset-inline-start: var(--space-xl)`, pointing down at the first control button ("מסך מלא").
- Copy: "גררו את החלון הזה למסך של הכיתה ולחצו "מסך מלא"" (`projector.window_hint`).
- Shown on every load in `window` mode while not full screen, together with the control. The idle timer is suspended while the hint shows.
- Leaves on `fullscreenchange` into full screen, or after 10 s (`PROJECTOR_HINT_MS`): 220 ms opacity out, and the control then follows the normal idle rule.
- Not shown in `here` mode. Not shown when full screen is unsupported either: its words ask for "מסך מלא", which would not exist; the console help line already says to drag, and a drag-only hint would need a new string (15.K-7).

### 15.E Busy labels (IA 15.3, "found while reading")
| Where | Today | Key after | HE | EN |
|---|---|---|---|---|
| `StepRail` forward ("פתיחת השלב הבא") | `console.opening` | `console.busy_opening` (renamed) | פותחים… | Opening… |
| `LessonBanner` "פתיחה מחדש", `TeacherHome` row reopen | `console.opening` | `console.busy_opening` | פותחים… | Opening… |
| `TeacherConsole` `statusGroup` "השהיית השיעור" | `console.opening` (reads "פותחים…" while pausing) | NEW `console.busy_pausing` | משהים… (?) | Pausing… |
| `LessonBanner` "המשך השיעור" | `console.opening` | NEW `console.busy_resuming` | ממשיכים… | Resuming… |

Same look as today: the pressed button keeps its width and shows the busy words with `aria-busy="true"` after the 400 ms rule. Delete `console.opening` from all seven locale files in the same commit, so nothing is left in the `console.opening.*` family except the Opening step's `show` / `text`. The four call sites are the only users (checked: `StepRail.ts`, `LessonBanner.ts` ×2, `TeacherHome.ts`, `TeacherConsole.ts`).

### 15.F States
| Screen | State | What shows |
|---|---|---|
| Console menu | closed / open / blocked | 15.A. "Blocked" persists until the panel closes. |
| Projector `here` | arrival | screen + control (one idle period), focus on "חזרה לשיעור" |
| | idle | screen only, no pointer |
| | full screen refused / unsupported | windowed. The control adds "מסך מלא" when supported. |
| | loading / load error | `projector.loading` / `projector.error` + the control at the same corner |
| | paused / ended | 13.F frames + band + control |
| | video mode | 15.C + control over the strip's title |
| Projector `window` | first load | screen + hint + control, focus on "מסך מלא" |
| | full screen | screen only; the control on wake shows "יציאה ממסך מלא", "סגירת המקרן" |
| | close refused | "סגירת המקרן" becomes "חזרה לשיעור" |
| | left open after the lesson | follows to "השיעור הסתיים" by itself (IA 15.9) |
| Not your lesson | — | no control (its own links, §13.G) |

### 15.G Motion and reduced motion
| Where | Motion | Reduced motion |
|---|---|---|
| Control in | `opacity` 0 → 1, 140 ms `--dur-quick` `--ease-out`; the step name / title out over the same time | instant |
| Control out (idle) | `opacity` 1 → 0, 220 ms `--dur-base` | instant |
| Hint out | `opacity`, 220 ms | instant |
| Menu chevron | `transform: rotate(180deg)`, 140 ms | instant |
| Text ↔ video | the existing `projector-fade` 220 ms on remount | instant (`--dur-base: 0`) |
| Full screen enter/exit | the browser's own | the browser's own |
Opacity and transform only. Nothing slides and nothing loops. The `--dur-*` tokens are already 0 under `prefers-reduced-motion`. `.projector-controls` and `.projector-hint` declare `transition: opacity var(--dur-*)` only, so they need no extra media query.

### 15.H Accessibility
- **Targets:** control buttons 48 px tall (44 px below 1100 px wide) and at least 120 px wide. Menu items 48 px.
- **Names:**
  - The menu summary is "מקרן", and the details element gives it its expanded state.
  - Each menu item is named by its visible label and described by its help line (`aria-describedby`). The help is outside the button, so the name stays short (the pattern of 13.E's end choice).
  - The control is `role="group"` "פקדי המקרן".
  - The hint is `role="status"`. "Blocked" is `role="alert"`.
- **Never hidden from assistive tech:** the control is transparent, not `display: none` or `visibility: hidden` and not `aria-hidden`, so a screen reader can always reach "חזרה לשיעור" / "סגירת המקרן".
- **No focus on invisible things:** idle-hide moves focus to the root (`tabindex="-1"`).
- **Contrast:**
  - Control pair 16:1 (light) / 13:1 (dark).
  - Video strip title 17.6:1.
  - Ring and outline ≥ 3:1 against both paper and black, by using the inverse colour.
  - The blocked message is ink on terra-50, about 15:1.
- **Colour is never the only cue:** filled vs outline is also weight and position (first). Full-screen state is in the words.
- **Keyboard path, `here` mode:** Tab → "חזרה לשיעור" → Enter. Or Esc.
- **Keyboard path, `window` mode:** Tab → "מסך מלא" → Enter → Tab → "סגירת המקרן".
- **Fix in the same lane:** `TeacherProjector`'s root `div.projector` has `aria-label` but no role, so the label is dropped. Give it `role="region"`. The stage is already a `main`.

### 15.I Weight notes
- **No libraries.** New code: `lib/fullscreen.ts` (about 40 lines), `lib/classroom/projectorScreen.ts` (mode parsing, the window opener, constants; about 60 lines, pure, unit-tested), `ProjectorControls.ts` (about 120 lines), `ProjectorMenu.ts` (about 90 lines). Roughly 2.5 kB min+gz across two lazy teacher chunks. Students download none of it.
- **`lib/fullscreen.ts`**: typed, no `any`. It extends `Document` / `HTMLElement` with optional `webkitFullscreenEnabled`, `webkitFullscreenElement`, `webkitExitFullscreen`, `webkitRequestFullscreen`:
  - `fullscreenSupported()`: `document.fullscreenEnabled ?? document.webkitFullscreenEnabled ?? false`.
  - `isFullscreen()`: `!!(document.fullscreenElement ?? document.webkitFullscreenElement)`.
  - `enterFullscreen(el = document.documentElement)`: calls `requestFullscreen?.({ navigationUI: 'hide' })` or `webkitRequestFullscreen?.()`. The webkit call returns `undefined`, not a promise (old Safari and iPad), so wrap it in `Promise.resolve`. Rejections are caught and logged with `console.info` (a refusal is expected, not an error).
  - `exitFullscreen()`, the same pair.
  - `onFullscreenChange(fn)`: listens to both `fullscreenchange` and `webkitfullscreenchange`, and returns its unsubscribe.
- **Constants** (in `projectorScreen.ts`, beside their use): `PROJECTOR_CONTROLS_IDLE_MS = 3 * TIME.SECOND`, `PROJECTOR_HINT_MS = 10 * TIME.SECOND`, `POINTER_WAKE_PX = 4`, `PROJECTOR_WINDOW_SIZE = { width: 1280, height: 720 }`, `projectorWindowName(mid) = 'projector-' + mid`. `projectorMode(param): 'window' | 'here'` treats any value other than `window` as `here`.
- **One timer**, cleared and restarted, never an interval. Listeners are passive, added once in `oncreate` and removed in `onremove`. `m.redraw()` runs only when the control's on/off state flips, never per pointer move.
- **iPad / old Safari:** `requestFullscreen` on the document element works from iPadOS 12 with the webkit prefix, and is missing on iPhone, where the button is hidden. `window.open` with features opens a tab on iPad. It cannot be dragged, but an iPad mirrored by AirPlay is the `here` case anyway.
- **Chrome's "Press Esc to exit full screen" toast** shows at the top for about 3 s on entry. It cannot be suppressed, and it does not clash with the control at the bottom.

### 15.J Build order
1. **Busy labels** (15.E): rename and add the keys in all 7 locales, and update the four call sites. Independent, so it ships first.
2. **`lib/fullscreen.ts` + `lib/classroom/projectorScreen.ts`**, with unit tests: mode parsing, the webkit fallback, the opener's reuse-without-reload, blocked → `null`.
3. **Tokens:** `--video-letterbox`, `--video-ink`, `--video-rule` (+ high-contrast values) in `_tokens.scss`.
4. **Console `ProjectorMenu`** (15.A) replacing the `console__link` in `TeacherConsole.header()`. Extract the shared popover helper from `ConsoleSettings`.
5. **`ProjectorControls` + `.projector-controls`** in `TeacherProjector` (every state but denied): wake/sleep, the step-name fade, focus, Esc per mode, leave/close, `role="region"` on the root.
6. **Video mode** (15.C): `.projector--video`, no band, `.intro-stage__screen` / `__strip`, the iframe vs file sizing, `preload="metadata"` on the projector. Remove `.intro-stage__eyebrow`.
7. **Hint** (15.D).
8. **i18n:** every NEW key in IA 15.3 in all 7 locales (Hebrew (?) marks need a native read).
9. **Docs:** strike 14.D's "Video n" wireframe, the Size bullet and the "player's own fullscreen; the app adds no control" bullet. Point them to 15.C. Update 13.E's bar wireframe and keyboard order.
10. **Playwright:**
    - console at 1280 in `he` and `en`: menu open/closed, the title still visible. Blocked: stub `window.open` to return `null`.
    - projector at 1280 × 720, 1024 × 768, 1280 × 800, 2560 × 1080: text and video. The control never intersects `.projector-band__join` (bounding-box test). A 60-character title ellipsises.
    - `here`: arrival focus, idle hide after 3 s (fake timers), Esc → `/t/:mid` with `?view=texts` kept, browser back.
    - `window` (opened via `context.waitForEvent('page')`): hint, full-screen toggle label, close.
    - a still pointer + a step change does not wake the control.
    - reduced motion; axe on the console, the projector, and video mode.

### 15.K IA gaps and conflicts found (reported, not changed)
1. **The menu adds one click to every switch.** IA 15.9 counts "הצגה במסך הזה" as one action. With the menu it is two ("מקרן ▾", then the item). The one-screen intro flow goes 9 → 12 actions, the shortcut 7 → 9, and the two-screen setup 3 → 4. The decision stands on width and on help-line visibility (15.A). **A/B test:** menu vs a two-button group with the help lines moved to `title`, on one-screen teachers' time from "פתיחת השלב הבא" to the wall. If the round trip hurts, the cheapest fix is IA D's per-device hint: the last used action as a third, direct button beside the summary.
2. **The control shows on arrival in `here` mode** for one idle period. IA 15.4 lists only pointer move, tap and Tab as triggers. I add arrival because the teacher has just clicked and must learn where the way back is. With keyboard or screen reader, focus lands on "חזרה לשיעור" anyway. If Tal wants the wall clean from the first frame, drop it; the pointer move after the click will usually show it within a second.
3. **"Close refused → חזרה לשיעור" contradicts "no button on the projector window ever navigates it to the console"** (IA 15.4, `window` column vs the "must never see" paragraph). Browsers refuse `window.close()` only when the tab was not script-opened **and** has navigated (history > 1). That is a pasted or bookmarked link, which is not the wall window. Recommendation: keep the IA's fallback and narrow the rule to "…in a window the console opened".
4. **Video mode keeps a 64 px strip, so it is not literally "the whole window".** IA 15.5 says "the player takes the whole projector window". The strip exists because a full-window iframe swallows every pointer move and key, so the teacher control could never wake by mouse in video mode. It also holds the title (14.0). Cost on a 16:9 screen: 49 px pillar bars at 1080p. If Tal wants edge-to-edge, the alternative is a transparent 24 px wake edge over the iframe's top. It is less discoverable, and it eats YouTube's title-bar clicks.
5. **"The code band and the question line are not shown"** is kept. The strip carries the video's label only, no code, so late joiners still wait for "הטקסט" (IA B default).
6. **Esc returns `here` mode to the console "when not full screen" (IA 15.4)**, except when focus is inside the YouTube iframe, because the key never reaches the page. That case only happens when full screen was refused. The way back is then a pointer move onto the strip. No IA change is needed; the behaviour should be known.
7. **No full screen means no hint.** IA 15.4 shows `projector.window_hint` on first load in `window` mode, but its text tells the teacher to press "מסך מלא". Where full screen is unsupported, I hide the hint rather than show a wrong instruction. The console's help line already says to drag. A drag-only hint would need a new string.
8. **14.D still reads "Full screen is the player's own fullscreen button … the app adds no control of its own"**, and has the eyebrow and title layout for video. IA 15 already overrides both. 15.C replaces them, and step 9 of the build order edits 14.D.
9. **`preload="metadata"` for file videos on the projector** changes 14.D's "`preload="none"`" for the projector only. One small range request on a laptop buys a visible first frame instead of a black box. The phone is unchanged.
10. **`projector.controls` "פקדי המקרן" (?)** is only heard, never seen. A native reader should confirm it. "פקדים" is formal; "כפתורי המקרן" is the plainer alternative.
11. **IA's question on a "window open" indicator** is answered no (15.0). If added later, it needs one string (for example `teacher.screen.window_open`) and a `visibilitychange` check of `win.closed`, with no polling.

### 15.L Opening panel on the console (`/t/:mid`, Opening step, "שולחנות" view)

#### 15.L.0 Decisions in one place
| Question | Decision | Why |
|---|---|---|
| Where | In `main.console__board`, replacing the lone roster card's full width: a 2-column grid, with the panel in the main column and the roster in a 320 px side column | It is the "bottom part" Tal looked at. The roster stays visible. |
| Reuse | `IntroText` (as is, new size `console`) and `IntroVideoRows`, moved to `components/` with two new attributes | One row pattern on the phone and on the console. No second player code. |
| Full screen target | The open row's `.intro-video-row__frame` (a new wrapper around the player) | Our letterbox and sizing apply on every player type. Esc exits through the browser. The document full screen is untouched, so the projector's `here` rules never fire. |
| Fullscreen button form | `.btn--secondary` 40 px, beside the row title, shown only when the row is open and `fullscreenSupported()` | It is reached by Tab before the iframe (iframes swallow focus and pointer) and is visible without hovering. |
| Band chooser | Unchanged ("על המקרן:") | It is for the two-screen case. It never touches the console player. |

#### 15.L.1 Wireframe, 1280 (the board area is 1248 px wide after the 16 px padding)
```
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ על המקרן:  [▭ הטקסט] [1. איך זה נראה בכיתה…] [2. ראיון עם המנהלת]          │ שולחנות■│מה כתבו│ │ switch band (unchanged)
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────────────────┐  ┌──────────────────────┐ │
│ │ הקדמה                                         עריכת ההקדמה ↗ │  │ הכיתה · 2             │ │ .opening-panel (1fr) | .roster-card (320px)
│ │                                                               │  │ [●דנה] [■עומר]        │ │
│ │ בשבוע שעבר המועצה החליטה לאסור טלפונים בהפסקות. חלק מהתלמידים │  │                      │ │ IntroText --console
│ │ שמחו, חלק כעסו. היום נחליט יחד מה אנחנו ממליצים.              │  └──────────────────────┘ │ max-inline-size 68ch
│ │  • מה טוב בהחלטה?                                             │                           │
│ │  • מה עלול להשתבש?                                            │                           │
│ │                                                               │                           │
│ │ סרטונים                                                       │                           │ .intro-videos
│ │ ┌───────────────────────────────────────────────────────────┐ │                           │
│ │ ┃ 1. איך זה נראה בכיתה בלי טלפונים       [▭ על המקרן עכשיו] │ │                           │ row--live (ink edge + tag)
│ │ ┃                                       [ ▶ לצפות כאן ]     │ │                           │
│ │ ├───────────────────────────────────────────────────────────┤ │                           │
│ │ │ 2. ראיון עם המנהלת                          [ ⛶ מסך מלא ] │ │                           │ row--open
│ │ │ ┌───────────────────────────────────────────────────────┐ │ │                           │
│ │ │ │                                                       │ │ │                           │ __frame, 16:9, max 720px wide
│ │ │ │             YouTube player (its own ▶)                │ │ │                           │
│ │ │ │                                                       │ │ │                           │
│ │ │ └───────────────────────────────────────────────────────┘ │ │                           │
│ │ └───────────────────────────────────────────────────────────┘ │                           │
│ └───────────────────────────────────────────────────────────────┘                           │
```
**1024-1279:** the same grid with the side column at 280 px. **Below 1024:** one column, the panel, then the roster (`.console-opening` grid becomes a single column).

**No introduction** (no blocks, no description, no videos):
```
│ ┌───────────────────────────────────────────────────────────────┐  ┌──────────────────────┐ │
│ │ הקדמה                                                         │  │ הכיתה · 2             │ │
│ │ לשיעור הזה אין הקדמה.  להוספת הקדמה ↗                         │  │ [●דנה] [■עומר]        │ │
│ └───────────────────────────────────────────────────────────────┘  └──────────────────────┘ │
```
The panel is about 96 px tall, so the board no longer looks broken, and the link is the next step.

#### 15.L.2 Components and blocks
| Piece | File | What |
|---|---|---|
| `OpeningPanel` (NEW) | `views/teacher/OpeningPanel.ts` (about 110 lines) | `section.opening-panel[aria-labelledby=opening-panel-title]`: the `h2.opening-panel__title` "הקדמה", the `m.route.Link a.opening-panel__edit` (tertiary link style), `IntroText {size:'console'}`, `IntroVideoRows`, or the empty line `p.opening-panel__empty` + `a.opening-panel__add`. Module state per mid: `blocks`, `openId`, `failedIds`, the same shape as `OpeningView` on the phone. |
| `.console-opening` (NEW) | `styles/console-opening.scss`, imported by `TeacherConsole.ts` | The grid wrapper: `display:grid; grid-template-columns: minmax(0,1fr) 320px; gap: var(--space-md); align-items:start`; at `max-width: 1279px` the column is 280px; at `max-width: 1023px` there is one column. |
| `.opening-panel` (NEW) | same file | Card look shared with `.roster-card` (`--bg-card`, 1px `--paper-line`, `--radius-lg`, `padding: var(--space-lg)`). `__head` is flex, space-between. `__title` uses `--font-size-lg` 700, the same as `.roster-card__title`. `> .intro-text { max-inline-size: 68ch }`. `__empty` uses `--ink-soft`. |
| `IntroText` | `components/IntroText.ts` | Add `'console'` to `IntroTextSize`. It needs no CSS, because the base `--intro-size` is already `--font-size-lg`. |
| `IntroVideoRows` (MOVED) | `views/student/c2/` → `components/IntroVideoRows.ts`. The row CSS moves from `student-c2.scss` to NEW `styles/intro-videos.scss`, imported by the component (the `IntroText` / `intro-text.scss` pattern, so Vite puts it in one shared lazy chunk). | New optional attributes: `failedText?: string` (default `t('opening.video_failed')`), and `onFullscreen?: (frame: HTMLElement) => void`. When the second is set and the row is open, the row shows `button.btn.btn--secondary.btn--small.intro-video-row__fullscreen`. The phone passes neither, so it is unchanged and does not import `lib/fullscreen.ts`. |
| `.intro-video-row__frame` (NEW element) | `intro-videos.scss` | It wraps the player. `:fullscreen, :-webkit-full-screen` → `background: var(--video-letterbox); display:grid; place-items:center;` iframe `inline-size: min(100vw, 100dvh * 16/9); aspect-ratio:16/9`; file `<video>` `100%/100%; object-fit: contain`. The same sizing as `.intro-stage__player` (15.C), with the `--video-*` tokens reused. In the console it is not full screen, so `max-inline-size: 720px`. |
| `.intro-video-row__fullscreen` (NEW element) | `intro-videos.scss` | `grid-column: 2; grid-row: 1` when the row is `--open`, so it sits beside the title, before the player in Tab order. |
| `TablesBoard` | changed | New attribute `opening: m.Children` (or `beside`). When the board is in roster mode and it is given, the board renders `div.console-opening` with the panel and then `rosterCard`. `TeacherConsole.board()` passes `m(OpeningPanel, …)` only when `stepKey === 'opening'`. |
| `PlanScreen` | small change | When `m.route.param('focus') === 'intro'`, `oncreate` calls `scrollIntoView` on `.plan__intro` and focuses its textarea. |

Console call: `onFullscreen: (frame) => void enterFullscreen(frame)` from `lib/fullscreen.ts`. It is already teacher-only, so no new code is needed.

#### 15.L.3 States
| State | What shows |
|---|---|
| Text + videos | heading, edit link, text, the list of videos |
| Text only | heading, edit link, text; no "סרטונים" (`IntroVideoRows` returns null at 0) |
| Videos only | heading, edit link, the list of videos |
| No introduction | heading, `console.intro.empty` + `console.intro.add` |
| Text loading | `description` as plain text (`blocksFromPlainText`), then one `fetchIntroBlocks(mid)` swaps it in. There is no listener (the console is not the wall). It is fetched again when the panel mounts. |
| Text fetch failed | plain `description` stays; `logError` with `operation: 'console.openingPanel.fetchIntro'`; nothing shown to the teacher |
| Row closed | title, optional "על המקרן עכשיו" tag, "▶ לצפות כאן" |
| Row open (loaded, not playing) | title, "⛶ מסך מלא" (when supported), player; focus moves to the player (existing `focusAndShow`) |
| Another row opened | the first player is removed (its sound stops) and the second opens |
| Full screen | the frame fills the screen on `--video-letterbox`; the player's own controls; Esc exits through the browser; focus returns to the row's "מסך מלא" (listen with `onFullscreenChange` while a row is open) |
| Full screen unsupported | no button; the player's own full screen button (`allowfullscreen`) still works |
| File video failed | `console.intro.video_failed` replaces the button (`role="status"`) |
| Projector on the same video | the tag "על המקרן עכשיו" in the row; nothing synced |
| Paused / ended | the panel is fully usable; only the band's chooser is disabled (existing `heldNow`) |
| Next step | the panel unmounts and its player goes with it; the board shows today's board for that step |
| "מה כתבו" view | no panel (today's `WhatTheyWrote`) |

#### 15.L.4 Keyboard and accessibility
- **Tab order:** band → panel heading link "עריכת ההקדמה" → text (not focusable) → for each row: "לצפות כאן" or, when open, "מסך מלא" then the player → roster chips.
- **Names:**
  - The panel is a `section` named by its `h2`.
  - The full screen button's `aria-label` is "מסך מלא: {label}".
  - The play button keeps its visible text, with the row title as `aria-describedby` (row title `id = intro-video-title-{id}`).
- **Not colour alone:** the live row has an ink edge, a tag with words and a screen mark (existing).
- **Targets:** 40 px buttons with 48 px hit areas (the console is a mouse-first surface, §9). The play button uses `--touch-target`, as it does today.
- **Esc:**
  - In full screen, the browser leaves full screen.
  - Outside full screen, Esc does nothing here. It must not close the player, so it stays free for `barPopover`.
- **Reduced motion:** the existing `scrollIntoView` rule (`auto`). No new motion.
- **Contrast:** tokens only; the full screen letterbox uses the 15.C tokens, including the high contrast values.
- **Language:** `dir="auto"` on titles and blocks (existing).

#### 15.L.5 Weight
- Teacher console chunk only. It adds `OpeningPanel` (about 110 lines) and `console-opening.scss` (about 40 lines). `IntroText` and `IntroVideoRows` are shared lazy chunks that the phone already loads.
- No libraries, no YouTube IFrame API, no `autoplay`. The phone keeps `preload="none"`. The console player uses `preload="metadata"` for files (a laptop, the same reasoning as the projector, 15.K-9) through the existing `preload` choice, made an attribute: `preload?: 'none' | 'metadata'`, default `'none'`.
- The phone's bundle is unchanged apart from the move: it gains no `lib/fullscreen.ts`, because full screen comes in through a callback.

#### 15.L.6 Build steps (one lane)
1. **Move** `IntroVideoRows.ts` to `components/` and the `.intro-videos` / `.intro-video-row` CSS to `styles/intro-videos.scss`, imported by the component. Update the `OpeningView` import. Add the `failedText`, `onFullscreen` and `preload` attributes, the `__frame` wrapper and the `__fullscreen` button. Existing phone tests must stay green; add a test that the phone renders no full screen button.
2. **`IntroText`:** add the `'console'` size.
3. **`OpeningPanel.ts` + `console-opening.scss`:** fetch with a `description` fallback and `logError`, one open player, failed ids, the empty state with the plan link, `enterFullscreen(frame)`, and focus returning to the button on `fullscreenchange` out.
4. **`TablesBoard`:** the `opening` attribute and the `.console-opening` grid. **`TeacherConsole.board()`:** pass the panel when `stepKey === 'opening'` and the view is "tables".
5. **`PlanScreen`:** handle `?focus=intro`.
6. **i18n:** NEW `console.intro.edit`, `console.intro.empty`, `console.intro.add`, `console.intro.video_failed` in all 7 locales.
7. **Docs:** strike the IA 15.5 "console never plays" bullet and its 15.12 line, and point them to 15.13. Add this section as UX 15.L.
8. **Tests:**
   - Unit (`views/teacher/__tests__/OpeningPanel.test.ts`): empty, text-only, video-only, one player at a time, the failed text, and that the full screen callback gets the frame.
   - Playwright `e2e-opening-panel`, console at 1280 × 720 and 1024 × 768 in `he` and `en`:
     - the panel sits beside the roster;
     - no horizontal scroll;
     - "לצפות כאן" → iframe present;
     - "מסך מלא" → `document.fullscreenElement` is the frame;
     - Esc → back, still on `/t/:mid`;
     - picking "על המקרן: 2" does not open or close the console player;
     - opening a console player does not change `projectorVideoId`;
     - paused lesson → the play button is enabled and the chooser is disabled;
     - no introduction → the add link goes to `/t/:mid/plan?focus=intro`;
     - axe on the board.

**Check during the build:** no `fullscreenchange` listener may exist outside `ProjectorControls` (checked: it is the only one) that could navigate the console when the frame leaves full screen.

**As built (2026-10-22):** the `?focus=intro` handling lives in `PlanIntro` (the `.plan__intro` section itself), not `PlanScreen`, because the section only exists once the plan has loaded; it waits up to 4 s for the text box to be enabled, then falls back to the section heading. The panel keeps the plain `description` on screen when the paragraph fetch returns no blocks. The Playwright run is `apps/join-class/scripts/e2e-opening-panel.mjs` (`npm run e2e:opening-panel`).

## 16. The table turn, one screen per state (UX, 2026-10-25, revision 3)

Status: built 2026-10-25 (t1). Replaces UX §16.A-K (revision 2) for **Table talk** as a whole. Proposals screens are untouched.
Authority: IA §16 rev 3 (`ia-join-class-table-turn-v3.md`), states D, P1, P2, S, L, W, A, H (IA 16.4), labels (IA 16.2), refusal codes (IA 16.6). Picture: Tal's drawing `tal-table-turn-flow-v3.png`.
Frames are 360 px, RTL, tokens from `apps/join-class/src/styles/_tokens.scss` only, 8-pt spacing (`--space-*`). Example table: Dan, Tal, Noa (phones), Yossi (no phone).

### 16.A Decisions in one place (the IA's "yours to decide")
| Question | Decision | Why |
|---|---|---|
| Frame layout | Header = stage name (16 px, 600, `--ink`) with the table line under it (14 px, `--ink-soft`). Then the question (22 px, 600) as the screen's heading. Then one big thing, then the footer. | Matches the drawing (stage on top, question under it). The table line is secondary, so it rides in the header and never pushes the question down. |
| Paper or dark | Pick (P1, P2) and Done (D) are **paper**. Every state of a running turn (S, L, W, A, H) is **dark** (`.frame--down`). | Keeps the teacher's across-the-room read "dark = the table is talking", and the student sees at once that the turn has started. One colour change per turn, no flicker inside a turn. |
| Used questions | **Greyed and last**, not tappable, tag "נשאלה". When every teacher question is used they fold into a closed `<details>` "השאלות שכבר נשאלו (n)". | Students see what was already asked, so they do not write the same thing as their own question. Hiding them would make a short list look broken. |
| Selecting a question | A local radio choice on this phone only. No server write until "אני רוצה להתחיל". | First tap wins the turn, not the first choice. Nobody else sees half-made choices. |
| Start with nothing chosen | The button looks dimmed (`aria-disabled="true"`) but stays tappable; a tap shows `turn.pick_first` under it and moves focus to the list. | A truly disabled button gives a 12-year-old no reason. This one explains itself. |
| Where Finish sits | In the body, right under the countdown (as drawn), **not** in the footer. Outline paper button (`btn--secondary`), 48 px tall, at least 160 px wide. It is shown from the first second but **ignores taps for the first 1 s** (`FINISH_GUARD_MS = 1000`, drawn disabled for that second). | "I want to answer" lives in the footer; putting Finish elsewhere stops the same thumb from ending a minute it just started. Outline, not filled: the clock is the hero, and ending early is a choice, not the expected path. |
| "You already answered" next to a clock (L) | One 16 px line **under** the name line, `--paper-line`, with a ✓ or – glyph. Never inside the clock area. | The clock and the name stay the loudest; my own status is a footnote. |
| Race loser line | `turn.was_first` as a quiet 14 px line under the status line of the next screen, for 4 s or until the next state, whichever comes first. No error styling, no `role="alert"`. | The new screen already shows who won. The line only explains why the screen changed under your finger. |
| Pass buttons | A real `btn--secondary` (outline) full width, under the primary, with 16 px between them. Pass asking has one inline confirm. Pass answering has none (IA F3: 1 tap). | Clearly a second choice, never hidden, never filled. The irreversible one (the whole lesson) costs one more tap. |
| Teacher marks | Two marks per member chip: the asking mark before the name (✓ asked, ? asking now, – passed asking), the answering mark after it (✓ answered, ● answering now, – passed this question). Each has a full `aria-label`. | Glyph + position + text. No meaning in colour alone. |

**The question is the screen (t3, 2026-10-25).** On every talk state (S, L, W, A, H) the chosen question is the h1 and the big text: `--font-size-2xl`, bold, centred, wrapped, in a block at least a third of the screen high (`33dvh`) with the text centred in it, so it sits in the top third. The status line ("מי עונה עכשיו?", "<name> עונה", "✓ עניתי") is `--font-size-xl` under it. The h1 inherits the frame colour (global `h1` is dark; on the ink frame it was invisible). Pick and Done are unchanged.

### 16.B The frame (every Table talk screen)
```
┌──────────────────────────────────────┐
│                          שיחת שולחן │ header: step.tableTalk, 16 px 600
│         שולחן 3 · סבב 2 מתוך 3       │ turn.header, 14 px --ink-soft
├──────────────────────────────────────┤
│        למה קשה לסרב לחבר?           │ question (talk states only), 22 px, h1
│                                      │
│          [ the one big thing ]       │ countdown or status line, centred
│                                      │
├──────────────────────────────────────┤
│ [          primary (if any)       ]  │ footer: StudentFrame.action
│ [         secondary (if any)      ]  │
└──────────────────────────────────────┘
```
- `StudentFrame` gains one prop, `stageName`; `headerLine` keeps the table line. No `askerMark` at Table talk.
- Paper frame (P1, P2, D): `--paper` / `--ink`. Dark frame: `--ink` background, `--paper` text, header line `--paper-line`.
- Errors: `ErrorLine` (`p.c3-error`, `role="alert"`, retry button `turn.retry`) sits **directly under the button that failed**, inside the footer, never at the top of the screen.
- Transition between states: the body (heading + big thing + footer) fades in with `opacity` 0 to 1 over `--dur-base` (220 ms, `--ease-out`). No slide, no scale. Under `prefers-reduced-motion: reduce` there is no animation. The countdown never animates its digits.
- Lesson paused: the same screen stays, every button disabled (as built).

### 16.C P1. Pick, may start (paper)
```
│                          שיחת שולחן │
│         שולחן 3 · סבב 2 מתוך 3       │
├──────────────────────────────────────┤
│                         בחרו שאלה   │ turn.instr_pick, 22 px h1
│                  השאלות של המורה    │ question.teacher_list, 14 px label
│ ┌──────────────────────────────────┐ │
│ │ ◉  למה קשה לסרב לחבר?            │ │ selected: 2 px --ink border, --paper-soft fill
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ ○  מה עושים כשחבר טועה?          │ │ radio row, min 56 px tall
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ ○  שאלה משלנו                    │ │ an own question of this table (eyebrow tag)
│ │    מי מחליט מה מצחיק?            │ │
│ └──────────────────────────────────┘ │
│ ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐ │
│ │ +  שאלה משלנו                    │ │ question.add_own, dashed border, always last
│ └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘ │ of the unused group
│ │ מה זה חבר טוב?            נשאלה  │ │ used: --ink-soft, no radio, last
├──────────────────────────────────────┤
│ [        אני רוצה להתחיל          ]  │ primary, terracotta (turn.claim)
│ [         אני רוצה לוותר          ]  │ secondary, outline (turn.pass_ask)
```
**Own question, inline composer.** Tapping "+ שאלה משלנו" selects that row (radio on) and opens a text field inside it, focused, `placeholder` `question.add_placeholder` "כתבו את השאלה", `maxlength` 200, `dir="auto"`. No separate save button: the question is created when the student taps "אני רוצה להתחיל". Tapping another question deselects the own row but keeps the typed text.
```
│ ┌──────────────────────────────────┐ │
│ │ ◉  שאלה משלנו                    │ │ row selected
│ │ ┌──────────────────────────────┐ │ │
│ │ │ כתבו את השאלה                │ │ │ input, 48 px, --bg-input
│ │ └──────────────────────────────┘ │ │
│ └──────────────────────────────────┘ │
```
**All teacher questions used.** Under the heading, `turn.questions_used` (16 px, `--ink-muted`) "השאלות של המורה נשאלו. כתבו שאלה משלכם". The own row is **first, open and focused**. Unused own questions of this table (from a race loser, IA F2.4) follow as radio rows. Used ones fold into `<details>` `turn.used_questions`.
**No teacher questions at all** (IA 16.7 empty): same as "all used" without the note.
- Primary `turn.claim`: visually enabled when a question is selected, or the own row is selected with text. Otherwise `aria-disabled="true"` (60% opacity) and a tap shows `turn.pick_first` "קודם בוחרים שאלה" under it (14 px, `--ink-muted`, not an alert) and focuses the first radio.
- Tap with a question: label becomes `turn.saving` "שומרים…", both buttons disabled, then `claimTurn { fromTurn, questionId }`. With own text: `createTableQuestion` first, then `claimTurn` with the new id (the created id is kept, so a retry does not create it twice).
- Secondary `turn.pass_ask` "אני רוצה לוותר": opens the inline confirm (16.K). 

**Refusals (P1)**
| Code | What the student sees |
|---|---|
| `turn-claimed` | Nothing red. The table doc already moved: the phone shows A (or W) with the winner's question, plus `turn.was_first` "הפעם זה {{name}}" (name = the new asker). |
| `question-used` | Inline under the button: `turn.question_taken` "השאלה הזאת כבר נשאלה. בחרו אחרת". The row turns greyed "נשאלה"; the selection clears. |
| `talk-not-over` | Not shown (cannot happen from P1 except a stale doc); the next snapshot redraws. Swallowed. |
| `already-asked` / `already-passed` | Swallowed; the snapshot moves the phone to P2. |
| own create failed | Inline under the button: `question.add_failed`, retry. The typed text stays. |
| network, anything else | `turn.action_failed` "זה לא עבד. לנסות שוב" + retry. |

### 16.D P2. Pick, wait (paper)
```
│                          שיחת שולחן │
│         שולחן 3 · סבב 2 מתוך 3       │
├──────────────────────────────────────┤
│                                      │
│                                      │
│       חכו שאחרים יבחרו שאלה          │ turn.wait_pick, 22 px 600, centred
│                                      │
│       ויתרתם על התור לשאול           │ only if I passed: turn.passed_ask_done, 16 px --ink-soft
│                                      │
```
- No list, no buttons, no footer. The student is not asked to look at choices they cannot make.
- When a turn starts: fade to A (or L if a minute already runs).

### 16.E The countdown (S and L)
- Digits: `font-variant-numeric: tabular-nums`, `clamp(6rem, 30vw, 8rem)` (96-128 px, the existing `$c3-count-size`), 700, centred, `--paper` on `--ink`. Format "0:59" ... "0:11", then two digits "10" ... "01".
- Last 10 seconds: digits and the bar switch to `--terra-300` (≈ 6:1 on `--ink`). Colour only plus the format change (two digits): no pulse, no shake.
- Bar: 6 px under the digits, full width, drains toward the inline end (`transform: scaleX`, linear 1 s steps; no transition under reduced motion).
- Speaker (S) and listeners (L) see **the same clock** at the same size. Only the line under it differs (16.F, 16.G) and only S has Finish.
- Starts at `speakerEndsAt - serverNow()`: the clock reads the server-corrected time (`serverClock.ts`), so every phone at the table shows the same second; first frame shows 0:59 or less, never 1:00.
- When time ends: **no "time over" words**. The state machine already says the minute is over, so the whole body fades to the next state (H for the speaker, A / W / H / P1 / P2 for the others). The existing 350 ms redraw after `speakerEndsAt` (`TableFlow`) stays. `Countdown` gets a prop `quietEnd` that drops `turn.time_over` at Table talk (Proposals keeps it).
- Finish (S only): `finishSpeaking {}` sets `speakerEndsAt = now`; same next screen as time out.

### 16.F S. My minute (dark)
```
│                          שיחת שולחן │
│         שולחן 3 · סבב 2 מתוך 3       │
├──────────────────────────────────────┤
│        למה קשה לסרב לחבר?           │ question
│                                      │
│              הדקה שלכם               │ turn.answer_mine, 22 px 600
│                0:42                  │ countdown
│   ━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░    │
│                                      │
│          [    סיימתי    ]            │ turn.finish, outline paper, in the body
│                                      │
│ (no footer)                          │
```
- Finish tap: the label stays `turn.finish` (no "שומרים…": the clock jumping to the next state is the feedback); the button is disabled while the call is in flight.
- Refusals: `minute-over` swallowed (the clock beat the tap; the screen moves to H). `not-speaker` swallowed. Network: `turn.action_failed` + retry under Finish; the clock still ends the minute (IA 16.7).

### 16.G L. Someone answers (dark)
```
│        למה קשה לסרב לחבר?           │
│                                      │
│               דן עונה                │ turn.answering {name}, 22 px 600
│                0:42                  │ countdown, same size as S
│   ━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░    │
│            ✓ כבר עניתם               │ only if me ∈ spokenUids: turn.answered_me
│                                      │ (– ויתרתם על השאלה הזאת if passed), 16 px --paper-line
│ (no footer)                          │
```
- No buttons (IA default 3: no pass during someone else's minute).
- A no-device member's minute (teacher's `nextSpeaker` with Yossi's id) reads "יוסי עונה" the same way.

### 16.H W. Asker waits (dark)
```
│        למה קשה לסרב לחבר?           │
│                                      │
│                                      │
│        תנו לאחרים לענות קודם         │ turn.others_first, 22 px 600, in the big slot
│                                      │
│ (no footer)                          │
```
- No disabled "I want to answer" button: the drawing has none, and a dead button invites taps.
- Unlocks to A when one tablemate has answered (or all others passed). The fade is the only signal plus the live region (16.M).

### 16.I A. May answer (dark)
```
│        למה קשה לסרב לחבר?           │
│                                      │
│                                      │
│           מי עונה עכשיו?             │ turn.who_answers, 22 px 600
│                                      │
├──────────────────────────────────────┤
│ [        אני רוצה לענות           ]  │ primary terracotta (turn.answer)
│ [         אני רוצה לוותר          ]  │ secondary outline paper (turn.pass_answer)
```
- "אני רוצה לענות": `claimSpeaker {}`; label `turn.saving`, both disabled; success → S.
- "אני רוצה לוותר": `passSpeaking {}`, no confirm (IA F3); success → H with `turn.passed_answer_me`.
- The 16 px gap + different words make the two hard to confuse; pass is never filled.

**Refusals (A)**
| Code | What the student sees |
|---|---|
| `floor-taken` | Swallowed. The phone is already at L "{{name}} עונה"; add `turn.was_first` "הפעם זה {{name}}" under the name line for 4 s. |
| `already-answered` | Swallowed; the snapshot moves the phone to H. |
| `others-first` | Swallowed; the snapshot moves the phone to W. |
| `failed-precondition` | Swallowed; the next snapshot redraws. |
| network | `turn.action_failed` + retry, under the button that was tapped. |

### 16.J H. Had my turn (dark)
```
│        למה קשה לסרב לחבר?           │
│                                      │
│             ✓ כבר עניתם              │ turn.answered_me, 22 px 600
│                                      │ (– ויתרתם על השאלה הזאת: turn.passed_answer_me)
│           מי עונה עכשיו?             │ turn.who_answers, 16 px --paper-line
│ (no footer)                          │
```
- Next: L when someone takes the floor; P1 / P2 when the last one answered; D when the table is done.

### 16.K Pass handling
**Pass asking** (P1 only). Tap `turn.pass_ask` → the secondary button's slot becomes the confirm row; the primary stays where it was:
```
│ [        אני רוצה להתחיל          ]  │ primary still enabled; tapping it closes the confirm
│   לא תשאלו בשיעור הזה                │ turn.pass_ask_confirm, 16 px
│   [ ביטול ]        [ כן, לוותר ]     │ common.cancel (btn--text) · turn.pass_ask_yes (btn--secondary)
```
- Focus moves to "ביטול". Esc = cancel. The confirm closes by itself when the turn or step changes.
- "כן, לוותר" → `passAsking {}` → P2 with `turn.passed_ask_done`. Header `max` drops by one. If this was the last student who had not asked and no turn runs, the phone goes to D.
- Refusal `already-passed` swallowed; network `turn.action_failed` under the confirm row.

**Pass answering** (A only): one tap, see 16.I. A passed student lives the rest of the turn in H (or L with the "– ויתרתם על השאלה הזאת" footnote) and is back to normal at the next question.
**Passed asking, for the lesson**: P2 at every Pick, A / S / L / H as everyone else during turns. They still answer every question.

### 16.L Teacher (minimal deltas; structure as built)
**Table card** (`TableCard.ts`): head, "now" line, timer row, members, "+ ללא מכשיר", one quick button. Changes only:
```
┌ שולחן 3 ─────────────── סבב 2 מתוך 3 ┐
│ שיחת שולחן                            │ now line (unchanged)
│ למה קשה לסרב לחבר?                    │ NEW: question, 1 line, ellipsis (talk only)
│ דן עונה · 0:42                        │ timer row: turn.answering + time (was console.speaker_line)
│ ━━━━━━━━━━━━━━━━━━░░░░░░              │
│ (✓ דן ●) (? טל) (נועה) (יוסי ⌀)       │ marks: before = asking, after = answering
│ [ לסיים את הדקה ]                     │ quick button: console.finish_minute
└───────────────────────────────────────┘
```
| Table state | Second row (replaces the timer when no minute runs) | Quick button |
|---|---|---|
| Pick | `console.waiting_start` "ממתינים למי שיתחיל" · m:ss | none |
| Minute running | `turn.answering` {name} · 0:42 + bar | `console.finish_minute` → `finishSpeaking {}` |
| Floor open | `console.not_answered` "עוד לא ענו: טל, נועה" · m:ss | none |
| Done | `console.all_done` · `console.asked_passed` | none |
- m:ss = elapsed since the table last changed: `serverNow() - max(updatedAt, speakerEndsAt ?? 0)` (no new field). Shown in `--ink-soft`; from 2:00 on in `--warning` with the prefix "⏱" so a stuck table stands out without colour alone.
- The `console.asker_line` row stays during talk (who asked this question). The "?" mark goes ✓ when the turn ends.
- Removed: the `talk` quick button (`console.quick_talk`), and `quickActionFor` returning `turn` at V2 (the students start the next turn themselves).

**Member marks** (`memberMark` splits into `askMark` + `answerMark`):
| Mark | Glyph, position | `aria-label` |
|---|---|---|
| asked | ✓ before the name | `console.mark_asked` |
| asking now | ? before, chip outline 2 px `--ink` | `console.mark_asking` |
| passed asking | – before, dashed border | `console.mark_passed_ask` |
| answered this question | ✓ after the name | `console.mark_answered` |
| answering now | ● after, chip fill `--teal-50` | `turn.answering` |
| passed this question | – after | `console.mark_passed_answer` |
| no device | ⌀ after (as built), never an asking mark | as built |
Answer marks show only while a turn is in talk; they clear at Pick.

**Table sheet** (`TableSheetPanel.ts`, `tableSheetTurn.ts`): step row keeps one verb, `console.quick_turn` "להתחיל סבב {{n}}" (last resort, opens Pick). Per member row:
```
│ טל   ? –            [ לענות עכשיו ] [ לוותר בשם טל ]          │ talk, not yet answered
│ דן   ✓ ●            [ לסיים את הדקה ]                          │ the one answering
│ נועה – ✓                                                      │ answered: no buttons
│ יוסי ⌀              [ לענות עכשיו ]                            │ no device: speak now only
│ ── Pick ──                                                    │
│ נועה                [ לוותר על התור בשם נועה ]  (inline confirm, as built)
```
| State | Not-yet member (device) | The speaker | No-device member |
|---|---|---|---|
| Pick | `console.pass_ask_for` (inline confirm `console.pass_ask_confirm`) | — | — |
| Talk | `console.speak_now` (`nextSpeaker {uid}`), `turn.pass_for` (`passSpeaking {uid}`) | `console.finish_minute` | `console.speak_now` |
- Removed: `console.pass_asker` ("להעביר את התור ל…").
- "Mark a no-device member as answered" is **not added**: no-device members never gate "everyone answered" (IA F9, default 5), so there is nothing to unblock. `console.speak_now` on Yossi is the only control, and only to put his minute on the phones.

### 16.M Accessibility
- Focus order on every screen: header → question heading → big status → Finish (S) → footer primary → footer secondary → error retry. On a state change focus goes to the new `h1` (question at talk states, status at P2/D) with `tabindex="-1"`, **except** when the student's own tap caused it and the button still exists.
- One `aria-live="polite"` region per frame (`p.visually-hidden`) carries the new state's status line once on every state change: "דן עונה", "הדקה שלכם", "תנו לאחרים לענות קודם", "מי עונה עכשיו?", "כבר עניתם", "חכו שאחרים יבחרו שאלה", "חכו לשאר השולחנות". `turn.was_first` goes into the same region.
- Clock: `role="timer"`, `aria-live="off"`, `aria-label` `turn.timer_label` updated every 10 s. The live region adds two spoken alerts only, at 30 s and 10 s left (`turn.timer_label`). The end of time is announced by the next state's line, not by the clock.
- Pick list: `role="radiogroup"` with `aria-labelledby` the heading; rows are `role="radio"`, arrow keys move, Space selects. Used rows: `aria-disabled="true"`, label adds "נשאלה". The own row's input has `aria-label` `question.add_own`.
- Aria-disabled start: `aria-describedby` points at the `turn.pick_first` line once shown.
- Touch: all buttons ≥ 48 px tall (`--touch-target`), full width in the footer, 16 px between primary and secondary. Radio rows ≥ 56 px.
- Contrast: terracotta primary `--terra-600` + white (6.4:1); paper on ink ≈ 16:1; `--terra-300` digits on ink ≥ 3:1 for 96 px text; `--paper-line` lines on ink ≥ 4.5:1 at 16 px.
- Reduced motion: no fade, no bar transition; the state is just there.
- RTL: logical properties only (`margin-inline`, `inset-inline`); the bar drains toward inline end; digits stay LTR (`dir="ltr"` on `.count__num`).

### 16.N Delete list (remove, do not hide)
| File / piece | Why dead |
|---|---|
| `views/student/c3/AskersRow.ts` + `.askers*` in `styles/student-c3-turn.scss` | askers row removed (IA 16.3) |
| `views/student/c3/ClaimFooter.ts` + `.claim-footer*` | replaced by `TurnActions.ts` (primary + real secondary + optional inline confirm), shared by P1 and A |
| `TalkScreen.ts`: `over` prop, `passMinuteAction`, the `withSpeakers` chips branch, `talk__hint` | no chips, no V2 words, no pass-for at student Table talk. The chips render only at `kind === 'tableTalk'` today, so Proposals loses nothing (note: the IA says Proposals keeps speaker chips; the code shows none there). TalkScreen keeps prompt + `turn.table_time` + Countdown for Proposals |
| `styles/student-c3-talk.scss`: `.talk__chips`, `.talk__chip*`, `.talk__over*`, `.talk__pass`, `.talk__hint` | same |
| `lib/classroom/c3Logic.ts`: `speakerChips`, `SpeakerChip`, `canPickNextSpeaker`, `passMinuteArmed`, `PASS_ARM_MS`, `TABLE_SUBSTEPS.tableTalk` | chips, arm delay and the Table talk strip are gone (Proposals keeps `TABLE_SUBSTEPS.proposals`, `resolveSubstep`) |
| `lib/classroom/turnMoment.ts`: `claimMoment`, `ClaimMoment`, `TurnPhase`, `askerStates`, `AskerChip`, `AskerState`, Table talk branches of `instructionFor` (`talkInstruction` etc.) | replaced by `tableTalkState(table, uid, now)` → `'D'\|'P1'\|'P2'\|'S'\|'L'\|'W'\|'A'\|'H'` (new `lib/classroom/tableTalkState.ts`, built on shared-types `choosing`, `askerMayAnswer`, `floorOpen`, `tableDone`). Keep `maxTurns`, `refusalReason`, `namesOf`, Proposals' `instructionFor` |
| `tableTalkParts.ts`: `claimTurn` via `nextTurn`, `pickQuestion`, `chooseOwnAndTalk`, `primaryFor`, `footerFor`, the asker line, `showStrip` | rewritten around the 8 states |
| `TableFlow.ts`: `AskersRow`, `SubStepStrip` and the peek (`flow__peek`, `peek-back`, `self.override`) **at Table talk only**; `.flow__bar` asker line at Table talk | one state per screen; Proposals keeps strip and peek |
| `QuestionPick.ts`: `canChoose` (always true at P1), `onPick` server write, `onAddOwn` + its own `form.pick__add` submit, `ownBox` asker-only branch | local selection + inline own row (16.C) |
| `tableTurnConsole.ts`: `quickActionFor` Table talk branch (`talk`, `turn`), `statusLine` V1/A/V2 keys, `memberMark` | replaced by 16.L rules (`askMark`, `answerMark`, `finish` quick kind) |
| `tableSheetTurn.ts`: the `console.pass_asker` button | removed at Table talk (IA default 6) |
| Tests: the matching cases in `lib/classroom/__tests__/c3Logic.test.ts`, `turnMoment.test.ts` | rewrite for `tableTalkState`, not skip |
| Locale keys retired in IA 16.2 (list there), plus `turn.asker_passed`, `turn.speaker_passed`, `turn.all_spoke`, `turn.who_asks_now`, `console.waiting_volunteer` | grep all 7 locales; keep what Proposals reads |
`SubStepStrip.ts`, `Countdown.ts`, `ErrorLine.ts`, `Sheet.ts` stay (Proposals or shared).

### 16.O Locale keys (he + en; the other 5 machine translated)
| Key | HE | EN | Change |
|---|---|---|---|
| `step.tableTalk` | שיחת שולחן | Table talk | kept |
| `turn.header` | שולחן {{n}} · סבב {{turn}} מתוך {{max}} | Table {{n}} · Turn {{turn}} of {{max}} | value |
| `turn.header_done` | שולחן {{n}} · סיימתם את הסבבים | Table {{n}} · all turns done | kept |
| `turn.wait_others` | חכו לשאר השולחנות | Wait for the other tables | kept |
| `turn.instr_pick` | בחרו שאלה | Pick a question | value |
| `question.teacher_list` | השאלות של המורה | The teacher's questions | kept |
| `question.add_own` | שאלה משלנו | Our own question | kept (the "+" is drawn by the row) |
| `question.add_placeholder` | כתבו את השאלה | Write the question | kept |
| `question.asked` | נשאלה | Asked | kept |
| `question.add_failed` | השאלה לא נוספה. לנסות שוב | The question was not added. Try again | kept |
| `turn.questions_used` | השאלות של המורה נשאלו. כתבו שאלה משלכם | The teacher's questions were all asked. Write your own | value |
| `turn.used_questions` | השאלות שכבר נשאלו ({{n}}) | Questions already asked ({{n}}) | kept |
| `turn.claim` | אני רוצה להתחיל | I want to start | value |
| `turn.pick_first` | קודם בוחרים שאלה | Pick a question first | NEW |
| `turn.question_taken` | השאלה הזאת כבר נשאלה. בחרו אחרת | This question was already asked. Pick another | NEW (UX, for `question-used`) |
| `turn.pass_ask` | אני רוצה לוותר | I want to pass | value |
| `turn.pass_ask_confirm` | לא תשאלו בשיעור הזה | You will not ask in this lesson | kept |
| `turn.pass_ask_yes` | כן, לוותר | Yes, pass | value |
| `turn.passed_ask_done` | ויתרתם על התור לשאול | You passed on asking | value |
| `turn.wait_pick` | חכו שאחרים יבחרו שאלה | Wait for others to pick a question | NEW |
| `turn.others_first` | תנו לאחרים לענות קודם | Let others answer first | NEW |
| `turn.who_answers` | מי עונה עכשיו? | Who answers next? | NEW |
| `turn.answer` | אני רוצה לענות | I want to answer | NEW |
| `turn.pass_answer` | אני רוצה לוותר | I want to pass | NEW |
| `turn.answer_mine` | הדקה שלכם | Your minute | NEW |
| `turn.finish` | סיימתי | Finish | NEW |
| `turn.answering` | {{name}} עונה | {{name}} is answering | NEW |
| `turn.answered_me` | כבר עניתם | You had your turn | NEW |
| `turn.passed_answer_me` | ויתרתם על השאלה הזאת | You passed this question | NEW |
| `turn.timer_label` | נותרו {{seconds}} שניות | {{seconds}} seconds left | value |
| `turn.was_first` | הפעם זה {{name}} | {{name}} was first | NEW (HE value chosen, see report) |
| `turn.saving` | שומרים… | Saving… | kept |
| `turn.action_failed` | זה לא עבד. לנסות שוב | That did not work. Try again | kept |
| `turn.retry` | לנסות שוב | Try again | kept |
| `common.cancel` | ביטול | Cancel | kept |
| `console.waiting_start` | ממתינים למי שיתחיל | Waiting for someone to start | NEW |
| `console.not_answered` | עוד לא ענו: {{names}} | Not answered yet: {{names}} | NEW |
| `console.speak_now` | לענות עכשיו | Answer now | value |
| `console.finish_minute` | לסיים את הדקה | End the minute | NEW |
| `turn.pass_for` | לוותר בשם {{name}} | Pass for {{name}} | kept |
| `console.pass_ask_for` | לוותר על התור בשם {{name}} | Pass asking for {{name}} | kept |
| `console.pass_ask_confirm` | {{name}} לא ישאלו בשיעור הזה | {{name}} won't ask this lesson | kept |
| `console.quick_turn` | להתחיל סבב {{n}} | Start turn {{n}} | kept |
| `console.asked_passed` | שאלו {{a}} · ויתרו {{p}} | Asked {{a}} · passed {{p}} | kept |
| `console.all_done` | כולם סיימו | All done | kept |
| `console.mark_asked` | {{name}}, אחרי התור לשאול | {{name}}, asked | NEW (sr) |
| `console.mark_asking` | {{name}}, שואלים עכשיו | {{name}}, asking now | NEW (sr) |
| `console.mark_passed_ask` | {{name}}, ויתור על התור לשאול | {{name}}, passed asking | NEW (sr) |
| `console.mark_answered` | {{name}}, אחרי הדקה | {{name}}, answered | NEW (sr) |
| `console.mark_passed_answer` | {{name}}, ויתור על השאלה | {{name}}, passed this question | NEW (sr) |

### 16.P Storyboard against the drawing (Dan / Tal)
| Col | Dan | Tal |
|---|---|---|
| 1 | P1: list, ✋ אני רוצה להתחיל, אני רוצה לוותר | P1: same; Tal picks and taps first |
| 2 | A: מי עונה עכשיו? · ✋ אני רוצה לענות | W: תנו לאחרים לענות קודם |
| 3 | S: הדקה שלכם · 0:59 · סיימתי | L: דן עונה · 0:59 |
| 4 | H: ✓ כבר עניתם · מי עונה עכשיו? | A: ✋ אני רוצה לענות |
| 5 | L: טל עונה · 0:59 · ✓ כבר עניתם | S: הדקה שלכם · 0:59 · סיימתי |
| 6 | P1 (paper again) | P2: חכו שאחרים יבחרו שאלה |
