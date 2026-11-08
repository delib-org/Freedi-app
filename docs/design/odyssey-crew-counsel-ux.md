# Odyssey: crew counsel on the island screen — UX design

Status: draft · Date: 2026-10-15 · Designs against `docs/ia/odyssey-crew-counsel.md` (fixed: order §5, two scopes / one pattern, equal juice, no tallies, nothing before a tap, reactions only in the reveal, labels §3, optional `counsel` field + fallback). Everything below is the part §10 left to UX. Frames are 360 px wide, RTL: the **right edge is the start edge**; `‹` is the chevron of a collapsed line, `▾` of an open one.

## 1. Wireframes (question phase)

**(a) Initial — nothing said yet.** Crew row before the instruction line, every shore carries one collapsed line.
```
┌──────────────────────────────────────────────┐
│          [islet art]   אי 2 מתוך 5            │ header, strip — as today
│                   כותרת האי                   │
│ ▒▒▒▒▒▒▒▒ window onto the sea (26vh) ▒▒▒▒▒▒▒▒ │
├──────────────────────────────────────────────┤ .panel
│                         opening line (italic) │
│                    ⚓ שאלת האי — מודגשת        │ h2
│                                               │
│            📜 להתייעץ עם הצוות על האי          │ caption (14px cream)
│                          הקישו על מלח או מלחית│ hint (12px, 70%)
│  ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐    │ crew row: 5 identical chips
│  │ (●)  ││ (●)  ││ (●)  ││ (●)  ││ (●)  │    │ 40px portrait
│  │ גולדה││ בגין ││ ברנר ││ סולד ││ ז'בוטינסקי│ │ name ≤2 lines, 11px
│  └──────┘└──────┘└──────┘└──────┘└──────┘    │
│                                               │
│      לפניכם 4 חופים. סמנו את יחסכם לכל חוף… │ instruction (as today)
│ ┌───────────────────────────────────────────┐ │ shore card (cyan border, as today)
│ │                      חוף 1: טקסט החוף…    │ │
│ │ ‹                       📜 להתייעץ על חוף 1│ │ collapsed shore counsel line
│ │ [מתנגד/ת] [יכול/ה לחיות עם זה] [תומך/ת]   │ │ attitude buttons (as today)
│ └───────────────────────────────────────────┘ │
│ ┌ חוף 2 … same ─────────────────────────────┐ │
│ ┌ חוף 3 … ┐ ┌ חוף 4 … ┐                     │
│                    📖 יומן קברניט …           │ log, continue — as today
└──────────────────────────────────────────────┘
```

**(b) Island counsel open for one sailor** (tapped גולדה). The row does not move; the card docks under it.
```
│            📜 להתייעץ עם הצוות על האי          │
│  ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐    │
│  │ (●)  ││ (●)  ││ (●)  ││ (●)  ││ (◉)  │    │ ◉ = open: gold ring + gold name
│  │ ז'בו…││ סולד ││ ברנר ││ בגין ││ גולדה│    │ (right-most = first in crew order)
│  └──────┘└──────┘└──────┘└──────┘└──────┘    │
│ ┃┌────────────────────────────────────────┐  │ .counsel-card: gold border + 3px
│ ┃│ ✕          התייעצות על האי · ראש הממשלה │  │   gold start-rule; eyebrow = scope
│ ┃│                            גולדה מאיר  │  │   name (14px bold cream)
│ ┃│   נוטה אל חוף 2: טקסט החוף אליו נוטה…  │  │ lean label (gold) + shore text
│ ┃│  "השאלה שאני שואלת את עצמי כאן היא…"   │  │ line (15px italic)
│ ┃│ 📜 דמות בינה מלאכותית — שחזור משוער, …  │  │ disclaimer (11px, 65%)
│ ┃└────────────────────────────────────────┘  │
│      לפניכם 4 חופים. סמנו את יחסכם לכל חוף… │
```
Silent sailor: the lean and line rows are replaced by the one silent line; the card is otherwise identical (same frame, same eyebrow, same disclaimer).

