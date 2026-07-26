# Israeli Odyssey — Phaser Game-Feel Specification

Status: design spec, ready to implement (target: one day)
Scope: the 5 player screens (Intro, Compass, Map, Voyage, Summary) in `mode === 'game'`.
Out of scope: Admin, `mode === 'direct'` (stays plain React, untouched), Firestore pipeline (unchanged).

---

## 0. Goal & player motivations

The behavior we want: **explore islands, reflect honestly, complete a voyage** — then walk through the
Agora gate. Mapped to Self-Determination Theory:

- **Autonomy** — the player chooses which islands, how many, whether to write depth/log entries, and can
  drop to direct mode at any time. Nothing is mandatory beyond one attitude per island.
- **Competence** — visible craft progress: a compass that calibrates, a wake trail that lengthens, a log
  that fills, lanterns that light. All completion-based, never opinion-based.
- **Relatedness** — party ships and fellow sailors shown as *proximity on a shared sea*, framed with the
  existing caption language ("עגינה זמנית — לא פסק דין"), never as ranking or verdict.

Hard ethical constraints (restated because every mechanic below was filtered through them):
no reward for *which* opinion, only for *having engaged*; no competition between players; no streaks,
timers, FOMO or loss framing; identical celebration "juice" for תומך / יכול לחיות עם זה / מתנגד.

---

## 1. The continuous metaphor: one voyage, dawn to golden evening

**The player's boat is a persistent avatar** present in every scene, and **the time of day advances
with progress** (never with the wall clock):

| Screen  | Scene key         | Time of day  | Sea state | Emotional beat |
|---------|-------------------|--------------|-----------|----------------|
| Intro   | `HarborScene`     | Pre-dawn     | Still, moored | Anticipation |
| Compass | `CompassScene`    | Dawn         | Calm at anchor | Self-calibration |
| Map     | `ChartScene`      | Morning      | Light chop | Choosing a route |
| Voyage  | `VoyageScene`     | Midday → afternoon (advances per island) | Sailing swell | Exploration |
| Summary | `HomecomingScene` | Golden hour  | Gentle, lantern-lit | Reflection & arrival |

Time-of-day is implemented as a single `dayPhase: number` (0..1) on the shared base scene: it drives a
sky gradient (two-stop `Phaser.Graphics` rect redrawn on change), a global tint lerp on the ocean image
(`0x9fc9ff` at dawn → `0xffffff` midday → `0xffd9a0` golden hour), and star/lantern visibility.
In Voyage, `dayPhase = 0.45 + 0.35 * (islandIndex / max(1, islandCount - 1))`. Tween any dayPhase change
over **1200ms, Sine.inOut**. Because it only advances with progress, it can never read as time pressure
(see ethics flags §8).

**RTL sailing direction**: this is a Hebrew game — *forward is right→left*. The boat faces left
(`setFlipX` on `ship.png` as needed); scene-exit transitions sail the boat off the **left** edge; new
islands approach from the **left**. All Phaser text objects use plain Hebrew strings (Phaser renders
Hebrew glyphs fine but does no bidi shaping) — **never mix digits or Latin into a Phaser string**; any
label combining Hebrew + numbers ("אי 3 מתוך 5", "~8 דקות") lives in DOM overlays or is split into two
Phaser text objects (digits-only object beside a Hebrew-only object).

