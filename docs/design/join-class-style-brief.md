# join-class: visual restyle brief (for Claude Design)

Goal: make join-class more beautiful **without changing what it does**. Labels, flows, screens and
IA stay as they are. This brief is the visual layer only.

## 1. The app in one paragraph
join-class (jc-wizcol.web.app) runs a hybrid classroom lesson: a teacher moves the class through
fixed steps (Opening → Side → Tables → Table talk → Proposals → Vote → Summary). The students sit at
physical tables with their phones, and a projector shows the room the one thing it needs now. It is
WizCol's classroom product (logo: `apps/join-class/src/components/BrandLogo.ts`).

## 2. Who looks at it, and where
| Surface | Who | Device | What matters |
|---|---|---|---|
| Student | grades 7–9 | cheap Android phone, 375 px, slow 4G, often outdoors light | one job per screen, big tap targets, calm, feels like theirs (not a school form) |
| Teacher console | teacher | laptop at the front, sometimes their phone | scan every table at a glance, move the class in one tap, never lost |
| Projector | the whole room | 1920×1080, seen from the back row (~8 m) | huge type, high contrast, one message, readable in a lit room |

## 3. What feels wrong today
<!-- Tal to fill in: which screens look worst, what bothers you (too plain? too beige? cramped? the
teacher console busy? the projector flat?). Screenshots are in the pack (§6). -->
_TBD (Tal)_

## 4. Direction
<!-- Tal to fill in: keep "Civic warmth" (paper, ink, terracotta, teal, indigo) and refine it, or a
new direction? Any apps or sites whose look you like? Words for the mood (e.g. warm, playful,
serious, bold)? -->
_TBD (Tal)_

## 5. Hard constraints (non-negotiable)
- **Visual layer only.** No new screens, labels, steps or controls. Every BEM class name already in
  the SCSS keeps its meaning. The Mithril views should not need to change.
- **Tech:** Mithril + **global BEM SCSS** (not React, not CSS modules, not Tailwind). Deliver
  **design tokens** (one `:root` block) and **component specs in BEM**, not framework code.
- **Tokens only.** Every colour, space, radius, shadow and duration is a CSS variable. Keep the
  existing token *names* where they exist (`apps/join-class/src/styles/_tokens.scss`). Change values
  and add new tokens; don't build a parallel system.
- **Dark mode** and **high contrast** (`[data-high-contrast]`, `prefers-contrast: more`, the
  accessibility widget) keep working. Projector video letterbox stays black.
- **WCAG AA:** body text ≥ 4.5:1, large text and non-text UI ≥ 3:1. Colour is never the only cue.
- **RTL first.** Hebrew is the main locale, plus Arabic (RTL) and English (LTR). Everything mirrors,
  using logical properties (`inline-start/end`) only.
- **Performance:** at most one self-hosted variable font (today Assistant, 400–600, Hebrew + Latin
  subsets). No background images, no heavy illustration, no icon font. Inline SVG icons are fine.
- **Phone:** controls ≥ 48×48, primary button 56 tall, `--shadow-xs/sm` only, `--max-width` 520 px.
- **Spacing:** 8-point grid. **Motion:** `transform`/`opacity` only, nothing loops, nothing bounces,
  and `prefers-reduced-motion` turns it all off.
- **Projector:** text readable at ~8 m (headline ≥ ~6 vh), a single focal point per step.

## 6. What you get with this brief
1. **The screenshot pack.** Every role at every step of one whole lesson, from `npm run e2e:three`
   (`NN-<step>-<teacher|projector|A|B>.png`). Students at 375×812, the teacher on a laptop, the
   projector at 1920×1080.
2. **The current design files.** `apps/join-class/src/styles/_tokens.scss`, `_fonts.scss` and
   `_components.scss`.
3. **The screen map.** The screen inventory in `docs/ia/agora-classroom.md` §7 and §13.10. The UX
   rules (type scale, spacing, motion, contrast) are in `docs/design/agora-classroom-ux.md` §8–9.

## 7. What we want back
1. **The token set:** one `:root` block, light + dark, with a contrast note on every text/background
   pair.
2. **A component sheet (BEM):** button (primary / secondary / quiet), card, chip, status mark, step
   rail, bottom sheet, countdown / timer, the 5-face rating, vote control, side marks (A / B /
   centre), table card (console).
3. **Mockups**, in Hebrew RTL:
   - Student (375 px): front door, side, table talk (asker), screens-down talk, vote.
   - Teacher (1440 px): console board with tables, vote bar; teacher home.
   - Projector (1920×1080): code / QR gate, results.
4. **Per mockup:** which tokens and BEM blocks it uses, so the port into the SCSS is mechanical.

## 8. How we port it (after the design is approved)
New values go into `_tokens.scss`. Then each `src/styles/*.scss` file is restyled one at a time,
keeping the class names. Then we re-run `e2e:three` and compare old and new screenshots, and run
`npm run check-all` and `npm run perf:gate`. Last is a manual pass in he / ar / en, dark mode, and
on a real projector.
