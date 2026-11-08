# Agora: Sticky "My Proposal" Dock — design spec

> **Status: BUILT** (see the "As built" section at the end). Two rules
> changed during implementation on Tal's call — read that section first;
> where it disagrees with the body below, the body is the earlier proposal
> and the "As built" notes are what shipped.


**Branch:** `feat/agora-places-improved` · **App:** `apps/agora` (Mithril, global SCSS, hand-rolled `t()`)
**Problem (user):** the "my proposal" workshop card permanently occupies the Mine step as a big always-expanded card. It should be collapsed by default into a sticky bottom bar and open as an accordion — auto-expanded only when first writing, when new improvement suggestions arrive, or when the student chooses to edit.

**The one design (no menu):** a **Proposal Dock** — a mini-player-style bar (the Spotify "now playing" pattern) docked to the bottom of the screen, directly **above** the existing `delib-nav` tab bar on mobile. Tapping it expands a bottom sheet containing the entire existing `editableProposalCard()` content. The dock is present on **every** deliberation screen where a proposal exists (`mine`, `rate`, `help`, `done`), and it **replaces the `peekMine` full-screen swap**. The metaphor fits the game's "places" grammar: the workshop card stops being a room of its own and becomes **the notebook you carry with you** between places.

---

## 1. The collapsed sticky bar — anatomy & visual spec

New BEM block `proposal-dock` (in `components.scss`, next to `.delib-nav`). The whole bar is ONE `<button>` — the entire strip is the hit target, like `.chat-drawer__head`.

```
.proposal-dock                     position: fixed (see §3); block container
├── button.proposal-dock__bar      the collapsed handle (min-height 56px)
│   ├── (ribbon)                   border-inline-start: 3px solid var(--mine)
│   ├── span.proposal-dock__icon   📘  font-size 1.3rem (same as .my-lantern__icon)
│   ├── .proposal-dock__text       flex column, min-width: 0
│   │   ├── span.proposal-dock__title   t('delib.my_proposal')
│   │   └── span.proposal-dock__sub     ONE line, contextual (below), ellipsis
│   ├── span.proposal-dock__badge  red count — only when openCount > 0
│   └── span.proposal-dock__chevron    the "this opens" tell
├── .proposal-dock__panel          grid 0fr→1fr accordion (always in DOM)
│   └── .proposal-dock__inner      min-height:0; overflow-y:auto (the scroll body)
│       └── existing editableProposalCard() output
└── .proposal-dock__scrim          only while open; rendered as a sibling fixed layer
```

**Bar visual values (all existing tokens):**

