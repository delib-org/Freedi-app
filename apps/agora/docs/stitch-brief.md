# Google Stitch brief — Agora deliberation screens

Prompts for [Google Stitch](https://stitch.withgoogle.com) to explore the two
deliberation screens fast. Paste **Prompt 0 first** (project + style), then one
screen prompt at a time. Iterate with the one-change-per-prompt tips at the end.

The mental model these screens must teach (from Tal's wireframe, 2026-07-13):

> **Both screens are the same workshop.** Top to bottom: the world (scene
> image) → the scoreboard → **the proposal on the table** → one tabbed work
> area. The ONLY difference: on Screen A the proposal is MINE (the tabs bring
> me feedback), on Screen B the proposal is SOMEONE ELSE'S (the tabs help me
> help them). Same skeleton = zero relearning.

---

## Prompt 0 — project context + style guide (paste first)

```
Design a mobile game UI for "Agora" — a classroom deliberation game where
students travel through time to solve a historical crisis (French Revolution).
Students write solution proposals, get feedback from classmates and from two
AI historical characters, and improve their proposals over 5 rounds.

Style — "Era of Lanterns", night-time painterly, cinematic, warm light on
deep indigo. NOT a productivity app; every screen is a scene in a game.

Colors:
- Background: deep indigo night #141126, elevated surfaces #241d45
- Text / paper: warm parchment #f4e8cf
- Primary accent (buttons, scores, glow): lantern gold #f5b944, glow #ffd882
- Camp A (royalists): royal blue #5b7bd6
- Camp B (revolutionaries): warm red #d65b6b
Camp colors are game semantics only — never decorative.

Typography: an era-flavored serif display face for titles, scores and buttons
(like Suez One); a clean body face for reading. Generous line-height.

Details: cards look like game panels (thin parchment hairline inside a dark
panel, soft gold glow on the important one); primary buttons are beveled gold
with light catching the top edge; a faint starfield lives in the background.
Audience: students aged 12–18, on phones. The real app is Hebrew RTL — design
LTR but keep layouts mirror-safe (no direction-dependent icons).
```

---

## Prompt 1 — Screen A: "My proposal" (the workshop, my turn to improve)

```
Screen: "My proposal" — the student sees feedback on their own proposal and
improves it. Vertical mobile layout, top to bottom:

1. SCENE IMAGE strip (top, ~20% height): a painterly night panorama of 1789
   Paris — town square, glowing lanterns, a time portal. This is the game
   world, always visible.

2. SCOREBOARD: one compact game panel with:
   - Two support bars labeled with camp names ("Royalists" blue dot,
     "Revolutionaries" red dot), each with "N rated" and a fill showing
     support; opposition shows as red fill in the opposite direction.
   - "Bridge power 28/100" — a gold meter with the caption "how much your
     proposal brings the two camps closer".

3. THE PROPOSAL ON THE TABLE: a glowing parchment-bordered hero card with a
   lantern icon 🏮, title "My proposal", the student's proposal text
   (2–4 lines), and a small edit (pencil) button.

4. WORK AREA — one card with three tabs:
   [ Feedback ] [ AI help ] [ Needs ]

   Tab "Feedback" (default, badge with count): ONE inbox stream mixing two
   kinds of items, each clearly attributed:
   - Peer suggestion: "Improvement idea from <anonymous name>" + text +
     three response buttons: "I'll implement" (primary gold), "Thanks",
     "No thanks".
   - Character verdict: the historical character's small portrait + name +
     an in-character quote judging the proposal + an acceptance meter
     "40/100" + an "Ask again" button. If the proposal changed since the
     verdict, show a "text changed — ask again" state instead of the score.
   Include an "Ask the Count" / "Ask Camille" pair of chips at the top of
   this tab for requesting new verdicts.

   Tab "AI help": a coach panel — one button "Improve my wording", and the
   coach's last note shown as a quote card.

   Tab "Needs": the two characters' needs side by side in two camp-colored
   columns (3 short needs each) — reference material while writing.

5. BOTTOM: one primary gold button "Continue to rating →". When the student
   taps edit on the hero card, the work area is replaced by a large textarea
   pre-filled with the proposal + "Save improvement" (primary) and "Cancel";
   saving fires a small golden sparkle celebration.

Header (above everything, thin HUD): 5 small lantern dots showing round
progress (2 lit), step indicator "1·Mine 2·Rate 3·Help" with step 1 active,
a small fuse countdown, and a gold points chip "12 points".
```

---

## Prompt 2 — Screen B: "Help someone" (same workshop, their proposal)

```
Screen: "Help someone" — identical skeleton to "My proposal", but the
proposal on the table belongs to a classmate, and the tabs help ME help THEM.

1. SCENE IMAGE strip: same panorama (continuity).

2. SCOREBOARD: same two camp bars + bridge meter, but for THEIR proposal.

3. THE PROPOSAL ON THE TABLE: same hero card layout but with a neutral (not
   gold) frame and the attribution "Proposal by <anonymous name>" — clearly
   NOT mine. No edit button. A small "Next proposal ↻" ghost button in the
   card corner to pick a different classmate to help.

4. WORK AREA — one card with three tabs:
   [ My suggestion ] [ AI help ] [ Needs ]

   Tab "My suggestion" (default): a textarea "How could this proposal serve
   BOTH camps better?", a hint line "strengthen it — don't attack it", and
   two buttons: "Send improvement" (primary gold) and "Skip this time"
   (ghost).

   Tab "AI help": coach panel — "Help me phrase my suggestion" button and
   the coach note as a quote card.

   Tab "Needs": the same two camp-colored needs columns.

5. HUD header identical to Screen A, with step "3·Help" active.

The screen must make instantly clear whose proposal this is: my screen has a
gold-glowing hero card and feedback flowing TO me; this screen has a neutral
hero card and my suggestion flowing FROM me.
```

---

## Prompt 3 (optional) — Screen C: rating between them

```
Screen: "Rate proposals" — between improving mine and helping others, the
student rates 3 classmate proposals. Same HUD and scene strip; a single
centered game panel with the proposal text and a five-level emoji scale in a
row: 😠 "Really against" (-1), 🙁 "Against", 😐 "Abstain", 🙂 "For",
😍 "Very much for" (+1) — red-to-green tinted borders, big touch targets.
A progress hint "2/3". No other actions on this screen: read, feel, rate.
```

---

## Iterating in Stitch — tips

- Paste Prompt 0, then ONE screen prompt. Refine with single-change follow-ups
  ("make the feedback items more compact", "move the ask-character chips into
  the feedback list header") — Stitch drifts if you change many things at once.
- Ask Stitch for a phone frame first; only after it looks right ask for the
  tablet/projector variant.
- When a screen feels right, export the design / copy the theme, and we'll
  translate it back into the app's SCSS tokens and Mithril views.

## What this fixes vs. the current app (for the eventual implementation)

1. One skeleton for both screens — currently "mine" and "help" look unrelated.
2. ONE feedback inbox — peer suggestions and character verdicts are one
   stream with attribution, instead of two separate sections.
3. Response vocabulary upgraded: "I'll implement / Thanks / No thanks"
   (currently accept/thank only — no polite decline).
4. AI coach and the needs board become tabs of the work area instead of
   floating buttons/toggles.
5. The scene image gives the world continuity on every screen.
