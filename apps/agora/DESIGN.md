# Agora Design Brief — "Festival Day"

Agora is a game, not a form. Every screen must feel like a scene from a
cinematic journey through time. This brief is the contract every phase
builds on; the tokens live in `src/styles/tokens.scss`.

> Supersedes the original "Era of Lanterns" night theme. The token *names*
> survived the re-theme — `--lantern` still means "primary accent" — so read
> them as roles, not as descriptions of color.

## Art direction

- **Mood**: daylight, playful, painterly. A festival afternoon in a
  historical city: open sky, bright paper, banners. Warmth comes from
  saturation and light, not from darkness with lamps in it.
- **Ownership is the first thing you see**: **blue is mine, orange is a
  classmate's**. That distinction outranks every other use of color — never
  spend blue or orange on decoration.
- **The map is the journey**: `EraMap` stages the class in an illustrated
  2.5D scene. It now appears in the **lobby and the results**; the in-game
  and teacher screens dropped the map strip in favor of the working surface.
  Transitions are *camera moves* (never hard cuts).
- **Ideas are lanterns**: proposals appear as lanterns. Brightness =
  consensus; color blend = cross-camp support. The core bridging mechanic
  must be *felt* visually, not just scored.

## Palette (tokens)

| Token | Value | Role |
|---|---|---|
| `--bg-page` / `--bg-page-high` | `#f4faff` / `#aed9f9` | day sky gradient (page bottom → top) |
| `--parchment` | `#fff8ea` | paper surfaces |
| `--ink` | `#253352` | body text |
| `--lantern` / `--lantern-deep` | `#2b6fd6` / `#164a92` | primary accent = **mine** |
| `--peer` / `--peer-glow` | `#e07714` / `#9c5300` | **a classmate's** |
| `--camp-left` | `#8a52cf` | royal purple camp |
| `--camp-right` | `#14a08f` | teal camp |
| `--camp-center` | `#6f7fb3` | blend (center camp) |

**The `-glow` role is flipped from the night theme.** On a light page,
readable emphasis is *dark*, so every `*-glow` token holds the text-safe dark
shade of its family, not a brighter one. `--lantern-glow` is for text;
`--lantern` is for fills.

Camp colors are game semantics — never reuse them decoratively, and never let
a camp wear blue or orange, which belong to ownership.

## Typography

Two self-hosted Hebrew families (loaded in `src/index.ts` via `@fontsource`,
not a CDN — the PWA precaches them for classroom devices offline).

- **Display** `--font-display` — **Alef**. Titles, buttons, join codes,
  anon code-names, scores.
  **Alef ships only 400 and 700.** Never ask for 500 or 600: the browser will
  synthesize a bold, which smears Hebrew stems. Titles and buttons are 700.
- **Body** `--font-body` — **Assistant** (200–800; 400/600/700 loaded).
  Readable at classroom distance.
- Hebrew-first: all layout uses logical properties (`inset-inline-start`,
  `margin-inline`, …); the app boots in RTL.
- **Tracking is a Latin device.** Positive `letter-spacing` opens up uppercase
  eyebrows, but Hebrew has no case and needs tight letter adjacency, and in
  Arabic it severs cursive joins. Tracked labels are reset under `[dir='rtl']`
  (see the end of `components.scss`). Two deliberate exemptions: join codes,
  which are digits that read better spaced in any script, and the `Agora`
  wordmark, which is Latin whatever the UI language is.

## Buttons — light, not plastic

A button has no bevel and no ledge under it. It has a body and it *emits*.

- Flat single-hue fill. No gradients, no `inset` white speculars, no solid
  `0 3px 0` plinth.
- Depth is a soft halo in the button's **own** hue: each variant sets
  `--btn-glow` and one shared rule derives rest/hover/active from it.
  Light expands on hover, pulls in on press.
- Pressed is `scale(.97)` with a contracting halo — never a squash onto a shelf.
- Pill radius, matching `.delib-nav__item` and `.owner-chip`.
- The primary button carries one sheen sweep on hover. That is the *only*
  decorative motion in the family; keep everything else quiet.

## Motion

- Durations: `--motion-fast` 150ms (press feedback), `--motion-base` 300ms,
  `--motion-slow` 600ms (marker pop, button sheen), `--motion-camera` 1200ms.
- Easing: `--ease-camera` cubic-bezier(0.22, 1, 0.36, 1) for travel;
  `--ease-spring` for playful pops (markers, buttons, points).
- Every animation honors `prefers-reduced-motion` (global kill switch in
  `global.scss`).
- Only `transform` and `opacity` animate — never layout properties.

## Map layer spec (EraMap)

SVG layers back-to-front, all CSS-animatable:

1. Sky gradient + drifting clouds
2. Distant city silhouette (slow parallax)
3. Ground plane (rolling hills)
4. Locations: time portal, observatory, palace (left camp), assembly
   (right camp), the bridge between them, town square (the agora)
5. Idea lanterns (deliberation phase)
6. Participant markers (anonymous, era-styled dots)
7. Weather/outcome layer: festival banners ↔ storm (endings)

Renderer is swappable: keep all map drawing behind the `EraMap` component
interface (PixiJS upgrade path if particle counts demand it).

## Voice

Mission language, second person plural, zero bureaucracy: "הכיתה שלכם
נבחרה", "פתיחת מנהרת הזמן", "יוצאים לדרך". Buttons are actions in the
story, not UI verbs ("Open the time tunnel", not "Next").

## Accessibility

- WCAG AA for all text. On the light page that means **dark ink on light
  surfaces**: use the `*-glow` (dark) shades for colored text, and never place
  `--text-muted` on `--bg-inset`.
- `--peer` orange is a fill and ribbon color only — never small text. Use
  `--peer-glow` when the orange has to be read.
- Focus rings: 2px `--lantern-glow`.
- The map is decorative-plus: every game-critical state shown on the map
  must also exist as text (counts, names, stage).