| Part | Spec |
|---|---|
| Bar surface | `background: var(--bg-card-solid)`; `border-block-start: 1px solid var(--border-subtle)`; `box-shadow: 0 -4px 20px rgba(37, 51, 82, 0.18)` (same shadow as mobile `.delib-nav`) |
| Ownership cue | `border-inline-start: 3px solid var(--mine)` — the exact RTL-safe ribbon `.my-lantern` already uses. Blue = mine, per the ownership law. |
| Bar padding | `padding: var(--space-sm) var(--space-md)`; `gap: var(--space-sm)`; `min-height: 56px` (≥ 44px touch target with margin) |
| Title | `font-family: var(--font-display)`; `font-weight: 700`; `font-size: var(--font-size-base)`; `color: var(--text-primary)` (12.6:1 on white) |
| Sub line | `font-size: var(--font-size-sm)`; `color: var(--text-muted)` (#5e6f8c = 5.4:1, AA); `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` |
| Badge | copy `.workbench__count` verbatim: `min-width: 20px; height: 20px; background: var(--danger); color: #fff; border-radius: var(--radius-full); font-size: var(--font-size-xs); font-weight: 700`. Notification = danger-red, never a camp color. `aria-hidden="true"` (the sub line says the same thing in words). |
| Chevron | copy the `.chat-drawer__chevron` chip verbatim (28px round chip, `border: 1px solid var(--border-strong)`, gray caret) — **but the caret points UP when closed** (`transform: translateY(2px) rotate(-135deg)` on the `::before`), because this accordion opens upward. Open state rotates the chip 180° so it points down. Vertical caret = direction-free, RTL-safe. |
| Hover/focus | `&:hover, &:focus-visible { background: rgba(37, 90, 150, 0.13); }` (the `.chat-drawer__head` tint); `:focus-visible` outline `2px solid var(--lantern-deep)` offset 2px |

**Why "this opens" is unmistakable — three redundant cues:** (1) the round chevron chip at the inline-end, the exact affordance students already learned on the accepted-ideas drawer; (2) the one-line **peek of the proposal text** in the sub line — visibly truncated text says "there is more under here"; (3) the first expand the student ever sees is *automatic* (fresh feedback opens it, §2), so the motion itself teaches the mechanism — same argument as the `chat-drawer` comment in `chat.scss`.

**Sub line is contextual — strict priority, first match wins** (it is also the SR announcement, §7):

1. `openCount > 0` → `💡 {tCount('delib.dock_new_ideas', openCount)}` — `color: var(--text-primary)`, `font-weight: 600` (this is the actionable state; it must not look muted)
2. unsaved draft (`mineDraft.trim() !== myProposal.statement` and non-empty) → `● {t('delib.dock_unsaved')}` — dot colored `var(--warning)`, text stays `var(--text-primary)` (warning copy never uses the amber itself, per tokens comment)
3. `ratingsMoved > 0` → `📈 {tCount('delib.ratings_moved', ratingsMoved)}` (reuses the existing key; prefix 📉 and append the `bridge_down` fragment exactly as the in-card chip does when `bridgeDelta < 0`)
4. otherwise → first line of `myProposal.statement`, ellipsized, `var(--text-muted)`

**No-proposal state:** the dock does not exist. Lap 1 `writeMode` keeps today's full-screen write layout untouched (§10). The dock is born — collapsed — the moment the first proposal is submitted, with a one-time `translateY(100%) → 0` slide-in over `var(--motion-base) var(--ease-camera)` (none under reduced motion).

---

## 2. Expansion states and rules

New component state in `Deliberation.ts`: `let dockOpen = false;` plus one sessionStorage stamp `agora_<sessionId>_dock_dismissed` (ms timestamp of the last **manual** collapse). `peekMine` is **deleted** (see below).

**Auto-open rules — exhaustive:**

| # | Trigger | Behavior |
|---|---|---|
| R1 | No proposal yet (lap 1) | No dock. Full-screen write mode, unchanged. |
| R2 | **Fresh feedback:** newest *open* suggestion's `createdAt` > `dock_dismissed` stamp | Auto-open, on ANY step, on the redraw where it's detected. The received-suggestions section inside already self-opens (`suggestionsToggle ?? openCount > 0` — no change needed). Fires at most once per newest suggestion: opening does not clear the stamp; only a manual collapse advances it. |
| R3 | **Deep link** — toast/notification `requestMineFocus()` → `goToMine()` | `dockOpen = true; suggestionsToggle = true;` scroll the received section into view inside the sheet; focus per §7. Works identically on every step — no screen swap anymore. |
| R4 | **Manual toggle** — tap the bar, tap the `delib-nav` Mine tab (on rate/help), press Esc inside the sheet, tap the scrim | Toggle. A manual **collapse** writes `dock_dismissed = Date.now()`. A manual open does not touch the stamp. |
| R5 | **Step change** (`setCycle` with `stepChanged`) | Collapse (replaces today's `peekMine = false` reset), then R2 re-evaluates on the new screen — so walking into the workshop with fresh feedback still greets you with it open. |
| R6 | **Flight pin** | While `flightsInAir > 0 || flyingAccepted.size > 0`, every collapse path (R4, R5) is deferred until flights land — same reasoning as the suggestions accordion pin comment at `Deliberation.ts:989`. |
| R7 | Entering `mine` with nothing new | **Stays collapsed.** This is the headline ask. The mine screen body becomes: header, place banner, one hint line `t('delib.dock_hint')` (`p.home-explanation`), and the `to_rating` CTA — a fast pass-through lap. Ratings-moved info lives on the bar sub line and inside the sheet, not on the page. |

**What persists / what resets:**
- `dockOpen` — in-memory only. On refresh the dock starts collapsed and R2 recomputes (fresh feedback reopens it). Collapsed-by-default *is* the feature; do not persist "open".
- `dock_dismissed` — sessionStorage, keyed per session id like `cycleKey`; survives refresh so old feedback can't nag again.
- `mineDraft` — see §10; never lost on collapse.

**On `rate` / `help` / `done`: the dock is present.** Recommendation and why:
1. **It kills `peekMine`, which contradicted the places metaphor.** Today "Mine" from the square swaps the *entire screen* for a clone of the workshop with a "peek" badge — you teleport rooms to glance at your notebook. The sheet lifts the notebook *in the room you're standing in*: scrim-dimmed square behind, workshop sheet in front, one tap back.
2. **R2/R3 must work wherever you are.** Fresh feedback and toast deep-links arrive mid-rate and mid-help; without the dock there, those states need a second, different mechanic.
3. **One mechanism to learn** instead of "accordion on mine, screen-swap elsewhere".
4. Chrome cost on mobile (56px bar + 60px nav ≈ 18% of a small viewport) is the known, accepted cost of the mini-player pattern; it buys a permanently visible feedback badge on the student's own work — the game's core loop.

Consequential simplifications: `delibNav`'s Mine tab keeps its place-grammar role but on rate/help its `onclick` becomes "toggle the dock" (`aria-expanded`/`aria-controls` mirror the bar, §7). `mineActive` = `step ∈ {mine, done} || dockOpen`. The Mine tab's own red badge is **dropped** — two adjacent red counts (tab + bar) for the same fact is noise; the dock badge is the single signal. The "back to square / back to stand" peek CTA branch at `Deliberation.ts:1632-1640` dies with `peekMine`. On `done`, the inline `editableProposalCard` render (line 1865) is removed in favor of the dock.

---

## 3. Interaction with `delib-nav` (highest-risk part)

Today (≤700px): `.delib-nav` is `position: fixed; inset-block-end: 0; z-index: var(--z-header)` with safe-area padding, and `.shell--delib .shell__content { padding-block-end: 96px }`.

**Stacking geometry — mobile (≤700px):**

1. Add a height token to `tokens.scss`: `--delib-nav-h: 60px`. Enforce it: mobile `.delib-nav` gets `box-sizing: border-box; min-height: calc(var(--delib-nav-h) + env(safe-area-inset-bottom, 0px))` (its current padding+content fits inside 60px; the token stops the two fixed elements from drifting apart).
2. `.proposal-dock`: `position: fixed; inset-inline: 0; inset-block-end: calc(var(--delib-nav-h) + env(safe-area-inset-bottom, 0px))`. The dock sits flush on the nav's top edge; the nav keeps sole ownership of the safe-area inset (the dock never pads for it — no double inset).
3. The nav's decorative top edge (`border-block-start: 2px solid var(--mode-accent)`, top radii) stays as-is — the dock's own `border-block-start: 1px solid var(--border-subtle)` separates the two strips. The mode-accent beacon remains the *bottom-most* line of the screen chrome, undisturbed.

**Z-order (existing `--z-*` scale):** page content `10` < scrim `calc(var(--z-header) - 2)` = 48 < `.proposal-dock` `calc(var(--z-header) - 1)` = 49 < `.delib-nav` 50 < splash/`--z-modal` 100. The expanded sheet grows *upward from the dock's fixed bottom edge*, so it never covers the nav — the nav stays visible and tappable while the sheet is open (tapping Others mid-sheet = step change = R5 collapse). The travel splash still covers everything.

**Expanded sheet height:** on the panel's `__inner`: `max-height: calc(85dvh - var(--delib-nav-h) - 56px); overflow-y: auto; overscroll-behavior: contain;` (`dvh` tracks the mobile keyboard/URL-bar). The sheet gets `border-start-start-radius: var(--radius-md); border-start-end-radius: var(--radius-md)` on its top edge when open.

**Content padding fix:** replace the flat 96px rule with:

```scss
@media (max-width: 700px) {
  .shell--delib .shell__content { padding-block-end: 96px; }               // unchanged (no dock)
  .shell--delib.shell--docked .shell__content {
    padding-block-end: calc(var(--delib-nav-h) + 56px + var(--space-lg)
      + env(safe-area-inset-bottom, 0px));                                  // ≈ 140px + inset
  }
}
```

`shell--docked` is added by the view exactly when the dock renders (`myProposal !== undefined`). Desktop `.shell--docked .shell__content` gets `padding-block-end: calc(56px + var(--space-lg))`.

**Inside-the-sheet nesting check:** the workshop card's own accordions (accepted-ideas `chat-drawer`, suggestions/elders `workbench__section`) all animate height *within* the sheet's scroll container — no fixed-position math involved, nothing to change.

---

## 4. Motion

- **Expand/collapse:** the proven `chat-drawer` grid-track trick, verbatim: `__panel { display: grid; grid-template-rows: 0fr; transition: grid-template-rows var(--motion-base) var(--ease-camera); }` → `--open` sets `1fr`. Panel **always in the DOM** (drafts survive, §10; the motion teaches the accordion). Chevron chip rotates 180° over the same `var(--motion-base) var(--ease-camera)`.
- **Scrim:** opacity 0→1 over `var(--motion-fast) ease`.
- **Reduced motion:** extend the existing `@media (prefers-reduced-motion: reduce)` block in `chat.scss`'s style: `transition: none` on `__panel`, `__chevron`, scrim; no dock slide-in.
- **The accept-flight survives:** `flyToAcceptedDrawer` targets `document.querySelector('.chat-drawer__head')`. Accepting is only possible while the sheet is open, so the target is laid-out and on screen; source card and target head share the sheet's scroll context, so the `getBoundingClientRect` delta stays correct. The only new hazard is the sheet folding mid-flight — closed by pin rule R6, which defers *all* collapse paths while `flightsInAir > 0 || flyingAccepted.size > 0`. Reduced-motion flights already no-op (early return in `flyToAcceptedDrawer`).

---

## 5. Desktop vs mobile (breakpoint 700px, the app's existing one)

| | Mobile ≤700px | Desktop >700px |
|---|---|---|
| `delib-nav` | fixed bottom bar (unchanged) | inline tab row under the HUD (unchanged) |
| Dock position | fixed, stacked on nav (§3) | `position: fixed; inset-block-end: 0; inset-inline: 0; margin-inline: auto; max-width: 720px` — same column width as `.shell` (720px), centered, flush to the viewport bottom; top radii `var(--radius-md)`; same shadow |
| Sheet height | `max-height: calc(85dvh - var(--delib-nav-h) - 56px)` | `max-height: 70vh` |
| Scrim | yes | yes (same `var(--bg-overlay)`) — the sheet is an overlay in both worlds; consistency beats subtlety here |
| Mine-tab toggle | duplicate handle (both visible at bottom is mobile-only concern — actually the tab is at top here) | primary benefit: on desktop the tab (top) and dock (bottom) are far apart, so the duplicate handle earns its keep |

On the `done` step (`shell--wide`, 1080px) the dock keeps `max-width: 720px` — the notebook is a column-width object, not a screen-width one.

---

## 6. RTL correctness (he default, ar)

- Every offset in the spec is logical: `inset-inline`, `inset-block-end`, `border-inline-start` (ribbon), `margin-inline-start: auto` (badge+chevron cluster), `padding-inline`, `text-align: start`, `border-start-start-radius`/`border-start-end-radius`.
- Chevron is **vertical** (up/down) — direction-free, same trick as `.workbench__chevron`'s comment. Never a left/right caret.
- The text peek ellipsizes correctly in RTL for free (`overflow: hidden; text-overflow: ellipsis` on a normal flex child with `min-width: 0`) — no `direction` overrides.
- Order in the bar reads start→end: ribbon, 📘, text, badge, chevron — in Hebrew that mirrors automatically; the chevron lands at the far inline-end (left in RTL), matching where `.chat-drawer__chevron` already sits.

---

## 7. Accessibility

- **Semantics:** the bar is `button[type=button]` with `aria-expanded` and `aria-controls="proposal-dock-panel"`. The panel element carries `id="proposal-dock-panel"`. Accessible name = the button's own contents (title + contextual sub line), so a closed dock reads e.g. *"My proposal, 3 new improvement ideas waiting, collapsed"*. Badge and chevron are `aria-hidden="true"`.
- **Hidden-state integrity:** closed panel gets `aria-hidden="true"` **and the `inert` attribute** — the `chat-drawer` precedent stops at `aria-hidden`, but this panel holds a textarea and many buttons; `inert` keeps them out of the tab order while the DOM (and the draft) stays alive.
- **Mine tab as second handle:** on rate/help the tab gets the same `aria-expanded` + `aria-controls`; on mine/done it keeps today's `aria-selected` tab semantics.
- **Focus management:**
  - Manual bar tap → focus **stays on the bar button** (standard disclosure). No auto-focus of the textarea, ever — on mobile it would summon the keyboard over the fresh-opened sheet and hide the feedback the student came for; "edit" is one intentional tap away inside.
  - Deep link (R3, toast "feedback is waiting") → after expansion, move focus to the received-suggestions section's `workbench__head--button` (it is a real button, already focusable) — the announcement then names exactly the thing the toast promised.
  - Esc anywhere inside the sheet → collapse (counts as manual, R4) and return focus to the bar button. Scrim is `aria-hidden` and click-only (Esc is the keyboard path; the scrim button must not enter the tab order).
- **New-suggestion announcement:** wrap `.proposal-dock__sub` in `role="status"` (implicit `aria-live="polite"`) — when the sub line flips to "3 new improvement ideas waiting", SR users hear it without focus moving. Matches the `role="status"` precedent on `helped__rerate-ack`.
- **Contrast (AA, on `--bg-card-solid` white):** title `--text-primary` 12.6:1 ✓; sub `--text-muted` 5.4:1 ✓; badge white-on-`--danger` matches the shipped `delib-nav__badge`/`workbench__count` pattern (bold, ≥14px-equivalent) ✓; chevron caret `--text-secondary` ≈7:1 ✓ (>3:1 graphics minimum); scrim contrast is irrelevant (decorative).
- **Touch target:** the whole 56px × full-width bar is the button; the 28px chevron chip is decoration inside it.

---

## 8. New i18n keys (`src/lib/i18n.ts`, all six languages; en+he below, ar/es/de/nl at implementation)

| Key | English | Hebrew |
|---|---|---|
| `delib.dock_new_ideas` | `{{n}} new improvement ideas waiting` | `{{n}} הצעות שיפור חדשות ממתינות` |
| `delib.dock_new_ideas_one` | `One new improvement idea waiting` | `הצעת שיפור חדשה ממתינה` |
| `delib.dock_unsaved` | `Draft not saved yet` | `הטיוטה עדיין לא נשמרה` |
| `delib.dock_hint` | `Your proposal is in the notebook below — tap it to edit or read feedback.` | `ההצעה שלכם נמצאת במחברת שלמטה — הקישו עליה כדי לערוך או לקרוא משוב.` |
| `delib.dock_close` | `Close my proposal` | `סגירת ההצעה שלי` |

Reused, no changes: `delib.my_proposal`, `delib.ratings_moved(_one)`, `delib.bridge_up`/`bridge_down`, `delib.always_editable` (stays inside the sheet header), `delib.nav_mine`. Plural forms follow the existing `_one` suffix convention `tCount` consumes.

---

## 9. ASCII wireframes

**Mobile, `mine` step, collapsed (nothing new):**
```
┌──────────────────────────────┐
│  [banner art]                │
│  ●●○  🛠️ mine ⚖️ rate 🤝 help │  cycle strip
│  ┌─ place banner: workshop ─┐│
│  └──────────────────────────┘│
│  Your proposal is in the     │  delib.dock_hint
│  notebook below — tap it…    │
│                              │
│  [   Continue to rating   ]  │  primary CTA
│                              │  ← padding-block-end clears both bars
├──────────────────────────────┤
│▌📘 My proposal            ⌃ │  ← proposal-dock (56px)  ▌= blue ribbon
│   "Free tenant farmers an…"  │     sub = text peek, ellipsis
├──────────────────────────────┤
│    📘 Mine     |  👥 Others   │  ← delib-nav (60px + safe area)
└──────────────────────────────┘
```

**Mobile, `rate` step, collapsed with news:**
```
│  ┌─ classmate's proposal ───┐│
│  │ 😠 🙁 😐 🙂 😍             ││  rate card
│  └──────────────────────────┘│
├──────────────────────────────┤
│▌📘 My proposal        (3) ⌃ │  badge = 3 open suggestions
│   💡 3 new improvement ide…  │  sub line, role=status
├──────────────────────────────┤
│    📘 Mine     |  👥 Others   │  (Mine tab badge REMOVED)
└──────────────────────────────┘
```

**Mobile, expanded (any step):**
```
│░░░░░░░░ scrim (tap = close) ░│
│╭────────────────────────────╮│  ← sheet top, radius-md, ≤85dvh
││▌📘 My proposal        (3) ⌄ ││  same bar, chevron flipped down
│├────────────────────────────┤│
││ 📘 My proposal  ✏️ edit any…││  ┐
││ 📈 3 ratings updated…       ││  │ existing
││ [ textarea…              ]  ││  │ editableProposalCard()
││ [    Update proposal     ]  ││  │ verbatim, internal
││ 💡 Adopted ideas (2)      ⌄ ││  │ scroll
││ 💡 Improvements received(3)⌃││  │
││ 🎭 Ask the elders         ⌄ ││  ┘
│╰────────────────────────────╯│
│    📘 Mine     |  👥 Others   │  nav stays visible & tappable
└──────────────────────────────┘
```

**Desktop >700px (collapsed / expanded):** nav is a top tab row; dock is a centered 720px bar flush to the viewport bottom.
```
        ┌────────── 720px column ──────────┐
        │  📘 Mine   👥 Others  (top tabs)  │
        │  …page content…                   │
        │                                   │
   …viewport bottom…                        │
        ╭───────────────────────────────────╮
        │▌📘 My proposal  "Free tenant…" ⌃  │  fixed, margin-inline:auto
        ╰───────────────────────────────────╯
        (expanded: same bar + panel above it, max-height 70vh, over scrim)
```

---

## 10. Edge cases

- **First-time user (writeMode):** untouched. No dock exists; the full-screen editor with `NeedsPeek` and the submit CTA stays exactly as `Deliberation.ts:1600-1609`. On successful submit, `setCycle({ step: 'rate' })` fires as today and the dock slides in, collapsed, on the rate screen — the proposal's text peek in the bar is the continuity proof that "your proposal is safe in here".
- **Unsaved draft must never be lost on collapse.** Three guarantees, all required: (1) the panel is never unmounted — the 0fr grid trick keeps the `<textarea>` and its DOM state alive through every collapse; (2) `mineDraft`/`mineDraftBase` survive independently of DOM as today; (3) NEW: mirror `mineDraft` to sessionStorage (`agora_<sessionId>_mine_draft`) on input and re-seed from it on mount, cleared on successful save — closing the gap where a refresh (not a collapse) ate the draft. The bar's `● Draft not saved yet` sub line (priority 2, §1) makes the state visible while collapsed.
- **Celebration/toast deep-links:** `goToMine()` (registered via `registerMineNavigator`, fired by `Toast.ts` and `notifications.ts` through `requestMineFocus()`) becomes: `dockOpen = true; suggestionsToggle = true;` + focus per §7 — and **no step/peek mutation at all**. `goToHelped()` keeps its step-travel semantics but adds `dockOpen = false` (R5 covers it when the step actually changes; add the explicit reset for the same-step case).
- **Accept-flight vs collapse race:** covered by R6; additionally `pendingAcceptText`/`wovenPending` are plain component state — unaffected by collapse since the panel never unmounts.
- **`done` step:** dock replaces the inline card render (line 1865); `helpedSection` and the "keep helping" CTA stay in the page flow.
- **Splash overlays** (`--z-modal`) and celebration toasts (`--z-toast`) sit above the dock — unchanged.
- **Very long proposals:** bar peek is one ellipsized line; the sheet scrolls internally; the page behind never scrolls horizontally or vertically while the scrim is up (`overscroll-behavior: contain` on `__inner`).
- **Keyboard over the sheet (mobile):** `dvh`-based max-height tracks the visual viewport; the focused textarea stays in view via the sheet's own scroll.
- **Suggestions with no proposal:** impossible — suggestions attach to a proposal; the dock's existence condition (`myProposal !== undefined`) is also the badge's.

---

## Implementation map (for the follow-up PR — no code here beyond signatures)

- `Deliberation.ts`: add `dockOpen`, `dockDismissedKey`; delete `peekMine`/`minePeek` branch (lines 1553-1643 restructure), the peek CTA, and the Mine-tab badge; new `proposalDock(live, myProposal, topic)` wrapping `editableProposalCard()`; `delibNav` Mine-tab toggle wiring; `goToMine` rewrite; R2 check in `view()`; `shell--docked` class.
- `components.scss`: new `.proposal-dock` block (≈90 lines) beside `.delib-nav`; `--delib-nav-h` enforcement; `shell--docked` padding rules; strip the double card frame inside the sheet (`.proposal-dock .my-lantern--workshop { border: none; box-shadow: none; }` — the dock carries the ribbon).
- `tokens.scss`: `--delib-nav-h: 60px`.
- `i18n.ts`: five new keys × six languages.
- QA: `AGORA_LANG=he` emulator walkthrough (per the agora-run-local memory), plus an LTR pass in `en`, reduced-motion pass, and the accept-flight-while-collapsing race.

---

## As built — where the shipped code differs

Scope confirmed as designed: the dock lives on **all** steps and `peekMine`
is deleted. Two rules changed, both on Tal's explicit call.

**1. Fresh feedback never auto-opens the dock (R2 is gone).** Arriving
improvement suggestions surface as the red count on the bar plus the bold
`💡 N new improvement ideas waiting` sub line (a `role="status"` live
region) — and nothing else. The student decides when to look. The
`dock_dismissed` sessionStorage stamp R2 needed went with it: there is
nothing left to watermark. Toast deep-links (`requestMineFocus()`) still
expand, because tapping a toast *is* the student choosing to look.

**2. The first-write reveal is a PEEK, not an opening.** R1's successor
fires once, after the very first proposal is submitted — but that lands the
student on the **square**, one step later, and a modal sheet there would
mean dismissing a card before they can rate anything (this is not
hypothetical: it deadlocked the e2e run). So the intro renders with **no
scrim**, capped at `38dvh`, over a live page, and folds itself away after
3.2s (2s under reduced motion). Reaching into it — any `pointerdown` or
`focusin` — cancels the timer and promotes it to a normal, scrimmed open.
State: `dockIntro` + `dockIntroTimer`, `.proposal-dock--intro`.

**Smaller deltas:**
- `--delib-nav-h` is **68px**, not 60 — the nav's measured natural height.
  `--dock-bar-h` is **76px**, not 56: the bar carries a title *and* a sub
  line. Both were wrong by enough to leave content under the dock.
- The panel's scroll position resets to the top on a fresh open
  (`resetDockScroll`); it used to reopen wherever the last session left it,
  which read as "the sheet lost my proposal".
- The sheet suppresses the card's own `📘 My proposal` header (icon +
  title) — the bar overhead already says it. The `✏️ editable anytime` hint
  stays.
- `.shell--mode-peer .proposal-dock .btn--primary` forces **mine-blue** on
  the Update button. "The way forward wears the colour of the room" is the
  rule for the room; the notebook is mine wherever I'm standing, and an
  orange button on my own proposal contradicts the ownership grammar.
- The collapsed panel gets `inert` as specified — verified: 0 of its 6
  focusables are reachable while folded.
- `place.peek_badge` and `delib.back_to_square` / `delib.back_to_stand` are
  now unused (the peek they belonged to is gone); left in `i18n.ts`.

**Verified** on the emulator at 390×844 (`he`, RTL) and via the full
`scripts/e2e-cycle.mjs`: dock bottom meets nav top exactly (776px), content
padding clears both bars, scrim present when open with the nav still
tappable through it, Esc closes and returns focus to the bar, Mine tab is a
second handle with mirrored `aria-expanded`, and an unsaved draft survives
both a fold and a full reload.
