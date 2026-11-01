# Main app: People (settings) — visual & component spec

Status: draft, designed against `docs/ia/main-people-settings.md` (IA §3 labels, §4 hierarchy, §7 states, §11 handoff)
Date: 2026-11-01
Companion: `docs/ux/main-people-settings-ux.md` (UX flows, wireframes, copy table §11). Component **names, anatomy and interaction** follow that document; this file adds the **SCSS layer**: BEM classes, tokens, spacing, states, RTL, breakpoints, motion, and the i18n keys the UX copy table does not cover. Where the two disagree, §12 lists the difference and which one wins.
Sources read: `docs/guides/design-guide.md`, `docs/guides/ATOMIC-DESIGN-SYSTEM.md`, `src/view/components/atomic/README.md`, `packages/shared-styles/src/_mixins.scss`, `packages/shared-styles/src/tokens/_variables.scss`, `src/view/style/{atoms,molecules}`, `src/view/pages/statement/components/host/HostHub.module.scss`

No source code is changed by this document. It is the handoff for the `scss-architect` and `react-firebase-engineer` lanes.

---

## 0. Decisions (IA §11 "yours to decide"), aligned with UX §6

| IA question | Decision | Why |
|---|---|---|
| Collapse / expand | `PeopleSubsection` (molecule, `.people-subsection`): one-row accordion item inside the existing hub card, separated by hairlines. Not card-in-card. | The People card already is a card (`HostHub.module.scss .card`); a second card inside it doubles the chrome at 360 px. |
| Summary line | `Title · value [· same as the group]` in caption colour; count badge at inline-end only when action is pending. On ≤ 600 px the summary wraps under the title instead of truncating to nothing. | One scan line per subsection; the only coloured thing in the row is the number that needs the host's hand. |
| Jump list | `.people-section__jump`: a row of `Chip`s with counts, **desktop only** (≥ 601 px). Below that the headers carry the summaries. The sentence summary ("Open to all · 42 members · 3 waiting") lives in the hub card's `cardDescription` slot while the card is collapsed. | Seven chips at 360 px would repeat the seven headers directly beneath (UX §2). |
| Access picker (five values, 360 px RTL) | `AccessPicker` (molecule, `.access-picker`): `fieldset` of five 48 px radio rows, label + one hint line, whole row tappable, saves on change. | Five Hebrew labels up to 22 characters will not fit a segmented control; a `<select>` hides the choice set. |
| Inheritance idiom | `InheritanceSwitch` (molecule, `.inheritance-switch`): two-segment `SegmentedControl` "Same as the group ✓ \| Change for this question" + one caption "Group is: {value}". The control beneath is read-only while inherited. Hidden on top-level spaces. | Both IA §3 labels are choices, so a two-way control states them side by side. Same component in Who can join, Questions on joining, Stakeholders. |
| Person row, two actions | `PersonRow` (molecule, `.person-row`): avatar 40 px · name + text badges · one meta line · actions at inline-end. **< 601 px**: one `⋯` icon button (44 px) opening a `Sheet` with full-width labelled buttons. **≥ 601 px**: two inline labelled ghost buttons. Waiting rows show Let in / Decline inline at every width. | Members rows have 2–3 possible actions whose labels must be read; the sheet shows them in full. Waiting rows have exactly two short verbs and are the most frequent host action, so they stay one tap. |
| Entry check | In-card counts + one button "Review answers" → `Modal` (`full-screen` ≤ 600 px, `large` above) with status `SegmentedControl` tabs, `SearchBox`, `person-row--review` rows. | Answers are long text; they need the modal's width and scroll. |
| Stakeholders "More" | `.disclosure` text-button directly under the one-line explainer, inside the subsection body. Holds Sample quality (native `select`) and Recalculate. | Count first (IA defect 18). |
| Badges Creator / You / Host | `.person-row__badge` element with modifiers (text badges, `--radius-pill`, caption size). Never colour-only. | A role is a word beside a name, not a count; `.badge` stays for counts. |
| Header waiting badge | `.badge badge--unread badge--small badge--top-right` in a `.badge-container` on the existing people icon; the icon is a link to `?section=people#waiting`. Hidden at 0; "99+" above 99. | Existing atom and position; `--unread` = `--btn-primary` fill with `--white`, per UX 3.11. |
| Empty states | `.empty-state`: lucide icon 24 px in `--text-caption`, one sentence, at most one action. No illustrations in v1. | Design guide: muted, clear CTA. |

---

## 1. Design tokens (no hardcoded values)

Every token below exists in `packages/shared-styles/src/tokens/_variables.scss` or `src/view/style/_variables.scss`.