**(c) A shore's counsel open for one sailor** (shore 2, tapped בגין). The island card above is closed; shores 1/3/4 keep their collapsed line.
```
│ ┌───────────────────────────────────────────┐ │ shore 2
│ │                      חוף 2: טקסט החוף…    │ │
│ │ ▾                       📜 להתייעץ על חוף 2│ │ line open (aria-expanded=true)
│ │  ┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐      │ │ the SAME crew row, same order
│ │  │ (●) ││ (●) ││ (●) ││ (◉) ││ (●) │      │ │
│ │  └─────┘└─────┘└─────┘└─────┘└─────┘      │ │
│ │ ┃┌─────────────────────────────────────┐  │ │ same card component
│ │ ┃│ ✕          התייעצות על החוף · מנהיג  │  │ │ eyebrow says the scope
│ │ ┃│                          מנחם בגין  │  │ │
│ │ ┃│                    נוטה אל החוף הזה │  │ │ lean: here | אל חוף N | silent line
│ │ ┃│ "מה תעשו אם החוף הזה יעלה לכם ב…?"   │  │ │ counsel[island][shore]
│ │ ┃│ 📜 דמות בינה מלאכותית — שחזור משוער… │  │ │
│ │ ┃└─────────────────────────────────────┘  │ │
│ │ [מתנגד/ת] [יכול/ה לחיות עם זה] [תומך/ת]   │ │ buttons pushed down, not moved aside
│ └───────────────────────────────────────────┘ │
```
Fallback (no `counsel` line for this shore): lean row as above, then the island line prefixed by the gold label `על האי כולו:` — once, in this card only.

**(d) After the player marked shore 2** (card still open, unchanged — task b step 3). Only the button changed.
```
│ │ ┃│ 📜 דמות בינה מלאכותית — שחזור משוער… │  │ │ card untouched
│ │ ┃└─────────────────────────────────────┘  │ │
│ │ [מתנגד/ת] [יכול/ה לחיות עם זה] [■תומך/ת■] │ │ active-support (as today)
│ └───────────────────────────────────────────┘ │
```
Nothing else reacts: no sailor brightens or dims, no chip changes, no line appears. A later visit shows "התשובה הקודמת שלך — אפשר לשנות" under the shore text, above the counsel line, exactly as today.

**Reveal phase — "המלחים מגיבים".** The sea's reaction stays first; the crew's comes after it, before the way on:
```
│ ▒▒▒▒▒▒▒▒ sea window (50vh / 34vh) ▒▒▒▒▒▒▒▒ │ game mode (non-game: the ships panel)
│ [ShipCard | standing | hint panel] (as today) │
│ ┌───────────────────────────────────────────┐ │ .counsel-card, static (no ✕, no chips)
│ │                    המלחים מגיבים · על חוף 2│ │ eyebrow + the shore it answers
│ │ (●) גולדה מאיר                             │ │ portrait 28px + name, not a button
│ │ "את החוף הזה הייתי…"                      │ │ ElderRemark line (15px italic)
│ │ 📜 דמות בינה מלאכותית — שחזור משוער, …    │ │ same one disclaimer
│ └───────────────────────────────────────────┘ │
│              [ לאי הבא: … ⚓ ]                 │
```
Omitted entirely when `pickIslandRemark` returns null. Tapping a sailor's ship still opens their `ShipCard`, which gains the same reaction line under its proximity bar (one more paragraph, same disclaimer string).

