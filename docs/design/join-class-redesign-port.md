# Class redesign: port spec (2026-11-23)

Tal approved two new looks for Class (`apps/join-class`) on a Claude Design canvas and asked to
build them into the app. This file is the contract for that port.

- Canvas (private): https://claude.ai/artifact/MwWt8wzuVwS3CSoW1ncCdB
- The approved mockups, as files: `docs/design/class-redesign/*.dc.html`. Each is plain HTML with
  **inline styles: those styles are the values to port** (colours, radii, shadows, sizes, gradients).
  `Student-*.dc.html` = the student "night" game look (phone, 390 px).
  `Teacher-*.dc.html` + the left half of `Main.dc.html` = the teacher "Mulberry" theme (laptop).
  The right half of `Main.dc.html` ("Pop") was dropped. Ignore it.

## 1. What changes, and what must not

| Surface | Routes | Look after the port |
|---|---|---|
| student | `/c/:code`, `/seat/:seatCode`, `/m/:mid` | **night** (dark starry sky, glossy "jelly" controls, Fredoka) |
| teacher | `/`, `/login`, `/t`, `/t/plans/**`, `/t/:mid`, `/t/:mid/plan`, `/t/:mid/registration`, `/t/:mid/table/:n` | **mulberry** (porcelain ground, white cards, hairlines, mulberry primary, Fredoka headings, Assistant body) |
| projector | `/t/:mid/screen` (also what "show here" opens) | **night at room scale** (added 2026-11-23, lane 4): the student look, sized for the back row. Mockups: `Projector-1-Join.dc.html`, `Projector-2-Vote.dc.html`. Until lane 4 lands it keeps today's look. |

- The **solid** look (`<html data-look="solid">`, see `src/lib/lessonLook.ts`) keeps rendering the
  old CSS untouched on every surface. It is the escape hatch.
- Visual layer first. Labels, flows, steps, routes and IA do not change. No new UI strings unless
  section 6 allows it, and then in all 7 locale files.

## 2. Scoping

- `<html data-surface="student|teacher|projector">`, set per route by a small helper
  `src/lib/surface.ts` (same shape as `lib/lessonLook.ts`, with tests). The "show here" projector
  mode switches the attribute to `projector` while it is open and restores it after.
- Every new rule lives under one of two prefixes (define them once, like `$game` in
  `_game-scope.scss`):
  - `$night: ':root:not([data-look="solid"]):not([data-high-contrast])[data-surface="student"]'`
  - `$mulberry: ':root:not([data-look="solid"]):not([data-high-contrast])[data-surface="teacher"]'`
- With `[data-high-contrast]` on, neither look applies: the existing high-contrast rendering stays.
  Under `@media (prefers-contrast: more)` the new looks stay on but must keep text at 7:1 and give
  every control a visible border.
- New files only: `src/styles/night/**` (student lane) and `src/styles/mulberry/**` (teacher lane).
  The existing partials are not edited, except by the foundation lane where this spec says so.
- The teacher overlay must not ship in the student entry bundle: import it from the lazy teacher
  route modules (the front page `/` and `/login` are in the entry, so their small part may be).
- The old game layer (`_game*.scss`, `game-*.scss`) still applies under both new looks. Override
  it where the mockup differs (for example the hard `edge` shadows become jelly lips in night and
  soft shadows in mulberry). Do not delete it: solid and the projector depend on the base files.

## 3. Tokens

Remap the **existing token names** inside each scope first (so every component nobody restyles
still recolours sanely), then add look-specific tokens. Raw hex appears only in these token
blocks; component rules use `var(--…)`.

