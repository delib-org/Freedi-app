# Agora Design Guide — "Purple Agora"

Agora is a game, not a form. This file is the contract every screen is built
against; the values live in `src/styles/tokens.scss` and nowhere else.

> Supersedes "Festival Day" (blue = mine / orange = a classmate's, daylight
> page) and, before it, "Era of Lanterns". Token *names* survived both
> re-themes — `--lantern` still means "the primary accent" — so read them as
> roles, never as descriptions of colour.


> **Looks (2026-09-03).** The room can now wear one of several looks, and
> this file describes the token *grammar* every look obeys rather than one
> palette. `candy` is the default (raspberry MINE, blueberry strokes, lime GO,
> on a cotton-candy page — `src/styles/_theme-candy-block.scss`); `purple` is
> the look described below, unchanged; `custom` is a look a student built
> from four seed colours (`_theme-custom-block.scss` grows the palette with
> `color-mix()`); `civic` is Odyssey's. Who picks is decided in shared-types
> (`resolveAgoraTheme`): the person's own choice, then the teacher's, then the
> default. The one law — MINE is the only saturated family, a classmate's is
> white — holds in every look; only the hues move. Candy adds one signature,
> the gummy edge: a hard 4px slab under buttons and cards, no blur. Candy
> clears the contrast gauntlet with no entry on the debt ledger; `npm run
> contrast` runs it under `?theme=candy` to keep it so.

---

## 1. The one law

**MINE is purple. A CLASSMATE'S is white.**

White is not a colour, it is the absence of one — which is exactly what "this
isn't yours" should feel like. A classmate's card stops competing for
meaning, and my own object becomes the only saturated thing on the screen.

The system this replaces spent two loud hues (blue vs orange) on the same
question and left nothing quiet to read against: every card shouted, so the
one that mattered couldn't.

### The page is WHITE

Not off-white, not lavender. The page is the negative space the design is
made of, and a tinted one is what killed the first attempt at this system:
when the background is purple-ish, every white card is tinted the same
colour as the thing that was supposed to stand out, so nothing does. The
screen reads as one purple smear.

**Count the saturated objects on any screen. There should be about three,
and the biggest one should be mine.** On the square: the crest tile, the step
you are on, and the dock. On the results screen: the crest, the active tab,
and the champion card. Everything else is white on white, separated by
shadow.

If you are reaching for a tint to make something stand out, the honest fix is
almost always more whitespace or a stronger shadow.

### Purple does two jobs, and the line is strict

| Purple on… | Means |
|---|---|
| **content** (a card, a bubble, a chosen answer) | this is mine |
| **chrome** (a tab, a control, the HUD) | this is active / selected |

There is no third case, because a content surface is only ever purple (mine)
or white (theirs). That is what lets the tab bar light up purple without
claiming ownership of anything.

### What a classmate's card gets instead of a colour

A white surface, a hairline edge, and a **tile** — the squircle carrying their
proposal's number or their initial. The tile is what makes a row an *object*
you can recognise before you read it. `--peer` is not "their colour"; it is the
thin stroke that draws that object. **If you are filling a large area with
`--peer`, the answer was white.**

---

## 2. Palette

Every value is measured. Contrast figures are against white unless stated.

### Mine — purple

| Token | Value | Role |
|---|---|---|
| `--mine-light` | `#a98cf7` | highlights, gradient tops, glows — **never under text** |
| `--mine` | `#8b6bf0` | the signature hue; fills behind dark text |
| `--mine-strong` | `#7350e3` | filled controls — white text = **5.24:1** |
| `--mine-deep` | `#5b39c9` | gradient bottoms, borders, pressed — **7.33:1** |
| `--mine-ink` | `#4a2fae` | purple **text** on white — **9.16:1** |

> **Contrast floor.** White text goes only over `--mine-strong` or darker.
> `--mine` and `--mine-light` are fills behind *dark* text, glows, borders and
> gradient tops. This is why there are two gradients (§3).

Aliases `--lantern` / `--lantern-glow` / `--lantern-deep` map to
`--mine` / `--mine-ink` / `--mine-deep` and are load-bearing in ~130 rules.

### Others — white

| Token | Value | Role |
|---|---|---|
| `--peer-surface` | `#ffffff` | a classmate's card |
| `--peer-tile` | `#f0ebfe` | the squircle behind their number or initial |
| `--peer` | `#6f6795` | identity strokes, hairlines |
| `--peer-glow` | `#565080` | "someone else's" **text** — 7.29:1 |
| `--peer-strong` | `#5f5888` | filled control — white label = 6.49:1 |