| Role | Token |
|---|---|
| Surfaces | `--card-default`, `--surface-background`, `--bg-hover`, `--bg-disabled`, `--error-bg` |
| Borders | `--hairline` (= `1px solid var(--border-light)`), `--border-light` |
| Text | `--text-title`, `--text-body`, `--text-caption` (≥ 14 px, non-essential only — 4.1:1), `--text-meta` (4.8:1 — anything essential under 16 px), `--text-disabled`, `--text-error`, `--error-text`, `--text-warning`, `--text-inverse`, `--white` |
| Action | `--btn-primary`, `--btn-primary-hover`, `--btn-primary-text`, `--btn-disabled`, `--btn-disabled-text`, `--text-blue` (≈5.6:1 ink for Host badge text — `--btn-primary` itself is ≈3.4:1 on white, fine for borders, not for 12 px text) |
| Semantic | `--approve-ink` (Let in / Approve on tint), `--agree`, `--text-warning` (waiting, flagged), `--group` (inheritance accent) |
| Spacing (8-pt) | `--space-2xs` 4 · `--space-xs` 8 · `--space-md` 16 · `--space-lg` 24 · `--space-xl` 32 · `--space-2xl` 48. `--space-sm` (12) is the hub card's own inline padding; subsections inherit it and never restate it. |
| Radius | `--radius-xs` 4 · `--radius-sm` 8 (radio rows, inline notes) · `--radius-md` 12 · `--radius-lg` 16 (sheet, modal) · `--radius-pill` / `--radius-chip` 999 (badges, chips, buttons) · `--radius-card` 20 (hub card, untouched) |
| Type | `--font-size-xs` 12 · `--font-size-sm` 14 · `--font-size-md` 16 · `--font-size-lg` 18; `--font-weight-regular / medium / semibold` |
| Motion | `--motion-fast` 120 ms (hover, chips, focus) · `--motion-base` 180 ms (chevron, row leave, sheet) · `--motion-ease` |
| Elevation | `--elevation-3` (sheet, modal); `--shadow-card` (hub card, untouched) |
| Tints | `color-mix(in srgb, var(--token) 12%, transparent)` — the pattern `search-box` already uses. No literal rgba. |

Numbers inside RTL text: `@include stat-number` (`direction: ltr; unicode-bidi: isolate; tabular-nums`) on every count span.

---

## 2. Component inventory

### 2.1 Reuse as-is

| Component | Used for | Notes |
|---|---|---|
| `Button` — `primary`, `secondary`, `approve`, `reject`, `small`, `loading` | Row actions, Show more, Split, Review answers, Add question, modal/sheet footers | At most one `primary` per subsection. Destructive = `reject` variant (text in `--text-error`), never a filled red button. |
| `Chip` (count, `selected`, `aria-pressed`) | Jump strip (desktop); role filter chips | Single-select done by the wrapper. |
| `SegmentedControl` (counts) | `InheritanceSwitch` (2 segments); One / Many answers; Entry-check status tabs | Scrolls horizontally on mobile by itself. |
| `Input` (`type="number"`, `inputmode="numeric"`, `state="error"`) | Stakeholder count, room size, activation threshold, question editor | |
| `SearchBox` | Members search; Review-list search | 16 px input prevents iOS zoom (already). |
| `Sheet` | Row actions on < 601 px | Title = name · role; buttons full width; Cancel last. |
| `Modal` | Question editor (`medium`); Review list (`full-screen` / `large`); confirm dialogs (`small`, `variant="warning"`) | Focus trap, scroll lock, focus return come with it. Initial focus on Cancel in destructive dialogs. |
| `Badge` | Subsection header counts (`--unread`); header waiting badge (`--unread --small --top-right`) | Counts only. |
| `ProfileAvatar` | Person rows | `--medium` (40 px) in lists, default (32 px) in `--compact` rows. Initials fallback exists. |
| `Skeleton` (`--avatar`, `--text`) | Loading rows (3 per list) | Composed by `person-row--skeleton`. |
| `Loader` | 16 px inline spinner in the radio row being saved; modal "Loading member data…" | |
| `Checkbox` | Select all / per-row selection in Waiting | |
| `SectionDivider` (count) | Rooms grouped by answer | Label = answer, count = people in it. |
| `InheritedDemographics` (`--compact`) | Read-only list of the group's questions inside Questions on joining while inherited | Existing molecule, no change. |
| App toast | Undo toasts | **Needs a `toast__action` element** — see §10. |

### 2.2 New — one SCSS block each, React wrapper only

| Level | Block | SCSS | Wrapper |
|---|---|---|---|
| Molecule | `people-subsection` | `src/view/style/molecules/_people-subsection.scss` | `atomic/molecules/PeopleSubsection` |
| Molecule | `access-picker` | `src/view/style/molecules/_access-picker.scss` | `atomic/molecules/AccessPicker` |
| Molecule | `inheritance-switch` | `src/view/style/molecules/_inheritance-switch.scss` | `atomic/molecules/InheritanceSwitch` |
| Molecule | `person-row` | `src/view/style/molecules/_person-row.scss` | `atomic/molecules/PersonRow` |
| Molecule | `filter-chips` | `src/view/style/molecules/_filter-chips.scss` | `atomic/molecules/FilterChips` |
| Molecule | `disclosure` | `src/view/style/molecules/_disclosure.scss` | `atomic/molecules/Disclosure` |
| Molecule | `empty-state` | `src/view/style/molecules/_empty-state.scss` | `atomic/molecules/EmptyState` |
| Atom | `inline-note` | `src/view/style/atoms/_inline-note.scss` | `atomic/atoms/InlineNote` |
| Organism | `people-section` | `src/view/pages/statement/components/host/PeopleSection.module.scss` (CSS module; stacking, gaps, jump strip, live region only) | `PeopleSection.tsx` (rewritten) |

Add each block to `src/view/style/atoms/_index.scss` / `molecules/_index.scss`. Wrappers are `clsx` class builders; no inline styles.

Retired once the organism ships: `MembersSettings`, `AdminsManagement`, `EnhancedMembersManagement`, `EnhancedMemberCard`, `MembershipCard`, the inherit checkbox in `MembershipSettings`, the "Apply to all sub-discussions" toggle + exclude list in `UserDemographicSetting`, the xlsx upload (`SetWaitingListCont.ts` no-op), the three "Get Voters / Non Voters / Evaluators" buttons.

---

## 3. Component specifications

### 3.1 `people-subsection`