### Night (student)
| Token | Value | Use |
|---|---|---|
| sky | `linear-gradient(180deg, #170A45 0%, #25197F 40%, #2F3FC4 75%, #3A62E0 100%)` + the star dots in `Student-1-Join.dc.html` | page ground, fixed |
| ground zone | `#1A1670`, ridge `#2A3BB5`, crystals `#3FD8FF` / `#A5F0FF` | bottom action zone |
| text on sky | `#FFFFFF` only | never a pale tint (fails 4.5:1 on the lower sky) |
| card | `linear-gradient(180deg, #FFFFFF, #E6E3FF)`, lip `0 6px 0 #6F66D9`, text `#1E1560`, secondary `#4B4580`, input border `#7A70F0` | reading surfaces |
| panel | `linear-gradient(180deg, #3D2BB0, #24167A)`, frame `3px solid #5FE0FF`, glow `0 0 28px rgba(95,224,255,.45)` | the question |
| primary (orange jelly) | `linear-gradient(180deg, #FFE066, #FFB627 55%, #FF8A1F)`, lip `#B84A00`, text `#4A1A00` | main action, active pill, chosen card |
| secondary (white jelly) | card gradient, lip `#6F66D9`, text `#1E1560` | second action |
| cyan jelly | `linear-gradient(180deg, #8CEBFF, #2FB8FF 60%, #1C86F2)`, lip `#0E4FB0`, ink `#0B2A7A` | language button, table badge |
| blue counter | `linear-gradient(180deg, #3B8CFF, #1E4FD6)`, lip `#122F94` | "N בכיתה" |
| progress | track `#DDE6FF` inset; fill `repeating-linear-gradient(-45deg, #FFD23F 0 7px, #FF9A1F 7px 14px)` | lesson steps bar |
| orbs | magenta `#FFB9F5/#E22BD0/#8B12A8`, cyan `#D4FAFF/#2FC8FF/#1267D6`, orange `#FFF1A8/#FFA51F/#D9580A`, green `#E0FFB8/#5ED12F/#1F8F2E`, violet `#E4D6FF/#9A6BFF/#4B22C9`; face ink `#1A0B4B` | classmates, rating faces, side marks |
| side marks | A = cyan orb (circle) "א"; B = orange-gold rounded square "ב"; middle = violet diamond | identical on every screen; shape carries it, not hue alone |
| radius | 18 inputs, 24 buttons, 28 cards/panels, 999 pills | |
| font | Fredoka 400–700 for everything | |

Night is the same in light and dark OS mode: it must override the `prefers-color-scheme: dark`
token block.

### Mulberry (teacher)
| Token | Value |
|---|---|
| ground `#FAF7FB` · surface `#FFFFFF` · blush `#F4EAF2` · line `#E7DEEA` · control border `#9B8AA3` (3.2:1) · soft border `#CDBFD3` |
| ink `#2A1F3D` · soft ink `#6B6079` |
| primary mulberry `#7B2D6E` (hover `#652459`, pressed `#4F1B45`), white text 8.6:1 |
| ready: sage text `#2F6B55` on `#E4F0EA` · attention: apricot text `#8A4A12` on `#FDEBD8`, solid `#F2A65A` · danger `#A12B3A` on `#FBE9EC` |
| side marks: A `#3D3BF3` circle · B `#FFB020` rounded square · middle = outlined diamond |
| radius 12 controls, 18 cards, 999 pills · shadow `0 1px 2px rgba(42,31,61,.05), 0 8px 24px rgba(42,31,61,.06)` |
| buttons 48 px: primary mulberry; secondary white + 1.5px control border; quiet = mulberry text |
| font: Fredoka 600/700 for page titles, card titles and the lesson's question; Assistant for the rest |

Mulberry dark mode was not designed. Derive one (deep aubergine ground, same hues, AA) so OS dark
mode keeps working, and list it in the report as unreviewed.

## 4. Fonts and performance

- Self-host Fredoka (variable, `wght` 400–700; hebrew, latin, latin-ext subsets) in
  `public/fonts/`, declared in `_fonts.scss` like Assistant. Licence: OFL.
