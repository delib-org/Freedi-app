# Agora Design Brief — "Era of Lanterns"

Agora is a game, not a form. Every screen must feel like a scene from a
cinematic journey through time. This brief is the contract every phase
builds on; the tokens live in `src/styles/tokens.scss`.

## Art direction

- **Mood**: night-time, painterly, warm light against deep indigo dark.
  Think a hand-painted theater backdrop of a historical city at dusk,
  lit by lanterns.
- **The map is the game**: the student journey is staged on a 2.5D
  illustrated era map (`EraMap` component). Stages are *locations*;
  transitions are *camera moves* (never hard cuts).
- **Ideas are lanterns**: proposals appear as glowing lanterns in the town
  square. Brightness = consensus; color blend = cross-camp support. The
  core bridging mechanic must be *felt* visually, not just scored.

## Palette (tokens)

| Token | Value | Role |
|---|---|---|
| `--bg-page` / `--bg-page-high` | `#141126` / `#241d45` | night sky gradient |
| `--parchment` | `#f4e8cf` | text, paper surfaces |
| `--lantern` / `--lantern-glow` | `#f5b944` / `#ffd882` | primary accent, points, glow |
| `--camp-left` | `#5b7bd6` | royal blue camp |
| `--camp-right` | `#d65b6b` | revolution red camp |
| `--camp-center` | `#9b7bd6` | violet blend (center camp) |

Camp colors are game semantics — never reuse them decoratively.
Cross-camp support blends the two camp colors toward gold.

## Typography

- Display: `--font-display` — era-flavored serif (Suez One / Frank Ruhl
  Libre with Hebrew coverage; webfont self-hosted in the polish phase).
  Used for titles, join codes, anon code-names, scores.
- Body: `--font-body` — system stack, readable at classroom distance.
- Hebrew-first: all layout uses logical properties (`inset-inline-start`,
  `margin-inline`, …); the app boots in RTL.

## Motion

- Durations: `--motion-fast` 150ms (press feedback), `--motion-base` 300ms,
  `--motion-slow` 600ms (marker pop), `--motion-camera` 1200ms (map camera).
- Easing: `--ease-camera` cubic-bezier(0.22, 1, 0.36, 1) for travel;
  `--ease-spring` for playful pops (markers, buttons, points).
- Every animation honors `prefers-reduced-motion` (global kill switch in
  `global.scss`).
- Only `transform` and `opacity` animate — never layout properties.

## Map layer spec (EraMap)

SVG layers back-to-front, all CSS-animatable:

1. Sky gradient + twinkling stars + moon
2. Distant city silhouette (slow parallax)
3. Ground plane (rolling hills)
4. Locations: time portal, observatory, palace (left camp), assembly
   (right camp), the bridge between them, town square (the agora)
5. Idea lanterns (deliberation phase)
6. Participant markers (anonymous, era-styled glow dots)
7. Weather/outcome layer: prosperity lights ↔ smoke and fire (endings)

Renderer is swappable: keep all map drawing behind the `EraMap` component
interface (PixiJS upgrade path if particle counts demand it).

## Voice

Mission language, second person plural, zero bureaucracy: "הכיתה שלכם
נבחרה", "פתיחת מנהרת הזמן", "יוצאים לדרך". Buttons are actions in the
story, not UI verbs ("Open the time tunnel", not "Next").

## Accessibility

- WCAG AA contrast on all text over the night sky (parchment on indigo
  passes; never place `--text-muted` on `--bg-inset`).
- Focus rings: 2px `--lantern-glow`.
- The map is decorative-plus: every game-critical state shown on the map
  must also exist as text (counts, names, stage).