**Anatomy.**
```
<section class="people-subsection [--open] [--attention]" id="members">
  <h3 class="people-subsection__heading">
    <button class="people-subsection__header" aria-expanded aria-controls="members-body">
      <span class="people-subsection__title">Members</span>
      <span class="people-subsection__summary">42 · hosts first</span>
      <span class="badge badge--unread">3<span class="visually-hidden"> waiting</span></span>   ← only when action pending
      <svg class="people-subsection__chevron" aria-hidden="true"/>
    </button>
  </h3>
  <div class="people-subsection__body" id="members-body" [hidden]>…</div>
</section>
```

**Layout.**
- Block: `border-block-start: var(--hairline)` (none on `:first-of-type`); no background, radius or shadow — inherits the hub card. `scroll-margin-block-start: var(--space-2xl)` so a hash lands under the sticky statement header.
- Header: `display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-xs); inline-size: 100%; min-block-size: 3rem; padding-block: var(--space-xs); padding-inline: var(--space-sm); margin-inline: calc(-1 * var(--space-sm))` (the negative margin lets the hover band reach the card edge); `border: 0; background: transparent; color: inherit; font: inherit; text-align: start; cursor: pointer`.
- Title: `font-size: var(--font-size-md); font-weight: var(--font-weight-semibold); color: var(--text-title)`.
- Summary: `flex: 1 1 0; min-inline-size: 0; font-size: var(--font-size-sm); color: var(--text-caption); @include truncate`. `@include mobile { flex-basis: 100%; order: 3; white-space: normal }`.
- Chevron: `inline-size: 1.25rem; block-size: 1.25rem; color: var(--text-caption); margin-inline-start: auto; transition: transform var(--motion-base) var(--motion-ease)`. Vertical glyph — no RTL mirror.
- Body: `display: flex; flex-direction: column; gap: var(--space-md); padding-block: 0 var(--space-md)`. Shown/hidden with the `hidden` attribute (no `max-height` animation — bodies are tall and the trick jumps).

**States.** Hover (`@include desktop`): header `background: var(--bg-hover)`. Focus: `outline: 2px solid var(--btn-primary); outline-offset: -2px` (matches `cardToggle`). `--open`: chevron `rotate(180deg)`, `aria-expanded="true"`. `--attention`: badge present; the organism opens the first `--attention` on mount (UX 4.1). Loading: body holds 3 `person-row--skeleton`; summary shows "—". Error: `inline-note--error` with a Retry button as first body child; controls stay. Disabled: never (non-hosts never see the card). Several may be open at once; no auto-close.

**Reduced motion.** `.people-subsection__chevron { transition: none }`.

### 3.2 `.people-section__jump` (organism element, desktop only)

`<nav class="people-section__jump" aria-label="People sections">` of `Chip`s with counts rendered as `<button>` (UX §7: buttons, not links, so no duplicate anchors). Click opens the subsection and scrolls its `h3` to the top. `display: none; @media (min-width: 601px) { display: flex; flex-wrap: wrap; gap: var(--space-xs); padding-block-end: var(--space-xs); border-block-end: var(--hairline) }` (601 px, where the `tablet` mixin starts — not the `desktop` mixin at 1025). Only visible subsections appear. A chip whose subsection is `--attention` gets `className="people-section__jump-chip--attention"`, and the module styles `.people-section__jump-chip--attention .chip__count { color: var(--text-warning); font-weight: var(--font-weight-semibold) }`.

### 3.3 `access-picker`

**Anatomy.**
```
<fieldset class="access-picker [--saving] [--inherited]">
  <legend class="access-picker__legend">Who can join this question</legend>      ← visually-hidden on mobile
  <label class="access-picker__option [--checked] [--busy]">
    <input class="access-picker__input" type="radio" name="access" value="openToAll" aria-describedby="hint-openToAll"/>
    <span class="access-picker__indicator" aria-hidden="true"/>
    <span class="access-picker__text">
      <span class="access-picker__label">Open to all</span>
      <span class="access-picker__hint" id="hint-openToAll">Anyone with the link joins</span>
    </span>
    [<span class="access-picker__spinner">…Loader small…</span>]
  </label> × 5
  <p class="access-picker__link"><a href="?section=live#share">Invite link → Live now</a></p>
</fieldset>
```

**Layout.** Block: `display: flex; flex-direction: column; gap: var(--space-2xs); border: 0; padding: 0; margin: 0; min-inline-size: 0`. Legend: `font-size: var(--font-size-sm); color: var(--text-meta); margin-block-end: var(--space-2xs); @include mobile { @include visually-hidden }`. Option: `display: flex; align-items: flex-start; gap: var(--space-xs); min-block-size: 3rem; padding: var(--space-xs); border: var(--hairline); border-radius: var(--radius-sm); background: var(--card-default); cursor: pointer; transition: background-color var(--motion-fast) var(--motion-ease), border-color var(--motion-fast) var(--motion-ease)`. Indicator: `inline-size: 1.25rem; block-size: 1.25rem; margin-block-start: 0.125rem; border-radius: 50%; border: 2px solid var(--text-caption); flex-shrink: 0`; checked → `border-color: var(--btn-primary); box-shadow: inset 0 0 0 0.3rem var(--btn-primary)` (no extra element). Text: `display: flex; flex-direction: column; gap: var(--space-2xs); min-inline-size: 0`. Label: `font-size: var(--font-size-md); color: var(--text-body)`; checked → `font-weight: var(--font-weight-medium)`. Hint: `font-size: var(--font-size-sm); color: var(--text-meta)`. Link: `font-size: var(--font-size-sm); color: var(--btn-primary); text-decoration: underline; text-underline-offset: 0.15em; margin-block-start: var(--space-xs)`. Input: `@include visually-hidden`; native arrow-key behaviour.