- `scripts/perf-gate.mjs` allows one font family. Raise `ALLOWED_FONT_FAMILIES` to 2 with a comment
  that a student only ever downloads Fredoka (the student surface uses no Assistant text) and a
  teacher downloads both. The gzip budget itself must still pass; do not raise it.
- No background image files. The sky, ridge and stars are CSS gradients or inline SVG.
- Motion: `transform`/`opacity` only, nothing loops, `prefers-reduced-motion` turns it off.

## 5. Non-negotiables (from CLAUDE.md and the old style brief)

WCAG AA (4.5:1 text, 3:1 large text and non-text UI); colour never the only cue; RTL first with
logical properties only; he / ar / en all work; controls at least 48×48 on the phone and the primary
button 56+ tall; BEM class names keep their meaning; no `any`; `logError` for errors; tests for new
TypeScript; files under 500 lines.

## 6. View changes that are allowed

Only these, each small, each with a test where it has logic:

- **Student, Join:** under the "N בכיתה" counter, up to 20 decorative classmate orbs (one per
  student who joined, colours cycling) and one dashed "?" slot. `aria-hidden`, no names, no data
  beyond the count the screen already has.
- **Student, steps:** the header's step meter is drawn as one striped bar filled to n/total.
- **Student, rating faces:** glossy orbs with drawn faces (see `Student-4-Rate.dc.html`). If the
  current images cannot be restyled in CSS, swap to inline SVG faces under the same labels.
- **Teacher, console:** a small "הכיתה" card under the step list (joined count and side counts),
  and "לסיים את הזמן" on a table card whose time ran out. **Only if the view already has the data
  and the action.** Otherwise skip and say so.
- **Teacher, lesson plans:** each plan card lists its games as chips. Same condition.

Anything else the mockups show that the app does not have: skip it and list it in the report.

## 7. Lanes

1. **Foundation** (first, alone): `lib/surface.ts` + tests + route wiring; Fredoka; the two scope
   prefixes and token blocks; empty entry partials for `night/` and `mulberry/` already imported in
   the right places; perf-gate font rule. After it, the app must look exactly as before except for
   token-driven recolouring inside the two surfaces.
2. **Student** (`styles/night/**`, `views/student/**`, `components/StudentFrame.ts`,
   `components/Evaluation.ts`, `components/SideSlider.ts`, student parts of `MainHub.ts`).
3. **Teacher** (`styles/mulberry/**`, `views/teacher/**` except `views/teacher/projector/**`,
   `views/FrontDoor.ts`, the login view).

4. **Projector** (after lane 2, alone): `styles/night-projector/**`, `views/teacher/projector/**`,
   `views/teacher/TeacherProjector.ts`. Scope
   `$night-projector: ':root:not([data-look="solid"]):not([data-high-contrast])[data-surface="projector"]'`.
   It reuses the night tokens (the token block is extended to this scope) and scales the depth
   for the room: lips 12px, panel frames 6px, card radius 48px, headline at least 6vh, nothing
   small. Only two states were drawn (the join gate and the vote results); the other steps
   (opening, side, tables, table talk, proposals against the gate, summary) extend the same
   language. The video letterbox stays black and a QR stays black on white. The teacher never
   sees which side a student chose, and neither does the room beyond what the projector shows
   today: no new data on any screen.

Lanes 2 and 3 run at the same time in the same worktree and must not touch each other's files or
any shared file (`global.scss`, `index.ts`, `_tokens.scss`, `_fonts.scss`, `_components.scss`,
`_game*.scss`, locale files). A lane that needs a shared-file change stops and reports it.

## 8. Done means

`npm run check-all`, `npm test` and `npm run perf:gate` pass in `apps/join-class`; the screens
match the mockups at 375–390 px (student) and 1280–1440 px (teacher); solid look and projector
are unchanged; commits are on `feat/class-redesign` in this worktree. No push, no deploy, no
`git stash`.