## 2. The crew row at 320 px, 5 sailors
- Width budget: 320 − 2×20 page − 2×26 panel = 228 px. Five 44 px targets with 4 px gaps need 236, so on ≤480 px the row bleeds `margin-inline: -14px` into the panel padding (the precedent is `.sea-chart`), giving 256 px → **48 px per chip, 4 px gap**. At 360 px (the common phone) chips are 56 px; at ≥480 px the row stops bleeding and chips cap at 72 px, centred.
- Layout: `display: grid; grid-template-columns: repeat(N, 1fr)` — **not** flex-wrap. Equal columns are the equal-juice invariant made structural: no chip can be wider, first, or alone on a row. Never wraps, never scrolls (a scrolled-off fifth sailor is a quieter sailor).
- Chip (one `<button>`): portrait **40 px** circle (gold 0.75 border, elder colour fill, `⚓` fallback — as `.crew-portrait`) stacked over the name; `min-height: 64px` (40 + 4 + two 10 px lines), full column width, so the tap target is ≥48×64. Padding 4 px 2 px, border 1 px gold 0.45, radius 10 px, background `rgba(9,38,62,0.75)` — the app's chip grammar, which already means "tappable" (island-strip stops, inspiration chips).
- Name: 11 px, bold, cream, `line-clamp: 2`, `overflow-wrap: anywhere` (so ז'בוטינסקי breaks rather than overflows at 48 px); the full name always reads in the card header and in the chip's `aria-label`. No role, no years, no 📜 on the chip — the 📜 lives once in the caption. Nothing numbered, nothing ticked, no count.
- Open state: border → `var(--gold-strong)`, `box-shadow: 0 0 0 2px rgba(232,185,88,0.28)` (the existing `--open` ring), name → gold. Hover/focus: border gold 0.8; `:focus-visible` outline 2 px cyan (as `.ship-tag`). That is the only state. Marking a shore changes nothing on any chip.
- "Tap to hear": the caption line `📜 להתייעץ עם הצוות על האי` + one hint `הקישו על מלח או מלחית` under it (12 px, 70 %), shown once at the island row only; the shore rows inherit the meaning from the line that opened them. Kept the hint: the first-island tester has nothing else telling them portraits are buttons.

## 3. The per-shore affordance: one collapsed line that expands into the same crew row
Pattern (spec §4/§5): under each shore's text, one text-button line `📜 להתייעץ על חוף N ‹` (13 px, gold text, 44 px tall, full width, no border — a line, not a card, so four of them read as four quiet options, not four panels). Tapping it opens, inline, the identical `CrewRow`, then a tapped sailor's card, all above the attitude buttons.
Why this and not a sticky crew row that re-targets to the shore in view: a sticky row would (1) steal ~80 px of a 26vh-windowed screen on every scroll, (2) make "which shore am I asking about?" depend on scroll position — invisible state, the one thing a conscience must never have, (3) break keyboard/screen-reader order (the row would be in one DOM place but mean another), and (4) be visible before the player reads the shore, which is the order the IA refuses. Four short lines cost ~44 px each and never say anything until tapped.

## 4. States, motion, accessibility
- **One state object in `Voyage`**, reset by `key={island.statementId}`: `counsel: null | {scope:'island', elderId} | {scope:'shore', stanceId, elderId: string|null}`. Rules: open island sailor → any shore row collapses; open shore N's line → island card closes and shore M's row collapses; tap the open chip again, ✕, or Escape → `elderId: null` (shore row stays open) / `null` (island). Marking an attitude never touches `counsel`. Island change → `null`.
- **Motion**: card enters with `bubbleUpIn`-style 180 ms (opacity 0→1, translateY 4 px→0); a swap between sailors crossfades the content in place (same keyframe, no exit animation — the frame stays, the words change, so the page height barely moves). Shore row expansion: no height animation; it appears (the line and its row are a disclosure, not a drawer). Chip ring: 150 ms border/shadow transition. `prefers-reduced-motion: reduce` → all three `animation: none; transition: none`, instant swaps. No auto-scroll on open: the card docks right under the row the thumb is already on.
- **ARIA**: crew row `role="group" aria-label="הצוות — התייעצות על האי"` / `"הצוות — התייעצות על חוף N"`. Chip: `<button aria-label="{name}" aria-expanded={open} aria-controls={cardId}>` (expanded, not pressed: the chip discloses a card; it does not select the sailor). Shore line: `<button aria-expanded aria-controls={rowId}>`. Card slot: always rendered, `aria-live="polite" aria-atomic="true"`, empty when closed — so a swap is announced ("גולדה מאיר, התייעצות על האי, נוטה אל חוף 2 …"). Card ✕: `aria-label="סגירה"` (as `ShipCard`). The disclaimer is inside the live region, so it is read once per card, after the line.
- **Focus & keyboard**: DOM order = reading order: caption → chips 1…N → card ✕ → instruction → shore 1 text → shore 1 line → (open: chips → ✕) → attitude buttons → shore 2 …. Enter/Space toggle; ArrowLeft/ArrowRight move between chips in a row (roving tabindex, so a row is one Tab stop); Escape closes the open card and returns focus to the chip that opened it; ✕ does the same. Closing a shore line returns focus to the line.
- Crew of 0: the caption, hint and row are replaced by one line `עדיין אין מלחים על הסיפון · להוספת מלחים` (link → `/elders`); shore lines are not rendered. Sailor with no data → silent line in the card (same frame).

## 5. Copy (Hebrew, spec §3 labels only)
| Where | String |
|---|---|
| Island row caption | `📜 להתייעץ עם הצוות על האי` |
| Island row hint | `הקישו על מלח או מלחית` |
| Shore line | `📜 להתייעץ על חוף N` |
| Row aria-label | `הצוות — התייעצות על האי` · `הצוות — התייעצות על חוף N` |
| Card eyebrow | `התייעצות על האי` · `התייעצות על החוף` (+ ` · {role}` when present) |
| Lean, island scope | `נוטה אל חוף N:` + shore text |
| Lean, shore scope | `נוטה אל החוף הזה` · `נוטה אל חוף N` · (silent line below) |
| Silent | `אין לי נטייה מתועדת כאן. כאן אני מקשיב/ה, לא מדבר/ת.` (`SILENT_LINE`, replaces "עמדה מתועדת") |
| Fallback label (shore card, no `counsel` line) | `על האי כולו:` + island line |
| Disclaimer (one string, every card, reveal too) | `📜 דמות בינה מלאכותית — שחזור משוער, לא ציטוט ולא המלצת הצבעה` |
| Close | `סגירה` (aria-label on ✕) |
| No crew | `עדיין אין מלחים על הסיפון · להוספת מלחים` |
| Reveal card eyebrow | `המלחים מגיבים · על חוף N` |
The brief's "נוטה לכאן" is a synonym of the spec's `נוטה אל החוף הזה`; the spec's form is used. The disclaimer replaces both `CrewCounsel.tsx:102` and the `caption` at `Voyage.tsx:444/494`.

## 6. Component map
| Component (file) | Props | Notes |
|---|---|---|
| `CrewRow` (`components/CrewRow.tsx`, NEW) | `crew: OdysseyElder[]; openElderId: string\|null; onToggle(elderId); ariaLabel: string; controlsId: string` | the grid of chips; roving tabindex; identical in both scopes |
| `CounselCard` (`components/CounselCard.tsx`, NEW) | `id; elder; scope: 'island'\|'shore'; lean: {kind:'here'}\|{kind:'shore', number, text}\|{kind:'silent'}; line: string\|null; lineAboutIsland?: boolean; onClose` | eyebrow, name, lean, line, disclaimer; the live-region slot is the parent's |
| `IslandCounsel` (rename of `CrewCounsel.tsx`) | `crew; island; openElderId; onToggle` | caption + hint + `CrewRow` + `CounselCard`; no `<details>`, no count; crew-of-0 line |
| `ShoreCounsel` (`components/ShoreCounsel.tsx`, NEW) | `crew; island; stance; stanceIndex; open: boolean; openElderId; onToggleRow; onToggleElder` | the line + `CrewRow` + `CounselCard`; rendered inside each shore card between text and buttons |
| `CrewReactions` (`components/CrewReactions.tsx`, NEW) | `crew; island; attitudes` | reveal only; `pickIslandRemark`; renders nothing on null |
| `ShipCard` (change) | `+ reaction?: string` | one italic paragraph + disclaimer under the bar, when the ship is a sailor |
| `Voyage.tsx` (change) | — | holds `counsel` state; moves the crew row above the instruction line; mounts `ShoreCounsel` per shore and `CrewReactions` under the ships panel |
| `lib/counsel.ts` (change) | `IslandCounsel` (rename of `ElderCounsel`); `shoreCounsel(elder, island, stance): ShoreCounsel`; `AI_PERSONA_NOTE`; new `SILENT_LINE` | pure, tested; reads `elder.counsel?.[islandId]?.[stanceId]` with the §2 fallback |
CSS (`src/styles.css`, BEM, existing tokens only): `.crew-row`, `.crew-row__chip`, `--open`, `__portrait`, `__name`; `.counsel-card`, `__eyebrow`, `__name`, `__lean`, `__lean-label`, `__line`, `__note`, `__close`; `.shore-counsel__line`, `--open`; `.crew-reactions` = `.counsel-card` + a modifier. Retire `.counsel*` (keep the `.island-strip*` halves of the shared rules). Colours: `--gold-strong`, `--cream`, `--cyan`, the panel gradients and the `rgba(232,185,88,…)` / `rgba(9,38,62,…)` values already in the file. No new Cloud Function; nothing written on consult.

## 7. Handoff to the engineer
1. Crew row = CSS grid of N equal columns, 48 px chips at 320 px via a −14 px bleed on ≤480 px; it never wraps or scrolls — that is the equal-juice invariant in CSS.
2. One `counsel` state object in `Voyage`, keyed by island; one disclosure open across the whole panel (island card, or one shore's row+card), never two.
3. Chips use `aria-expanded`/`aria-controls`, not `aria-pressed`; the card slot is a permanent polite live region so swaps are announced.
4. Card opens *below* the row so the tapped chip never moves; no auto-scroll; 180 ms fade only, nothing under reduced motion.
5. Island vs shore card: the eyebrow names the scope (`התייעצות על האי` / `על החוף`) and the card carries a 3 px gold start-rule; the shore card has the cyan border, so the gold quote-block reads as "a voice inside the shore".
6. Disclaimer = one exported `AI_PERSONA_NOTE`, rendered only inside open cards and the reveal card; it replaces the two current wordings.
7. The island hint ("הקישו על מלח או מלחית") appears once, at the island row only.
8. Reveal: `CrewReactions` sits after the ships panel and before the way-on button; `ShipCard` gets the sailor's reaction line as one paragraph.
9. Copy nit for Tal: the spec's silent line has "כאן … כאן"; implemented verbatim, flagged — one word to cut if he agrees.
10. Order of work: `lib/counsel.ts` + tests → `CrewRow`/`CounselCard` → `IslandCounsel` → `ShoreCounsel` → `Voyage` wiring → `CrewReactions`/`ShipCard` → CSS cleanup.