**States.** Hover: `background: var(--bg-hover)`. Focus: `.access-picker__input:focus-visible + .access-picker__indicator { outline: 2px solid var(--btn-primary); outline-offset: 2px }`. `--checked`: `border-color: var(--btn-primary); background: color-mix(in srgb, var(--btn-primary) 8%, transparent)`. `--busy` (the row just tapped): `Loader size="small"` at inline-end (`margin-inline-start: auto`). `--saving` (block): `aria-busy="true"`, other options `pointer-events: none`. Error: `inline-note--error` "Could not save. Try again." under the list; the previous value is re-checked. `--inherited`: options `opacity: 0.6; pointer-events: none`, inputs `disabled`, group value checked; the `InheritanceSwitch` above is the only live control. Choosing a value while inherited flips the switch in the same tap (UX 4.2) — the wrapper does that; visually the picker just leaves `--inherited`.

### 3.4 `inheritance-switch`

**Anatomy.**
```
<div class="inheritance-switch [--inherited]">
  <div class="segmented-control">…Same as the group | Change for this question…</div>
  <p class="inheritance-switch__caption">Group is: Open to all</p>
</div>
```
- Block: `display: flex; flex-direction: column; gap: var(--space-xs); padding: var(--space-xs); border-radius: var(--radius-sm); background: var(--surface-background); border-inline-start: 3px solid var(--group)`.
- The `SegmentedControl` gets `variant="track"`; the short segment label "Change here" is used only when the long one would wrap (UX 3.7), full text in `aria-label`. On ≤ 480 px the control is `inline-size: 100%` and segments `flex: 1 1 0` (add `segmented-control--stretch` modifier to the atom; see §10).
- Caption: `margin: 0; font-size: var(--font-size-sm); color: var(--text-meta)`; the value is wrapped in `<span class="inheritance-switch__value">` with `@include stat-number` when numeric (Stakeholders).
- States: `--inherited` is what dims the control beneath (3.3 `--inherited`, Input `readOnly`, `InheritedDemographics` read-only). Saving: the segmented control `aria-busy`, segments `pointer-events: none`. Error: `inline-note--error`.
- Stakeholders case: while inherited, the `Input` shows the inherited number read-only; the caption says "Group is: 1,200" or "Not set anywhere" (short key, §9).

### 3.5 `person-row`

**Anatomy.**
```
<li class="person-row [--compact] [--busy] [--leaving] [--blocked] [--review] [--skeleton]">
  [<label class="person-row__select"><input type="checkbox" class="checkbox__input"/>…</label>]   ← Waiting only
  <span class="profile-avatar profile-avatar--medium">…</span>
  <div class="person-row__identity">
    <span class="person-row__name" dir="auto">Maya Katz</span>
    <span class="person-row__badge person-row__badge--host">Host</span>
    <span class="person-row__badge person-row__badge--you">You</span>
    <span class="person-row__meta">asked 2 h ago</span>
  </div>
  <div class="person-row__actions">
    <button class="button button--approve button--small button--touch">Let in</button>
    <button class="button button--secondary button--small button--touch">Decline</button>
  </div>
  — or, Members on < 601 px —
  <button class="person-row__more" aria-label="Actions for Maya Katz" aria-haspopup="dialog">⋯</button>
  [<p class="inline-note inline-note--error" role="alert">Failed to update role</p>]
  [<div class="person-row__answers">…</div>]
</li>
```

**Layout (mobile first).**
- Block: `display: grid; grid-template-columns: auto 1fr auto; grid-template-areas: "avatar identity actions" "note note note"; column-gap: var(--space-xs); row-gap: var(--space-2xs); align-items: center; min-block-size: 3.5rem; padding-block: var(--space-xs); border-block-end: var(--hairline)`. With a select checkbox: `grid-template-columns: auto auto 1fr auto` and area `"select avatar identity actions"`.
- Waiting rows at ≤ 600 px: the two inline buttons wrap under the identity: `grid-template-areas: "avatar identity identity" "actions actions actions" "note note note"`, `__actions { justify-content: flex-end }` (logical end — RTL-safe without `[dir]`). Let in is the **inline-start** button of the pair in both directions (UX 3.2).
- `__identity`: `min-inline-size: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2xs) var(--space-xs)`.
- `__name`: `font-size: var(--font-size-md); font-weight: var(--font-weight-medium); color: var(--text-title); @include truncate` on ≤ 600 px; `dir="auto"` for Latin names in Hebrew lists.
- `__meta`: `flex-basis: 100%; font-size: var(--font-size-xs); color: var(--text-meta)`.
- `__badge`: `display: inline-flex; align-items: center; min-block-size: 1.25rem; padding-inline: var(--space-xs); border-radius: var(--radius-pill); border: 1px solid transparent; font-size: var(--font-size-xs); font-weight: var(--font-weight-semibold); line-height: 1; white-space: nowrap`. Variants (UX §6.7, tokens verified): `--creator` fill `--surface-background`, text `--text-body`; `--host` border `--btn-primary`, text `--text-blue`; `--you` border `--text-caption`, text `--text-meta`; `--blocked` fill `--error-bg`, text `--error-text`; `--waiting` border `--text-warning`, text `--text-warning`; review statuses reuse `--waiting` (Waiting review), `--flagged` (= `--waiting` look), `--approved` (border `--agree`, text `--approve-ink`).
- `__actions`: `grid-area: actions; display: flex; gap: var(--space-xs); flex-shrink: 0`. Members rows: `display: none` below 601 px; `__more` is `display: none` from 601 px up.
- `__more`: `@include hit-target; border: 0; border-radius: var(--radius-pill); background: transparent; color: var(--text-meta); cursor: pointer`; hover `background: var(--bg-hover); color: var(--text-body)`; focus ring per mixin. Opens `Sheet` (3.4 of the UX doc).
- Buttons: `small` + **`button--touch`** (new atom modifier, §10) — `button--small` is `height: auto; padding: 0.2rem 0.6rem` (~30 px), under the 44 px floor on touch. Desktop inline buttons may be 30 px tall with 8 px gaps (WCAG 2.5.8 minimum 24 px).