### Accents

| Token | Value | Role |
|---|---|---|
| `--mint` / `--mint-deep` | `#56dfc0` / `#22b699` | **go / good / progress** |
| `--mint-ink` | `#0d3b32` | dark label on mint — 7.3:1 |
| `--pink` | `#f56aa8` | notification counts. Nothing else. |
| `--gold` | `#ffd23f` | laps behind you, celebration sparks |
| `--amber` | `#ffb254` | warm accent tiles |

**A count is pink, and it is never `--danger`.** Every unread badge used to be
red, which said *something went wrong* about a classmate replying to you — the
friendliest event in the game. Pink costs the badge its AA margin (2.8:1 vs
red's 4.67:1) and it is on the accepted ledger for that reason; the hue was
judged worth the ratio. Red stays where it belongs: a timer running out, a
bucket voting *against*.

**Mint is rationed.** It fills a support meter, burns the current lap, and is
the one CTA allowed *on* a purple surface — where purple-on-purple would
vanish. Spending mint anywhere else is what makes a palette stop meaning
anything.

### Camps — game semantics, never decoration

| Token | Value | Role |
|---|---|---|
| `--camp-left` / `-strong` / `-glow` | `#e0873c` / `#b0631a` / `#8f4e10` | fill / filled control / text |
| `--camp-right` / `-strong` / `-glow` | `#14a08f` / `#0f8879` / `#0b7568` | fill / filled control / text |
| `--camp-center` / `-glow` | `#7b74a8` / `#565080` | the blend |

The left camp's royal purple did not survive the re-theme: purple means
"mine" now, and a camp wearing it would say *yours* every time it appeared.
Amber was freed the moment orange stopped meaning "a classmate's".

**Never let a camp wear purple, and never spend a camp colour decoratively.**

### Page and washes



`--bg-page` `#ffffff`.

The place washes (`--wash-mine-*`, `--wash-peer-*`, `--wash-square-*`) used to
repaint the whole viewport to say which room you were standing in. The HUD's
crest and name say that outright now, and a wash strong enough to be legible
was also strong enough to tint every white card sitting on it. What is left
is a breath of colour at the very top that reaches white before the first
card — atmosphere, not information.

The daylight sky and its drifting clouds went with them: white shapes cut out
of a white page are invisible at best. The sparkle field survives at whisper
opacity, as texture rather than tint.

---

## 3. Surfaces

### Gradients — declared once

```scss
--grad-mine           // mine-light → mine → mine-deep. Decorative purple.
--grad-mine-text      // mine → mine-deep + sheen. Chrome and bubbles: the dock,
                      // my message, the tab I am on, a field I type into.
--grad-mine-hero      // mine-light → mine → mine-deep + sheen. The ONE owned
                      // object on a screen, big enough to carry the full climb.
--grad-mine-selected  // mine-light → mine-strong. The face I pressed.
--grad-sheen          // the top-right highlight a purple surface can wear
```

Hand-rolling a sixth purple gradient in a component is how a re-theme rots.
A surface that holds text uses `--grad-mine-text`; the single hero object on
a screen uses `--grad-mine-hero` — that is the whole decision.

All five are `mock/delib-mock.css` verbatim, and that is deliberate: the
shipped ramp used to be `mine-deep → #4a2fae`, two near-navy stops in a row,
which stopped reading as a hue at all and made every screen a student reads
feel like dark chrome. The bright middle of the ramp belongs on exactly those
surfaces. **It costs AA** — white body copy on `--mine` is 3.85:1 — and the
fourteen runs that pay for it are named in the ACCEPTED ledger at the top of
`scripts/contrast-audit.mjs`. Read that ledger before moving a purple value.

### Radius — this is most of the "game" feeling

| Token | Value | Used for |
|---|---|---|
| `--radius-tile` | `14px` | **squircle tiles**: icons, number chips, avatars, crests |
| `--radius-lg` | `22px` | cards |
| `--radius-md` | `16px` | inner blocks |
| `--radius-sm` | `10px` | small controls |
| `--radius-full` | `999px` | pills, buttons, badges |

The **squircle tile** is the single most recognisable move in this system. A
HUD crest, a proposal's number, a character's portrait and a suggestion
author's initial are all the same object at the same radius. That is what
makes the app read as one system instead of a set of screens.

### Elevation

Shadows are **purple-tinted, never grey** — a neutral shadow under a purple
system reads as dirt. `--shadow-card` → `--shadow-raised` → `--shadow-mine`,
in increasing order of "this thing is lifted off the page".

On a white page a card has no tint separating it from the background, so
**the shadow is the only thing making it an object**. `--shadow-card` is
therefore a two-layer shadow — a wide soft one for lift, a tight one for the
edge — and it is the single number that decides whether a screen reads as a
list of things or as a wall of text.

---

## 4. The deliberation frame

The deliberation stage carries its own HUD and suppresses the journey strip.

- **Top: the HUD** — **white**, sticky, full-bleed. A purple crest tile, the
  place's name in dark ink (the *only* text up there), lap pips, a level
  track whose current step is the one filled purple object, and a fuse that
  drains. See §5.
- **Middle: the playfield** — white cards on a white page, separated by
  shadow and a hairline.
- **Bottom: the dock** — purple, because it *is* my proposal — parked on
  **the nav**, which is white because it is the app's furniture and belongs
  to nobody.

The HUD was purple once, full-bleed, on every screen. Between it and the dock
the app spent its one loud colour twice on furniture, and by the time a
student reached their own proposal purple had stopped meaning anything. Now
purple appears in the chrome **only where it carries state**: the crest, the
step you are standing on, the road behind you, the selected tab.

The dock's panel turns **back into white paper** the moment it opens: that is
where text gets edited.

---

## 5. Minimum text, maximum visual cue

The rule that shaped the current deliberation screens. Text that a picture
can carry is text that will be scrolled past.

| Was | Is |
|---|---|
| journey strip + cycle strip + countdown + place banner | one HUD |
| "round 2 of 4" | lap pips |
| "⚖️ 0/3" | quota pips under the step that asks for them |
| "time left: 19:49" | a draining fuse; digits only under 2:00 |
| "🌱 new" / "✏️ edited" / "🤝 helped" chips | round marks, words in the accessible name |
| "Your mission:" above the mission | the 🎯 tile |
| "remind me what both sides need" | the two characters' faces |
| a bare proposal number | a numbered tile |
| class support as a sentence | a mint meter |

**This is not licence to delete instructions.** Removing a redundant label is
the goal; removing the sentence that teaches a 13-year-old what to write is
not. The test: *does another element on this screen already say it?*

Every visual-only cue keeps its words as an `aria-label` and a `title`, and
the unfolded body repeats them in full.

---

## 6. The intro is not part of this

The narrative scenes (`.scene--immersive`, `VideoScene`) are a **TikTok-style
full-bleed player** and stay exactly as they are: media edge to edge, text in
50%-black glass chips, gold speaker names, glass buttons, the journey strip
hidden. They are self-contained — they do not read the page washes, the card
surfaces, or the ownership colours — so a re-theme passes straight through
them.

**Do not "bring the intro in line" with this guide.** It is a different medium
inside the same app, and it works.

---

## 7. Typography

Two self-hosted Hebrew families (loaded in `src/index.ts` via `@fontsource`,
not a CDN — the PWA precaches them for classroom devices offline).

- **Display** `--font-display` — **Alef**. Titles, buttons, join codes, anon
  code-names, scores, tile numerals.
  **Alef ships only 400 and 700.** Never ask for 500 or 600: the browser
  synthesizes a bold and smears Hebrew stems.
- **Body** `--font-body` — **Assistant** (200–800; 400/600/700 loaded).
- Hebrew-first: all layout uses logical properties (`inset-inline-start`,
  `margin-inline`, …); the app boots in RTL.
- **Tracking is a Latin device.** Positive `letter-spacing` opens up uppercase
  eyebrows, but Hebrew has no case and needs tight letter adjacency, and in
  Arabic it severs cursive joins. Tracked labels are reset under `[dir='rtl']`
  (end of `components.scss`). Two exemptions: join codes (digits read better
  spaced in any script) and the `Agora` wordmark.

---

## 8. Buttons

A button has a body and it *emits*. No bevel, no ledge.

- Flat fill or `--grad-mine-text`. No `inset` white speculars, no `0 3px 0`
  plinth.
- Depth is a soft halo in the button's **own** hue: each variant sets
  `--btn-glow` and one shared rule derives rest/hover/active from it.
- Pressed is `scale(.97)` with a contracting halo.
- Pill radius, matching `.delib-nav__item` and the dock.
- The primary button carries one sheen sweep on hover — the *only* decorative
  motion in the family.

**Primary is purple everywhere.** The old rule ("the way forward wears the
colour of the room") existed to stop a blue button appearing on an orange
screen; rooms have no colour to lend any more. On a purple surface the CTA
goes **mint**.

---

## 9. Motion

- Durations: `--motion-fast` 150ms (press), `--motion-base` 300ms,
  `--motion-slow` 600ms (marker pop, sheen), `--motion-camera` 1200ms.
- Easing: `--ease-camera` for travel, `--ease-spring` for playful pops.
- Every animation honours `prefers-reduced-motion` (global kill switch in
  `global.scss`).
- Only `transform` and `opacity` animate — never layout properties.
- Transitions between places are **camera moves**, never hard cuts. A step or
  lap change plays an arrival splash carrying that place's scene.

---

## 10. Accessibility

- **WCAG AA for all text**, and the contrast floor in §2 is not negotiable:
  white text only over `--mine-strong` or darker.
- Use the `*-glow` (dark) shades for coloured text on white.
- Focus rings: 2px `--mine-deep`.
- A visual-only cue (mark, pip, meter, tile) **always** carries an
  `aria-label`, and the state it encodes exists as text somewhere the user
  can reach.
- The map and every scene are decorative-plus: game-critical state shown on
  them must also exist as text (counts, names, stage).

---

## 11. The on-dark contract (and why this bug kept coming back)

Components re-derive themselves from tokens. A chip reads `--text-muted` for
its label and `--border-subtle` for its hairline; a hint reads `--text-muted`;
a divider reads `--border-subtle`. **Every one of those is defined against
white.** Render that component on a saturated surface and it is dark ink on a
dark fill.

You cannot fix this by fixing the component, because the component is
correct — the surface is what changed. And you cannot fix it by fixing the
instance, because the next element added to that surface will have it too.
It was found three separate times by screenshot before it was fixed once by
rule.

### The rule

A surface that fills with a saturated colour re-points the ink and hairline
tokens at their on-dark values (`ink-on-dark` in `tokens.scss`). Every
descendant then re-derives correctly with **no rule of its own**.

A light region nested inside one — a panel that opens, a white pill carrying
a semantic colour — hands the ink back with `ink-on-light`. Same registry,
opposite direction.

**Not remapped:** `--success`, `--danger`, `--warning`, and the camps. Their
*hue* is the message, so they cannot be flattened to white. A component that
needs one on a dark surface puts it on a **light chip** — which is why
`--bg-card-solid` is deliberately left out of the inversion, so a white pill
stays white.

### The registry

The selector list in `tokens.scss` **is** the contract. Adding a saturated
surface to the app means adding it to that list.

### Enforcement

```bash
node scripts/contrast-audit.mjs           # the surface gauntlet
node scripts/contrast-audit.mjs <url>     # any page
node scripts/delib-shots.mjs <dir>        # every real screen, audited
```

`mock/surfaces.html` is the **gauntlet**: every saturated surface, each loaded
with the components most likely to break on it — a muted hint, a timestamp, an
outlined chip, a secondary label. It imports the real stylesheets, because a
gauntlet built on a copy of the CSS proves nothing about the app.

`scripts/contrast-audit.mjs` measures what actually rendered: it walks every
visible text run, composites the real background behind it (ancestor fills,
gradient stops, translucent veils over opaque bases) and fails anything under
AA. It exits non-zero, so it can gate a commit.

Both halves are needed. The gauntlet proves the surfaces in isolation; the
screen pass proves them with the app's real content in them — and that is
where the last five failures were hiding, on a results screen nobody had
thought to re-check.

### Two rules this turned up, worth stating on their own

- **A modifier must never be able to lose to the block it modifies.**
  `.rate-scale__option--selected` sat *above* the `.rate-scale` base block, so
  at equal specificity the base's `background` won and the chosen face
  rendered unselected. `.my-lantern__textarea` was the same trap. Declare
  modifiers after their base, not before.
- **Fill colours and text colours are different tokens.** `--danger` is a fill;
  as text on white it is 4.19:1, which is why `--danger-ink` exists. The same
  split is why white text goes on `--mine-strong`, never `--mine` (3.85:1).

---

## 12. Working on the design

`mock/delib-mock.html` is a **standalone design simulation** — two phone-sized
screens, no emulator, no game run. Iterate there first:

```bash
node scripts/mock-shot.mjs mock/shot.png      # the sim
node scripts/delib-shots.mjs after/           # the real app, phone-sized
```

The sim is where the language gets settled; `components.scss` is where it
ships. When they disagree, the sim is a proposal and this file is the law.
