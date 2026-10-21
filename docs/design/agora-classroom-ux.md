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