**Action sets** (UX 4.3–4.4): Members — host: Remove host · Block; creator: none; member: Make host · Block; blocked: Unblock. Waiting: Let in · Decline. Review: Approve · Flag · Block (sheet on mobile; three inline on desktop, Block last).

**States.** Hover (`@include desktop`): `background: var(--bg-hover)` with the same negative-margin band as the header. Focus: per control; the row itself is not focusable. `--busy`: `aria-busy`, buttons `disabled`, pressed one `loading`. `--leaving` (optimistic Let in / Decline / Block from a filtered list): `opacity: 0; transition: opacity var(--motion-base) var(--motion-ease)` then removed on `transitionend` (no translate — it would mirror wrongly in RTL; no height collapse — it fights the grid). `--blocked`: `__identity { opacity: 0.7 }` (text stays ≥ 4.5:1 because the badge carries the state). Error: `inline-note--error` in the `note` area; buttons re-enabled; a failed Let in returns the row. `--compact`: avatar 32 px, `padding-block: var(--space-2xs)`, `min-block-size: 2.75rem` (Rooms lists, review rows). `--skeleton`: `.skeleton--avatar` + `.skeleton--text` ×2 (60 % / 30 %), `aria-hidden`. `--review`: `__answers` in the `note` area: `display: grid; grid-template-columns: max-content 1fr; gap: var(--space-2xs) var(--space-xs); font-size: var(--font-size-sm)`; question in `--text-meta`, answer in `--text-body`; more than two answers collapse behind a `disclosure` "Show all answers".

### 3.6 `filter-chips`

`<div class="filter-chips" role="group" aria-label="Filter members">` of `Chip`s; one `selected`; `display: flex; flex-wrap: wrap; gap: var(--space-xs)`. `@include mobile { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin-inline: calc(-1 * var(--space-sm)); padding-inline: var(--space-sm) }` — one scrolling row with the card's own gutter (UX 3.3). Chips: All (default) · Hosts · Members · Waiting · Blocked; on questions a second `filter-chips` group Responded · Did not respond. Counts via `stat-number`; chips get `min-block-size: 2.75rem` on touch through the atom's existing `::after` hit area (verify 44 px; otherwise `chip--touch`). Members body order: `SearchBox` → chips → list → "Show 20 more" (`Button secondary`, full width via module class) → caption "10 of 42" (`inline-note--info`). ≥ 601 px: search and chips share one row (`display: flex; gap: var(--space-xs); align-items: center`; search `flex: 1 1 16rem`).

### 3.7 `disclosure`

`<details class="disclosure"><summary class="disclosure__summary">More<svg class="disclosure__chevron"/></summary><div class="disclosure__body">…</div></details>`. Summary: `display: inline-flex; align-items: center; gap: var(--space-2xs); min-block-size: 2.75rem; padding-inline: var(--space-2xs); color: var(--btn-primary); font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); cursor: pointer; list-style: none` (`::-webkit-details-marker { display: none }`); focus ring per mixin. Body: `padding-block-start: var(--space-xs); display: flex; flex-direction: column; gap: var(--space-md)`. `details[open] .disclosure__chevron { transform: rotate(180deg) }`; the text stays "More" (one key; `aria-expanded` reflects state — the UX doc uses a text button with `aria-expanded`; native `<details>` gives that for free).

### 3.8 `inline-note` (atom)

`<p class="inline-note inline-note--error" role="alert">Could not save. Try again.</p>`; `--success` / `--info` use `role="status"`. Block: `display: flex; align-items: flex-start; gap: var(--space-xs); margin: 0; padding: var(--space-2xs) var(--space-xs); border-radius: var(--radius-sm); font-size: var(--font-size-sm); line-height: 1.4`. `--error`: `color: var(--error-text); background: var(--error-bg)`. `--success`: `color: var(--approve-ink); background: color-mix(in srgb, var(--agree) 12%, transparent)`. `--info`: `color: var(--text-meta); background: transparent; padding-inline: 0`. Optional `__action` slot at inline-end (`margin-inline-start: auto`) for a `Button secondary small` "Retry". No shake animation (settings stay calm). Success notes clear after the toast duration constant in `@/constants/common`; errors stay until the next attempt.

### 3.9 `empty-state`

`<div class="empty-state [--compact]"><svg class="empty-state__icon"/><p class="empty-state__text">Nobody has joined yet</p>[<a class="button button--secondary button--small">Invite link</a>]</div>`. `display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--space-xs); padding-block: var(--space-lg)`. Icon `inline-size: 1.5rem; block-size: 1.5rem; color: var(--text-caption)`. Text `font-size: var(--font-size-md); color: var(--text-body); max-inline-size: 28rem`. `--compact`: `padding-block: var(--space-md)`.

Instances: card-level (nobody joined, CTA Invite link → Live now), Waiting ("Nobody is waiting"), Members ("Nobody has joined yet", CTA Invite link), Questions ("No questions yet", CTA Add question), Review list ("No answers yet"), Rooms ("No rooms yet").

### 3.10 Sheet, confirm dialog, toast (reused; what the SCSS must provide)