**Scene handoffs (routes stay, feel doesn't jump).** One `Phaser.Game` lives in a fixed full-viewport
host behind the DOM (§6). A route change never destroys the canvas; instead:

1. Page A calls `stageBus.goTo(nextSceneKey, payload)`.
2. Current scene plays its **exit beat** (~900–1400ms, below per screen), then `this.scene.start(next)`;
   the incoming scene fades its own layers from the same sea, so water is continuous.
3. Scene emits `transitionDone`; page A then calls `navigate()` (with a 1600ms safety timeout so a
   dropped event can never trap the user).
4. DOM overlays are independent: outgoing panel fades/slides out in **200ms** as soon as the button is
   pressed; incoming page's panel slides in **250ms** after mount. The canvas carries the continuity;
   the DOM just breathes.

---

## 2. Per-screen specification

Coordinates below are fractions of viewport (`W`, `H` = `scale.width/height`; Scale.RESIZE, §6).
"Panel" = DOM overlay styled as **chart parchment**: `background: linear-gradient(160deg, rgba(10,30,52,.92), rgba(6,20,38,.94))`,
1px `rgba(232,185,88,.7)` border, 14px radius, subtle inner shadow — i.e., the existing `.panel` look,
kept, so DOM overlays already feel native to the sea. Do **not** invent a paper-beige parchment; the
existing night-chart aesthetic is the house style.

### 2.1 Intro — `HarborScene` (pre-dawn harbor)

**Phaser layer**
- Ocean: `mediterranean-ocean.png` full-bleed (cover-fit), tint `0x8fb8e8`, plus dark overlay rect
  `0x06192c` alpha 0.35.
- Stars: 40 one-pixel white points (generated texture), upper 45% of screen, each with an alpha tween
  0.3↔0.9, duration `1400 + rand*1600`ms, staggered. Skip entirely under reduced motion.
- Player boat moored at `(0.68W, 0.78H)`, scale ≈ 0.16 of ship.png; bobbing tween: `y +6px, angle 1.4°,
  2100ms, Sine.inOut, yoyo, repeat -1` (verbatim from PartySea).
- Anchor line: 2px `0x9fd7ff` alpha 0.5 line from bow to water; small anchor glyph (Graphics: rounded
  T-shape, 18×24px) at water line.
- Lantern on the mast: radial-gradient glow texture (64px, warm `0xffd9a0`), alpha flicker 0.75↔1.0,
  900ms Sine yoyo.
- 2 gulls: code-drawn 2-frame "∨/∧" wing sprites (Graphics → generateTexture, 24×10px, white alpha .85),
  drifting right→left across the top third at 18px/s, flap toggle every 260ms. Ambient only.

**DOM overlay** (unchanged content): centered panel with motto, title, intro text, login / start button.
Button text stays "⚓ {startButton}".

**Exit beat (on start click, before navigate('/compass'))** — total **1400ms**:
1. Anchor glyph tweens up 40px, **600ms Back.easeIn**; anchor line retracts (scaleY→0).
2. A sail unfurls: white triangle Graphics on the mast, `scaleY 0→1, 450ms, Cubic.out` (starts at 300ms).
3. Boat sails left to `(0.30W)`, **900ms Sine.in**, wake emitter on (below), gulls scatter upward.
4. Sky begins dawn: dayPhase 0→0.15 over the same 900ms. Crossfade to CompassScene.

### 2.2 Compass — `CompassScene` (dawn, at anchor; "ארבע רוחות המצפון")

Layout: boat small at `(0.82W, 0.80H)` (still bobbing); a large **compass rose** is the scene's hero,
centered at `(0.5W, 0.42H)` on desktop, top-anchored `(0.5W, 0.24H)` on portrait so the DOM cards can
scroll beneath it.

**Compass rose** — `[generate-with-code]`, one Graphics-built container, radius `min(0.22W, 180px)`:
- Outer ring 3px `0xe8b958`; inner ring 1px alpha .5; 4 cardinal points as elongated diamonds; 4 small
  petal glyphs between them (one per "wind" = one per questionnaire section), drawn dim
  (`0x5edfff` alpha 0.25) until earned.
- Needle: two joined triangles (gold north half, cream south half), pivot center.

**DOM overlay**: the existing question cards, one per wind, scrolling normally *over* the canvas
(canvas is fixed behind; the page scrolls — no iframe-style inner scrolling). The textareas are the
canonical example of "DOM where Phaser is bad": they stay fully native (mobile keyboards, RTL input,
paste). Visual integration: each card gets a small compass-point glyph in its header matching its petal,
and a 2px gold left-edge accent that lights when the card is answered.

**Micro-feedback**
- *A wind becomes answered* (text non-empty OR ≥1 chip; React computes, calls
  `stageBus.compassWindLit(index)`): needle swings to that wind's bearing — `rotation` tween **700ms
  Back.out(1.4)**; the petal brightens to full `0xe8b958` with a **12-particle** gold sparkle burst
  (400ms lifespan, speed 40–80, gravity 0). Un-answering dims the petal back (no negative effect, just
  a 300ms fade — never a "loss" animation).
- *Value picked* (4th wind): a **signal pennant** hoists onto a halyard line strung from the compass
  toward the boat — one triangle Graphics pennant per ranked value, 26×16px, colored from a fixed
  neutral 5-color set (`0xe8b958, 0x5edfff, 0x9fd7ff, 0xfff4d3, 0x7bd4a8` — order = rank, color carries
  no meaning), drop-in tween `y -40→0, 350ms, Bounce.out`. Removing a value slides its pennant down and
  out (250ms) and re-spaces the rest. These pennants **persist on the boat's mast for the whole voyage**
  (§4) — identity, not score.
- *All four winds complete*: needle performs one full 360° sweep (**900ms Cubic.inOut**) and settles
  pointing up; a short Phaser text under the rose fades in: plain Hebrew, `"הצפון שלך"` (no numbers).
  Sun disc (generated radial texture) rises over 1200ms; dayPhase → 0.3. This plays once per visit.

**Exit beat (save → navigate('/map'))** — **1300ms**: rose shrinks/tucks toward the boat (scale→0.3,
alpha→0, 500ms), sails unfurl, boat sails left off-screen with wake; a chart-paper rectangle (Graphics,
cream alpha 0.08 with gold border) "unrolls" across the screen (`scaleX 0→1` from right edge, 600ms
Cubic.out) becoming the map frame of ChartScene.

### 2.3 Map — `ChartScene` (morning; "המפה נפתחת")

This is the most game-native screen: **Phaser owns the islands and interactions**; DOM keeps only the
header text and the sail button.

**Phaser layer**
- The ocean now framed as a nautical chart: full-bleed ocean + a 2px gold inset border at 3% margin,
  faint rhumb lines (4 radiating 1px lines alpha 0.06 from the harbor corner).
- Harbor (start point): bottom-right corner `(0.9W, 0.86H)` — the boat waits here, pennants flying.
- Destination marker `(0.08W, 0.12H)`: small castle glyph + Phaser text `"ממלכת ההגעה"` (use
  `text('destinationName')` — plain Hebrew).
- **Islands**: one container per enabled island at `(posX%, posY%)` of the chart area (same admin data
  as today; note `right: posX%` in the DOM version means Phaser x = `W * (1 - posX/100)`).
  Each: disc 30px radius (min tap target 60px invisible hit area), fill `0x0a2a48`, 2px stroke
  `0x5edfff`; if `imageUrl`, load it at runtime (`this.load.image` in a dynamic loader) masked to the
  disc; else the island index as a digits-only text object. Label: island title (plain Hebrew) in a
  small dark pill under the disc, 13px. Idle: each island bobs ±2px, 2600ms+index*230, Sine yoyo.
- Selection order route: dashed Graphics polyline harbor → islands in selection order, 2px `0xe8b958`
  alpha 0.7, redrawn on change; dash "marching ants" via a 40ms-interval offset increment (skip the
  march under reduced motion — static dashes).

**Interactions (Phaser pointer → React via bus)**
- Tap island → `stageBus.emit('islandTapped', id)`; React toggles its `selected` set (source of truth
  stays in React state, exactly today's logic) and pushes back `stageBus.setSelection(ids)`.
- *Select feedback*: an anchor glyph stamps onto the disc — drops from 24px above, **250ms Cubic.in**,
  1-frame 1.15× squash on landing (80ms), plus an expanding ripple ring (Graphics circle 0→48px radius,
  alpha 0.8→0, **500ms**). Disc stroke → gold. Boat at harbor rotates to face the tapped island (300ms).
- *Deselect*: anchor floats up and fades (300ms), ripple omitted, stroke back to cyan. Calm, symmetric,
  no loss-aversion framing.
- Nothing else is gated: no minimum, no "recommended islands", no highlighting of any specific island.

**DOM overlay**: header (title, intro, the "אין חובה לעבור בכל האיים" line — keep verbatim) at top;
bottom-center the sail button with its live count/minutes text (mixed Hebrew+digits → DOM, as today).
`direct` mode keeps the existing checkbox list, untouched.

**Exit beat (sail → navigate('/voyage'))** — **1400ms**: boat leaves harbor along the dashed route
toward the first selected island (position tween along the first segment, 900ms Sine.inOut, wake on),
camera zooms 1.0→1.25 toward that island (Phaser camera zoomTo, 900ms), then crossfade into
VoyageScene which opens already zoomed on that island's vignette.

### 2.4 Voyage — `VoyageScene` (the core loop; "ההפלגה")

Layout per island:
- **Island vignette** upper-left area `(0.30W, 0.30H)`: the island disc/image scaled ×2.2, with 2–4
  **shore markers** (חופים) arranged on its lower arc — small jetty glyphs (Graphics: 3 planks + post),
  one per stance, spaced 32° apart. A digits-free Phaser text label per shore is *not* shown (stance
  text is long → DOM only); shores are visual anchors for feedback.
- Player boat lower-right `(0.72W, 0.74H)`, pennants on mast, gentle sail bob. Wake emitter idles.
- Party ships on the horizon band (`y = 0.18H..0.55H`): **reuse PartySea's exact layout math** —
  extract `shipLayout(distance, index, count)` → `{x, y, scale, alpha}` into `src/lib/seaLayout.ts`
  (unit-tested, §6) with the same formulas (`x = W*(0.12 + 0.76*(i+0.5)/n)`,
  `y = H*(0.2 + 0.5*(1-d))`, `scale = 0.075 + 0.11*(1-d)`, `alpha = 0.55+0.45*(1-d)`, null→0.9/0.45).
  Ships are present *throughout* the voyage, not only in the reaction phase — but they only *move*
  during the reaction beat, so evaluation is never nudged mid-question (see ethics §8: this respects
  the same principle as the MC no-mid-flow-indicators rule).

**DOM overlay — the question panel.** Slides up from the bottom (**translateY 24px→0 + fade, 250ms**)
as a chart panel, max-width 720px, scrollable page. Contents unchanged: opening text, stance cards with
the three attitude buttons, depth textarea, captain's-log textarea, continue button. The two textareas
are DOM by necessity and by design — framed as **log pages**: a small 📖 header and a 1px gold underline
that draws itself left-to-right… no — RTL: right-to-left (`scaleX` transform-origin right, 400ms) the
first time the player types in each. That ink-line is the only writing feedback; no counters.

**Micro-feedback — marking an attitude (THE core moment).** The instant any attitude button is pressed
(React `setAttitude` optimistic update already exists → also call
`stageBus.attitudeMarked(stanceIndex)`):
- A **buoy** appears at that stance's shore marker: 10px circle + 14px pennant pole, pops in with
  `scale 0→1.15→1.0, 200ms Back.out`, plus **8 water-splash particles** (white-blue, speed 30–70, life
  350ms, slight gravity 60).
- **Equal-juice rule (hard requirement)**: particle count, durations, easing, sound (if ever added) are
  *identical for all three attitudes*. The only difference is the pennant glyph on the buoy: ⚓ for
  תומך (anchored here), 〜 for יכול לחיות עם זה (can float here), ⛵ for מתנגד (sails past). Neutral
  nautical glyphs, no colors coding good/bad — all three pennants are cream `0xfff4d3`.
- Changing an attitude replaces the glyph with a 150ms crossfade — again symmetric, no "undo" drama.
- Party ships do **not** move at this moment.

**Micro-feedback — completing an island (submit).**
1. Panel slides down/out (250ms). A **logbook stamp** beat: a Phaser container (ring + island glyph)
   appears center-screen at scale 1.4, stamps to 1.0 with −5°→0° rotation, **300ms Cubic.in**, tiny
   4px camera dip on impact (one 120ms bob — a *swell*, not a shake; screen shake is banned for tone,
   §8), then the stamp shrinks and flies to the **voyage-log strip** (§4) bottom-left, 400ms.
2. **Reaction phase** — "הים מגיב לבחירות שלך": camera pulls back (zoom 1.25→1.0, 700ms), then party
   ships tween to their new `shipLayout` positions, **1400ms Sine.inOut** (verbatim PartySea timing).
   A gentle sea swell: camera y-bob ±4px, 800ms, once. DOM caption bar (existing `voyageShipsNote`
   text, verbatim) fades in at the bottom, with the next-island button.
3. Wake trail: the boat's cumulative journey polyline gains a segment (see §4).

**Between islands (next button)** — **1200ms**: current island slides off right at 220px/s with
parallax (ocean scrolls at 0.4×, ships at 0.7×, island at 1×), next island approaches from the left,
growing scale 0.4→1.0, **900ms Sine.out**; dayPhase advances its per-island step; panel for the next
island slides up. On the last island the button reads as today and exits to Summary: the boat turns
toward a warm glow on the left horizon, sails 900ms, crossfade.

### 2.5 Summary — `HomecomingScene` (golden hour; "תוצר סוף המסע")

**Phaser layer — the arrival tableau** (top of page, ~52vh band; the page scrolls DOM sections below):
- Golden-hour tint, sun low on the left, lantern glows on.
- **Voyage replay** (plays once, ~3–4s, tap-to-skip): camera pans right→left along the full wake-trail
  polyline of visited islands; as the camera passes each island, its **lantern lights** — warm glow
  texture fades in 300ms + 6 gold sparkles — staggered by the pan. Equal glow for every island
  regardless of answers.
- Final state: all visited islands lit, wake trail complete, party ships at final `shipLayout`
  positions (distances from React exactly as today), the boat at a small harbor on the left with its
  5 value pennants flying, and **fellow sailors** as tiny distant sail glyphs (12×16px white triangles)
  placed on the horizon band at x spread evenly, y by their distance (same 0.2+0.5(1−d) band), max 8,
  labeled only on the DOM list below — ambient presence, not markers to compare.
- **Arrival celebration** (once, ~2.5s, skippable, plays after the replay): flags run up the boat's
  mast — one small cream flag per visited island, staggered **150ms**, Bounce.out; 3 gulls circle; one
  burst of **24 gold particles** over the harbor. That's the whole fanfare — no score card, no grade.
- **The Agora gate**: on the far-left horizon, a **lighthouse** (Graphics: tapered tower + gallery,
  ~90px tall) with a slowly sweeping light beam (cone alpha 0.12, 6s rotation period; static beam
  under reduced motion). It sits above the DOM Agora section as its visual anchor.

**DOM overlay** (unchanged content, existing panels): ships-by-distance list, compass journal, fellow
sailors, **OpinionMap stays SVG/DOM exactly as is** — it encodes the honesty rules (equal scale, scale
bar, r < 0.8 self-hiding) and precision text; porting it to Phaser adds nothing and risks fidelity.
The Agora panel keeps its texts; pressing the Agora button triggers `stageBus.sailToLighthouse()` —
the boat sails toward the lighthouse through its beam (1000ms) while the link opens (don't block
navigation on the animation; fire and go).
The "לחזור למפה ולחקור איים נוספים" link stays — re-entering ChartScene keeps lit lanterns visible on
already-visited islands (subtle glow), which is the invitation-to-explore loop, with zero pressure copy.

---

## 3. Mechanic design summary (collective + individual channels)

- **Individual attribution channel**: voyage log stamps, wake trail, pennants, lanterns — all personal,
  all completion/reflection artifacts, none comparable between players (no one ever sees another
  player's log).
- **Collective channel**: the shared sea itself — fellow-sailor sails and party ships positioned by the
  real distance engine. It is *presence*, not reward: the collective outcome of this game is walking
  into Agora, and the lighthouse-gate is deliberately the final, most-lit object on screen.
- **Feedback loops**: mark attitude → immediate personal buoy (competence); complete island → sea
  reacts (the world acknowledges you) + log stamp (personal record); finish → replay of *your* route
  (narrative identity) → gate (relatedness handoff to deliberation).

## 4. Reward & progression design ("what makes finishing feel rewarding")

**There is no credit economy in Odyssey — deliberately.** Do not wire the Hooked credit engine, levels,
streaks or toasts into this app. Rationale (overjustification effect): this is a 5–20 minute reflective
civic act before an election; extrinsic points would cheapen it and any per-action reward would
inevitably sit next to an opinion choice. Completion artifacts only:

| Artifact | Earned by | Where seen | Notes |
|---|---|---|---|
| **Wake trail** | Sailing (automatic) | Voyage + Summary replay | Cumulative Graphics polyline; persisted in memory per session; recomputable from `journey.selectedIslandIds` + visited order, so no schema change |
| **Voyage-log stamps** | Completing an island (≥1 attitude) | Bottom-left strip in Voyage (max 12 tiny stamps), Summary | Equal stamp for every island |
| **Lanterns** | Same as stamps | ChartScene revisit + Summary | Equal glow always |
| **Value pennants** | Compass ranking | Mast, all scenes | Identity expression; colors carry no meaning |
| **Quill mark** | Writing a depth/log entry | On that island's log stamp (small ✒ dot) | Celebrates reflection; **no counter, no target, no "x/y" meter** |
| **Arrival flags + gulls** | Finishing the voyage | Summary, once | 2.5s, skippable, never replayed as pressure |

**Anti-gaming check (selfish-optimizer test)**: the fastest path is tapping one attitude per island and
skipping all text — that player gets the same lanterns and flags. Correct outcome: there is nothing to
hoard, so speedrunning harms nobody and their evaluations are still real data. No caps or decay needed
because there are no accumulating currencies. The one thing to guard: `rateStance` is idempotent per
stance (re-marking overwrites, never double-counts) — already true in the evaluations pipeline.

**Named constants** (put in `src/lib/stageConstants.ts`, no magic numbers in scene code):
`TWEEN_SHIP_MS = 1400`, `TWEEN_TRANSITION_MS = 1400`, `TWEEN_PANEL_MS = 250`,
`TWEEN_STAMP_MS = 300`, `PARTICLES_SPLASH = 8`, `PARTICLES_SPARKLE = 12`, `PARTICLES_ARRIVAL = 24`,
`PARTICLES_MAX_LIVE = 40`, `BOB_MS = 2100`, `DAYPHASE_MS = 1200`, `STAGGER_FLAGS_MS = 150`,
`STAR_COUNT = 40`, `GULL_COUNT = 2`.

## 5. Asset list

**[existing]**
- `ship.png` (1024×1536 — heavy; add a build-time or one-off downscale to ~320px height as
  `ship@1x.png`; keep loading via the same key)
- `mediterranean-ocean.png` (1672×941)
- `favicon.svg`
- Island `imageUrl`s from admin content (optional per island, runtime-loaded)

**[generate-with-code]** (all via `Graphics.generateTexture()` in `BootScene`, or live Graphics):
compass rose + needle + petals; signal pennants (5 colors); halyard/anchor lines; anchor glyph; ripple
ring; dashed route line (live Graphics); island discs + pills; jetty/shore glyphs; buoy + 3 pennant
glyph variants (⚓/〜/⛵ can be Phaser text glyphs on the pennant); splash particle (4px soft circle);
sparkle particle (4-point star, 8px); wake particle (3px white circle, alpha fade); star point (1px);
sun/lantern glow (64px radial gradient via canvas texture); gull 2-frame sprite; castle glyph;
lighthouse + beam cone; arrival flags; log-stamp ring; sky gradient rects.

**[needs-art]**: none required. Optional v2 nice-to-have: 1 illustrated island set — skip for now.

**Sound**: out of day-one scope. Leave `stageBus` events as the future hook points; if added later,
generate with WebAudio (no files) and default **off** with a visible toggle.

## 6. Scene architecture

**Decision: one `Phaser.Game`, five scenes, one persistent host — not per-screen games.**
PartySea's per-component game was right for a single embedded widget; for five screens it would mean
five canvas boot costs, no cross-screen continuity (the whole metaphor), and duplicated sea code.

- `src/components/SeaStage.tsx` — mounted once in `App.tsx` (inside `GameProvider`), only when
  `mode === 'game'` **and** the route is a player screen (`/`, `/compass`, `/map`, `/voyage`,
  `/summary`; never `/admin`). `position: fixed; inset: 0; z-index: 0`; all page content wraps in
  `z-index: 10`. Keeps PartySea's **dynamic `import('phaser')`** pattern so direct-mode users never
  download Phaser. `game.destroy(true)` on unmount (mode toggle or leaving player routes).
- Config: `Phaser.Scale.RESIZE` + `autoCenter: CENTER_BOTH` (full-bleed, mobile portrait-friendly —
  unlike PartySea's FIT 1280×720). Scenes lay out from `this.scale.width/height` fractions and
  re-layout on the `resize` event. `render: { antialias: true }`, `backgroundColor '#071a2a'`.
- Scenes: `BootScene` (texture generation, then starts the scene matching the current route),
  `HarborScene`, `CompassScene`, `ChartScene`, `VoyageScene`, `HomecomingScene` — all extending
  `SeaScene` (shared base: ocean layers, dayPhase, boat avatar factory, wake emitter, pennant state,
  reduced-motion flag).
- **`src/lib/stageBus.ts`** — extract and extend the PartySea bus into a typed singleton emitter
  (no `any`; a discriminated-union `StageCommand` / `StageEvent`):
  - React → Phaser: `goTo(scene, payload)`, `setSelection(islandIds)`, `updateDistances(SeaDistances)`,
    `compassWindLit(index)` / `compassWindDimmed(index)`, `setPennants(valueIds)`,
    `attitudeMarked(islandId, stanceIndex)`, `islandCompleted(islandId)`, `celebrateArrival()`,
    `sailToLighthouse()`.
  - Phaser → React: `ready`, `islandTapped(islandId)`, `transitionDone(sceneKey)`, `replaySkipped`.
  - Commands issued before `ready` are queued and flushed (React pages mount before scenes exist).
- **React stays the brain.** Pages keep 100% of today's Firestore logic, GameContext, distance-engine
  calls, and navigation; scenes are pure presentation fed by bus payloads. `deep-linking` (refresh on
  /voyage) just means BootScene starts VoyageScene directly and the page pushes its payload on mount.
- **`src/lib/seaLayout.ts`** — pure functions with tests (per repo testing rules, 80%+):
  `shipLayout(distance, index, count, W, H)` (extracted verbatim from PartySea), `islandPosition(posX,
  posY, W, H)` (including the RTL `1 - posX/100` conversion), `dayPhaseForIsland(index, count)`,
  `wakeTrailPoints(...)`.
- **PartySea.tsx retirement**: in game mode its two call sites (Voyage reaction, Summary) are absorbed
  by VoyageScene/HomecomingScene. Keep the file until the migration lands, then delete; its layout
  math already lives on in `seaLayout.ts`.
- Perf: pause the game on `document.hidden`; hard cap live particles at `PARTICLES_MAX_LIVE = 40`;
  destroy off-screen island textures when leaving ChartScene.

## 7. Reduced-motion + mobile story

**Reduced motion** (`prefers-reduced-motion: reduce`):
- In `mode.ts` `current()`: if no stored preference **and** the media query matches, default to
  `'direct'` — the direct React flow *is* the reduced-motion experience, and it must remain a
  first-class, dignified path (it already is — don't touch it). The GameChrome toggle still lets the
  user opt into game mode explicitly.
- If the user explicitly chooses game mode while reduced-motion is on, `SeaScene` sets
  `this.reducedMotion = true`: all `repeat: -1` ambient tweens off (boat static, no bobbing, no star
  twinkle, no beam sweep, no marching dashes); every transition becomes a **250ms crossfade**; all
  particle emitters disabled; ship distance updates use the existing instant `layout(…, animate=false)`
  path; the Summary replay is replaced by the final tableau shown immediately.
- Respect it live via `window.matchMedia('(prefers-reduced-motion: reduce)')` + change listener.

**Mobile (portrait, the primary election-season device)**:
- RESIZE scale keeps the sea full-bleed; layout fractions re-anchor: Compass rose to top quarter,
  Voyage island vignette to top third, boat to bottom-right sixth; DOM panels behave as bottom sheets
  (they already do, being normal page flow).
- Tap targets: island hit areas ≥ 60px even when the disc renders 44px; attitude buttons are DOM
  (already fine).
- Perf tiers: on `devicePixelRatio > 2` with `innerWidth < 480`, drop parallax to a single ocean layer,
  halve particle counts, `STAR_COUNT = 20`. Canvas renderer fallback is automatic (`Phaser.AUTO`).
- Text entry: because all input is DOM, the mobile keyboard just works; when a textarea focuses,
  nothing in the canvas needs to move (the page scrolls natively over the fixed canvas).

## 8. Ethics audit flags

Flagged items (each must survive the Regret / Transparency / Vulnerability tests; recommend a
`ethical-ux-psychologist` agent pass on exactly these before ship — this is a pre-election civic
context, the highest-sensitivity setting we have):

1. **Equal-juice rule on attitude marking (§2.4)** — verify in code review that particle counts,
   durations and glyph prominence are byte-identical across תומך/יכול לחיות עם/מתנגד, and that pennant
   glyphs read as neutral nautical marks, not ✓/✗ valence. This is the single highest-risk mechanic.
2. **Party ships** — equal visual treatment (same sprite, flag color + name only), x-position fixed by
   `sortOrder` index (as PartySea does today), never re-ordered by distance; ships move only in the
   reaction phase, never while the player is choosing (same principle as the MC no-mid-evaluation-
   indicators rule). Keep the "עגינה זמנית — לא פסק דין ולא הוראת הצבעה" captions verbatim.
3. **Day-night progression** — advances only with player progress, never wall-clock; confirm no copy or
   visual implies running out of time (no sunset countdown feeling on long sessions: dayPhase is
   clamped, and idling never advances it).
4. **Arrival celebration** — one-time, ≤2.5s, skippable, no replay nudge, no share prompt.
5. **Quill marks** — presence-only, no counters/targets, so reflection is invited, never scored.
6. **Reduced-motion defaulting to direct mode** — an accessibility kindness, but confirm the opt-back-
   in banner isn't nagging (show once, remember dismissal).
7. **Deliberately absent** (state for the record): no streaks, no notifications, no leaderboards, no
   per-opinion rewards, no credits, no scarcity, no competition between sailors. Nothing else to flag.

---

## Appendix A — implementation order (fits one day)

1. `stageConstants.ts`, `seaLayout.ts` + tests, `stageBus.ts` (typed).
2. `SeaStage.tsx` host + `BootScene` + `SeaScene` base (ocean, dayPhase, boat, wake, reduced-motion).
3. `VoyageScene` (absorbs PartySea math) + Voyage page overlay wiring — highest value first.
4. `ChartScene` + Map page wiring (island taps via bus).
5. `CompassScene` + wind/pennant events.
6. `HarborScene` + `HomecomingScene` (replay, lanterns, lighthouse, arrival).
7. Transitions polish, reduced-motion pass, mobile tier pass, delete/retire PartySea call sites.