- Row-action `Sheet`: title row `avatar 32 px · name · role badge`; buttons stacked `inline-size: 100%`, `gap: var(--space-xs)`; destructive uses `reject`; Cancel last, `secondary`. Padding from the molecule; nothing new.
- Confirm `Modal` (`size="small"`, `variant="warning"`): title, one-line consequence, footer `[Cancel] [Block]` (`reject` variant for the destructive primary); initial focus on Cancel.
- Undo toast: `role="status"`, 6 s, pause on hover/focus, the Undo button first in tab order. **The toast molecule has no action element today** — add `toast__action` (`margin-inline-start: auto; color: inherit; text-decoration: underline; min-block-size: 2.75rem`). §10.

---

## 4. Organism composition

```
.people-section                      (CSS module; display:flex; flex-direction:column; gap: var(--space-md))
├─ __jump                            (≥ 601 px only)
├─ __live                            (visually-hidden aria-live="polite" region: count changes, filter results, save failures)
├─ empty-state                       (members === 0 && waiting === 0; subsections still render)
├─ people-subsection#join            Who can join · {value} [· same as the group]
│    ├─ inheritance-switch           (question, not top-level)
│    └─ access-picker                (+ Invite link → Live now)
├─ people-subsection#waiting         Waiting to join · n   --attention when n > 0; hidden when n = 0 and access ≠ By approval
│    ├─ __toolbar: Checkbox "Select all" · caption "3 waiting"
│    ├─ __bulk-bar (sticky when ≥ 1 selected; replaces toolbar): "2 selected" · [Let in] [Decline]
│    ├─ ul > person-row (select + Let in/Decline inline)
│    └─ empty-state--compact
├─ people-subsection#members         Members · n
│    ├─ search-box + filter-chips (+ Responded/Did not respond on questions)
│    ├─ ul > person-row (hosts first, creator top, alphabetical; Blocked sink to bottom under All)
│    ├─ Button "Show 20 more" · inline-note--info "10 of 42" · 3 skeleton rows while loading more
│    └─ empty-state--compact / inline-note--error "Could not load members." + Retry
├─ people-subsection#questions       Questions on joining · n [· same as the group]
│    ├─ inheritance-switch           (question, not top-level) → when inherited: inherited-demographics --compact
│    ├─ ol > question rows: text · type meta · [Edit] (secondary small) ; ≤ 10, no search
│    ├─ Button "Add question" (primary small) → Modal medium
│    └─ empty-state--compact
├─ people-subsection#entry-check     Entry check · n to review   --attention when n > 0; hidden without questions
│    ├─ __status-row: four person-row__badge-style counts (Waiting review 4 · Flagged 1 · Approved 30 · Blocked 0)
│    └─ Button "Review answers" (primary small) → Modal (full-screen ≤ 600 / large): segmented-control tabs · search-box · ul > person-row--review --compact
├─ people-subsection#stakeholders    Stakeholders · 1,200 [· same as the group]
│    ├─ inheritance-switch           (question, not top-level)
│    ├─ Input number "Number of stakeholders" (saves on blur) · inline-note --success "Saved" / --error
│    ├─ p.hint "How many people this decision concerns. Used for confidence."
│    └─ disclosure "More": native select "Sample quality" (styled with input-base) · Button "Recalculate" (secondary small, loading, label → "Recalculating…") · inline-note result
└─ people-subsection#joining         Joining answers & rooms   (question only)
     ├─ Toggle "Joining answers" + hint         off → nothing else rendered
     ├─ row "Each person joins" · segmented-control One | Many
     ├─ Toggle small "Join form" · Toggle small "Conditional joining" · Input number "Activation threshold"
     ├─ Input number "Room size" · Button "Split into rooms" (primary small, loading → "Splitting…") · inline-note --error
     └─ "Rooms created": per answer → section-divider (label, count) → ul > person-row--compact (no actions)
```

Rhythm: `--space-md` (16) between blocks inside a body; `--space-xs` (8) inside rows and toolbars; `--space-2xs` (4) between a label and its hint or badge. The hub root caps width at `56rem`; rows span it.

Hash handling (UX 4.1) is the organism's effect: open the subsection, `scrollIntoView({ block: 'start' })` on the `h3`, focus the header button; `history.replaceState` for the hash so Back still works through `?section=people`.

---

## 5. Responsive behaviour (mixin breakpoints: 480 / 600 / 1024)

| Range | Behaviour |
|---|---|
| ≤ 480 px | Inheritance segments stretch full width (`segmented-control--stretch`); access-picker legend visually hidden; summary under title; Waiting buttons on their own line; Members rows use `⋯` → Sheet; review modal `full-screen`. |
| ≤ 600 px | Same; filter chips one scrolling row; jump strip hidden; no hover styles. Every tap target ≥ 44 px (`button--touch`, `hit-target`, chip hit area). |
| 601–1024 px | Jump strip visible; search + chips on one row; Members rows show two inline ghost buttons; summary inline with title; review modal `large`. |
| ≥ 1025 px | Hover bands on headers and rows; `__meta` ("Joined 3 days ago") visible on Members rows (hidden below with `display: none` under `tablet-and-below`). |

The UX doc draws desktop at ≥ 901 px; the SCSS uses the system mixins (601 / 1025) — the 901 px is a drawing width, not a breakpoint.

No horizontal scroll at 200 % zoom: text cells `min-inline-size: 0`, action groups `flex-wrap: wrap`, only the chip row scrolls on purpose.

---

## 6. RTL rules

- Logical properties only in every new block: `margin-inline`, `padding-inline`, `inset-inline-start`, `border-inline-start`, `inline-size`, `block-size`, `text-align: start`. Zero `left` / `right` / `[dir='rtl']` rules.
- Action alignment via `justify-content: flex-end` / `margin-inline-start: auto`; the inline-start button of a pair is the primary (Let in), so it sits on the right in Hebrew (UX 3.2).
- Counts: `@include stat-number` on `.badge`, `.chip__count`, `.people-subsection__summary` numbers (the wrapper builds the summary from parts so each number is its own span), `.inheritance-switch__value`.
- Names: `dir="auto"` on `.person-row__name`.
- Chevrons are vertical; the `⋯` glyph is symmetric; the inheritance accent is `border-inline-start`, so it sits on the right in Hebrew. `Toggle`, `SegmentedControl`, `Modal`, `Sheet`, `.badge--top-right` already handle RTL.

---

## 7. Reduced motion

```scss
@media (prefers-reduced-motion: reduce) {
  .people-subsection__chevron,
  .disclosure__chevron,
  .access-picker__option,
  .person-row,
  .person-row__more { transition: none; }
  .person-row--leaving { display: none; }   // leave instantly
}
```
Skeleton shimmer already stops under the same query; `badge--pulse` is not used in People.

---

## 8. Accessibility checklist (WCAG 2.2 AA; extends UX §7)

- Structure as UX §7: `h3 > button[aria-expanded][aria-controls]`; `ul > li`; `fieldset > legend + radio` with `aria-describedby` hints; `div[role=group][aria-label]` chips with `aria-pressed`.
- Count badges always carry a visually-hidden noun ("3 waiting to join"); never a bare number.
- One `aria-live="polite"` region in the organism; row errors `role="alert"`; toasts `role="status"`.
- Focus after a row leaves: next row's first control, else the subsection header. Modal/Sheet return focus to the opener (molecules do this).
- Contrast: all inks ≥ 4.5:1 on `--card-default` (`--text-blue`, `--error-text`, `--approve-ink`, `--text-meta`, but **not** `--text-warning` — #ef7550 on white is ≈2.9:1, so the waiting / flagged badge text gets a darker `--warning-ink`, see §10). `--text-caption` only at ≥ 14 px for non-essential captions.
- Targets ≥ 44 px on touch; ≥ 24 px with 8 px spacing on desktop inline buttons.
- High-contrast theme: `--text-meta` resolves to `--text-caption-contrast` already; `--approve-ink` has **no** contrast sibling (§10).

---

## 9. i18n — one copy source, plus the keys it lacks

**Single source:** `docs/ux/main-people-settings-ux.md` §11 (EN/HE per IA §3). Do not duplicate it here. Two corrections when implementing:

1. Interpolation: the project uses `{{count}}`-style placeholders (see `"Recalculated indices for {{count}} options"` in `en.json`), not `{n}` / `{name}`. Rewrite every placeholder in the UX table as `{{name}}`, `{{count}}`, `{{value}}`, `{{time}}`, `{{shown}}` / `{{total}}`.
2. `Not set anywhere` does **not** exist as a short key — the existing keys are full sentences ("Not set anywhere — scores stay uncorrected…"). Add `people.notSetAnywhere` below.

Keys this design needs that the UX table does not have (add to all 7 files; AR/DE/ES/FA/NL get the EN value until translated):

| Key | EN | HE | Where |
|---|---|---|---|
| `people.sections` | People sections | חלקי אנשים | jump strip `aria-label` |
| `people.filterMembers` | Filter members | סינון חברים/ות | chips `aria-label` |
| `people.actionsFor` | Actions for {{name}} | פעולות עבור {{name}} | `⋯` `aria-label` |
| `people.role.waiting` | Waiting | ממתין/ה | row badge |
| `people.waitingCount` | {{count}} waiting to join | {{count}} ממתינים/ות לאישור | badge hidden text, live region |
| `people.toReview` | {{count}} to review | {{count}} לבדיקה | Entry check summary |
| `people.flag` | Flag | סימון | review row action |
| `people.showAllAnswers` | Show all answers | הצגת כל התשובות | review row disclosure |
| `people.entry.empty` | No answers yet | אין תשובות עדיין | review modal |
| `people.rooms.empty` | No rooms yet | אין חדרים עדיין | rooms block |
| `people.rooms.inRoom` | {{count}} in this room | {{count}} בחדר | section-divider count hidden text |
| `people.rooms.splitFailed` | Could not split into rooms | החלוקה לחדרים נכשלה | split error |
| `people.notSetAnywhere` | Not set anywhere | לא הוגדר בשום מקום | stakeholders caption |
| `people.saved` | Saved | נשמר | stakeholder input success |
| `people.summary.members` | {{count}} members | {{count}} חברים/ות | card description, header summary |
| `people.summary.waiting` | {{count}} waiting | {{count}} ממתינים/ות | card description |
| `people.summary.hosts` | {{count}} hosts | {{count}} מארחים/ות | header summary |
| `people.summary.questions` | {{count}} questions | {{count}} שאלות | header summary |
| `people.summary.toReview` | {{count}} to review | {{count}} לבדיקה | header summary |
| `people.empty.inviteHint` | Share the invite link to get people in. | שתפו את קישור ההזמנה כדי לצרף אנשים. | card-level empty state |
| `people.activationThreshold` | Activation threshold | סף הפעלה | joining block (if no existing key fits) |
| `host.peopleDesc` (rewrite existing) | Who can join, who is waiting, hosts, questions on joining, entry check, stakeholders, rooms | מי יכול להצטרף, ממתינים, מארחים/ות, שאלות בהצטרפות, בדיקת כניסה, בעלי עניין, חדרים | hub card (retires "מנחים", "חדרי דיון") |
| `Creator` (HE value change) | Creator | יוצר/ת | IA §3 gender note |

Existing keys reused unchanged: `host.people`, `host.people.stakeholders`, `host.title`, `Rooms`, `No questions yet`, `Failed to update role`, `Recalculation failed`, `Number of stakeholders`, `Approve`, `Cancel`, `Save`, `Split`, `Join form`, `Conditional joining`, `Retry`.

Retired strings/keys (IA §3; grep before deleting): "Inherit from parent group", "Banned users", "Invite", "Review Members", "Member Management", "total members", "Ban member", "Unban member", "Set specific access level for this statement", "Inherited access level", the five access tooltips, "Approve All", "Deny All", "Load More", "Admins", "Members & Access", "Membership Settings", "Member Validation", "Member Information", "Survey", "Option Rooms", "Breakout Rooms", "Enable Joining Options", "Join Behavior", "Room size for splitting", "Waiting List" (header `aria-label` moves to `people.waitingCount`).

---

## 10. Design-system gaps (propose in the same PR; do not patch silently)

1. **`button--touch`** modifier on the Button atom: `@include mobile { min-block-size: 2.75rem }`. `button--small` is ~30 px (`height: auto; padding: 0.2rem 0.6rem`, `_button.scss` line 224) — below the 44 px floor for row actions on phones.
2. **`segmented-control--stretch`**: `inline-size: 100%; .segmented-control__segment { flex: 1 1 0 }` for the two-segment inheritance switch at ≤ 480 px. The atom also hardcodes `#fff` and `rgba(0,0,0,0.12)` — swap for `--btn-primary-text` and `--elevation-1` while there.
3. **`toast__action`** element on the toast molecule for Undo (none exists).
4. **`--approve-ink` has no high-contrast sibling** in `_variables-contrast.scss`; add `--approve-ink: var(--text-success-contrast)` (#008f75).
5. **`--text-warning` (#ef7550) is ≈2.9:1 on white** — not enough for 12 px badge text. Add `--warning-ink` (≥ 4.5:1, e.g. the darker of the existing warning scale, plus a `-contrast` sibling) and use it for the Waiting / Flagged badge text; keep `--text-warning` for the border.
6. **`.badge` has no outlined variant** — fine (counts only); role words live in `person-row__badge`. Later: fold `person-row__badge` and `inherited-demographics__source-badge` (hand-rolled rgba tints) into one `tag` atom.
7. **`.inherited-demographics` hardcodes `rgba(95,136,229,0.04)` etc.; `.section-divider` falls back to `#777`/`#999`** — log for the scss-architect lane; out of scope here.
8. **No generic `inline-note`, `empty-state`, `disclosure` exist** although the design guide describes empty and error states — these three are generic molecules/atoms, not People-specific, and belong in `src/view/style/`.

---

## 11. Handoff notes

- Build order: `inline-note` → `button--touch`, `segmented-control--stretch`, `toast__action`, tokens (§10) → `people-subsection`, `access-picker`, `inheritance-switch`, `person-row`, `filter-chips`, `disclosure`, `empty-state` → organism `PeopleSection` + `.module.scss` → delete retired components → `FORM_COMPOSITION` guard (`settings/__tests__/duplicateControls.test.ts`) lists `PeopleSection` once; the legacy page renders the same `PeopleSection`.
- Tests: each wrapper gets `__tests__/` asserting class names per prop and `aria-*` per state, plus an RTL render (`dir="rtl"`) asserting no `left`/`right` inline styles. Organism composition test: group renders Who can join · Waiting (conditional) · Members · Questions · Entry check (conditional) · Stakeholders; question adds Joining; `#waiting` deep link opens and focuses the header; default-open rule (UX 4.1).
- Phasing follows UX §9; nothing here changes `@freedi/shared-types`.

---

## 12. Alignment with `main-people-settings-ux.md` — differences and which wins

| Topic | UX doc | This doc | Resolution |
|---|---|---|---|
| Desktop breakpoint | ≥ 901 px in frames | mixins 601 / 1025 | SCSS uses the mixins; 901 is a drawing width. |
| Jump strip chips | buttons (no duplicate anchors) | first draft had `<a href>` | **UX wins**: buttons. `Chip` needs no `href` prop. |
| "More" disclosure | text button with `aria-expanded` | native `<details>` | **This doc**: `<details>` gives the same semantics for free and no state in React. Label stays "More". |
| Row leave animation | 150 ms fade | `--motion-base` 180 ms | **This doc**: tokens only; 180 ms is the nearest token. |
| Waiting / Flagged badge ink | `--text-warning` | `--warning-ink` (new) | **This doc**: ≈2.9:1 fails AA at 12 px (§10.5). |
| Host badge text | `--btn-primary` | `--text-blue` | **This doc**: ≈3.4:1 fails AA at 12 px; border keeps `--btn-primary`. |
| Placeholders | `{n}`, `{name}` | `{{count}}`, `{{name}}` | **This doc**: project convention (§9). |
| "Not set anywhere" | reused as existing | new short key | **This doc**: the existing keys are long sentences. |
| Empty-state icon | 24 px | 24 px (first draft said 48) | **UX wins**: 24 px. |
| Header waiting badge colour | `--btn-primary` | first draft `badge--warning` | **UX wins**: `badge--unread`. |
| Mobile Members actions | `⋯` → Sheet | first draft inline wrapped buttons | **UX wins**: Sheet; Waiting rows stay inline. |
| All chip | present, default | first draft none | **UX wins**. |
| Inheritance control | 2-segment control | first draft Toggle | **UX wins**: both IA labels are choices. |
