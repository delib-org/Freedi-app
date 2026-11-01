# Main app: People (settings) — UX design

Status: proposed
Date: 2026-11-01
Designs against: `docs/ia/main-people-settings.md` (IA spec, 2026-11-01). Nothing here changes the IA: the subsection set, order, labels, keys, anchors and states are taken from §3–§7 of that spec. This document decides only what the spec left to UX (§11): the collapse/expand component, the access picker, the person row, the inheritance idiom's visual form, the Stakeholders "More" disclosure, Entry check's container, badges, the header waiting badge, empty states, interaction details, accessibility and the build order.

Code touched later (not by this document): `src/view/pages/statement/components/host/PeopleSection.tsx`, `HostHub.tsx`, `HostHubCard.tsx`, `HostHub.module.scss`, the `settings/components/membership/*`, `membershipSettings/*`, `memberValidation/*`, `UserDemographicSettings/*`, `optionRooms/*`, `QuestionSettings/ConfidenceIndexSettings.tsx`, `view/components/approveMembers/*`, and `packages/shared-i18n/src/languages/{en,he,ar,de,es,fa,nl}.json`.

---

## 1. Design principles for this section

1. **One list, one idiom, one word.** Members is one list. Inheritance is one control. The person who runs the space is "Host / מארח/ת" everywhere (A4 below).
2. **Count before control.** Every subsection header shows its live number ("3 waiting", "42 members", "Stakeholders: 1,200 · same as the group") so a host knows whether to open it. The header *is* the jump list; there is no second list of links to maintain.
3. **Open what needs a hand.** All subsections start collapsed except the first one with something to act on: Waiting to join when n > 0, else Entry check when n > 0, else Who can join on a brand-new space (nobody joined yet), else nothing.
4. **Reversible actions get Undo; irreversible ones get a confirm.** Let in, Decline (single), Make host, Remove host → toast with Undo. Block, bulk Decline, removing your own host rights → confirm dialog that states the consequence.
5. **Nothing the host cannot use.** No control renders unless it does something (xlsx upload leaves until it has a backend; the dead invite route is replaced by a link to Live now).
6. **Phone first, logical properties only.** Every frame below is drawn at 360 px; the desktop variant adds width, not features. `inline-start` / `inline-end` throughout; the chevron, actions column and chip row mirror under `dir="rtl"` for free.

---

## 2. Component inventory (reuse first)

| Need | Use | Notes |
|---|---|---|
| Collapsible subsection with summary | **new** `PeopleSubsection` (molecule, SCSS `_people-subsection.scss`) | Same anatomy as `HostHubCard` one level down: `h3 > button[aria-expanded]`, summary line, count badge, chevron. Anchor `id` = `#join` etc. |
| Jump strip (desktop only) | **new** element of `PeopleSubsection`'s parent: `.people__jump` | Row of `Chip`s with counts; click = open + scroll. Hidden < 601 px (headers already carry the summaries). |
| Inheritance idiom | **new** `InheritanceSwitch` (molecule) built on `SegmentedControl` (2 segments) + one summary line | Reused by Who can join, Questions on joining, Stakeholders. Not rendered on top-level spaces. |
| Access level picker | **new** `AccessPicker` (molecule) = `fieldset` of 5 radio rows | Vertical; one line label + one line hint; saves on change. |
| Role filter chips | `Chip` (atom) with `count`, `selected`, `onClick` | aria-pressed already handled. |
| Search | `SearchBox` (molecule) | Label "Search members", debounce `UI.DEBOUNCE_DELAY`. |
| Person row | **new** `PersonRow` (molecule) replacing `EnhancedMemberCard` + `MembershipCard` | Avatar (`ProfileAvatar`), name, badges, meta, actions. |
| Badges Creator / You / Host | **new** `RoleBadge` element inside `PersonRow` (`.person-row__badge--creator/--you/--host/--blocked`) | Text badges, not colour-only. |
| Row action menu (mobile) | `Sheet` (molecule) | Bottom sheet listing the row's actions with full labels. |
| Toggle (Joining answers master switch, join form, etc.) | `Toggle` (atom) | `label` + `hint`. |
| One / many answers | `SegmentedControl` | 2 segments. |
| Loading | `Skeleton` (atom) | 3 skeleton rows per list. |
| Confirm dialog | `Modal` (molecule) | Title, one-line consequence, Cancel + destructive primary. |
| Undo toast | existing toast (`CreditToast` is credit-specific; use the app toast with an action button) | 6 s, `aria-live="polite"`, action focusable. |
| Entry check review | existing `MemberValidation` modal, re-skinned to `Modal` | Stays a modal (decision §6.6). |
| Empty state | **new** `.people__empty` pattern: lucide icon + one line + one action | No illustration in v1. |

Design tokens used: `--space-3xs … --space-2xl`, `--radius-chip`, `--radius-card`, `--radius-pill`, `--card-default`, `--surface-background`, `--border-light`, `--text-title`, `--text-body`, `--text-caption`, `--btn-primary`, `--agree` (Let in), `--text-danger` / `--error-bg` / `--error-text` (Block, errors), `--warning-background` / `--warning-ink` (Flagged), `--font-size-small`, `--font-weight-semibold`, `--motion-base`, `--motion-ease`.

---

## 3. Wireframes

Conventions: `[ ]` button · `( )` radio · `(•)` selected radio · `[x]` checkbox · `⌄ ⌃` chevron · `⋯` overflow · `●` count badge · `— — —` skeleton. RTL frames are drawn as the eye sees them: text right-aligned, chevron and actions on the left, reading order right→left. Hebrew inside monospace boxes may wrap oddly in some editors; the layout is what matters.

### 3.1 People card, mobile LTR (360 px), host of a **question** with 3 people waiting

```
┌──────────────────────────────────────────────┐
│ ▣  People                                 ⌃  │  HostHubCard header (unchanged)
│    Who can join, waiting, members, hosts…    │
├──────────────────────────────────────────────┤
│                                              │
│  Who can join · Open to all                ⌄ │  #join        (same as the group)
│  ─────────────────────────────────────────── │
│  Waiting to join                      ●3   ⌃ │  #waiting     OPEN (first thing to act on)
│  ┌────────────────────────────────────────┐  │
│  │ [ ] Select all               3 waiting │  │
│  │                                        │  │
│  │ ○ Dana Levi        asked 2 h ago       │  │
│  │   [ Let in ]  [ Decline ]              │  │
│  │ ○ Noam Ben-Ari     asked yesterday     │  │
│  │   [ Let in ]  [ Decline ]              │  │
│  │ ○ Rani Cohen       asked 3 d ago       │  │
│  │   [ Let in ]  [ Decline ]              │  │
│  └────────────────────────────────────────┘  │
│  ─────────────────────────────────────────── │
│  Members · 42                              ⌄ │  #members
│  ─────────────────────────────────────────── │
│  Questions on joining · 2 · same as group  ⌄ │  #questions
│  ─────────────────────────────────────────── │
│  Entry check                          ●5   ⌄ │  #entry-check (only when questions exist)
│  ─────────────────────────────────────────── │
│  Stakeholders · 1,200 · same as the group  ⌄ │  #stakeholders
│  ─────────────────────────────────────────── │
│  Joining answers & rooms · Off             ⌄ │  #joining     (question only)
│                                              │
└──────────────────────────────────────────────┘
```

Header anatomy (one `PeopleSubsection`):

```
│  Title · summary                        ●n  ⌄ │
     │        │                            │   └ chevron, mirrors in RTL
     │        │                            └ count badge only when there is work to do
     │        └ live summary, caption colour, truncates with ellipsis
     └ h3, semibold, text-title
   min-block-size 3rem; whole row is the button; padding-inline var(--space-sm)
```

### 3.2 People card, mobile RTL (360 px), same state, Hebrew

```
┌──────────────────────────────────────────────┐
│  ⌃                                 אנשים  ▣  │
│    …מי יכול להצטרף, ממתינים, חברים, מארחים   │
├──────────────────────────────────────────────┤
│                                              │
│ ⌄                פתוח לכולם · מי יכול להצטרף │  #join
│  ─────────────────────────────────────────── │
│ ⌃   3●                       ממתינים לאישור  │  #waiting   פתוח
│  ┌────────────────────────────────────────┐  │
│  │ 3 ממתינים               לבחור את כולם [ ] │  │
│  │                                        │  │
│  │       לפני שעתיים ביקש/ה      דנה לוי ○ │  │
│  │                  [ לדחות ]  [ לאשר ]   │  │
│  │       אתמול ביקש/ה         נועם בן-ארי ○ │  │
│  │                  [ לדחות ]  [ לאשר ]   │  │
│  │       לפני 3 ימים ביקש/ה     רני כהן ○ │  │
│  │                  [ לדחות ]  [ לאשר ]   │  │
│  └────────────────────────────────────────┘  │
│  ─────────────────────────────────────────── │
│ ⌄                            42 · חברים/ות  │  #members
│  ─────────────────────────────────────────── │
│ ⌄         כמו הקבוצה · 2 · שאלות בהצטרפות   │  #questions
│  ─────────────────────────────────────────── │
│ ⌄   5●                        בדיקת כניסה   │  #entry-check
│  ─────────────────────────────────────────── │
│ ⌄       כמו הקבוצה · 1,200 · בעלי עניין     │  #stakeholders
│  ─────────────────────────────────────────── │
│ ⌄             כבוי · הצטרפות לתשובות וחדרים  │  #joining
│                                              │
└──────────────────────────────────────────────┘
```

RTL notes: the primary action (לאשר / Let in) is the **inline-start** button of the pair in both directions, so it sits on the right in Hebrew; the count badge keeps `unicode-bidi: isolate` so "3 ממתינים" never renders as "ממתינים 3"; the summary separator is a middle dot which is direction-neutral.

### 3.3 Members subsection open, mobile LTR

```
│  Members · 42                              ⌃ │  #members
│  ┌────────────────────────────────────────┐  │
│  │ 🔍 Search members                      │  │  SearchBox, full width
│  │                                        │  │
│  │ ‹ [All 45] [Hosts 3] [Members 39]      │  │  Chip row, horizontal scroll,
│  │   [Waiting 3] [Blocked 0] [Responded…] ›│  │  selected chip = filled
│  │                                        │  │
│  │ (T) Tal Yaron          Creator · You   │  │  no actions on the creator row
│  │     host · joined 3 mo ago             │  │
│  │ ─────────────────────────────────────  │  │
│  │ (M) Maya Katz          Host         ⋯  │  │  ⋯ opens a Sheet (3.4)
│  │     joined 2 mo ago                    │  │
│  │ ─────────────────────────────────────  │  │
│  │ (D) Dana Levi                       ⋯  │  │
│  │     joined 2 h ago                     │  │
│  │ ─────────────────────────────────────  │  │
│  │ (R) Roi Amir           Blocked      ⋯  │  │  row dimmed, badge text "Blocked"
│  │     joined 1 mo ago                    │  │
│  │ …                                      │  │
│  │ [ Show 20 more ]            10 of 42   │  │
│  │                                        │  │
│  │ Invite link → Live now                 │  │  link, not a second control
│  └────────────────────────────────────────┘  │
```

Order: hosts first (creator at the very top), then alphabetical by display name; Blocked sink to the bottom when the All chip is active. Chip counts: Hosts = admin + creator; All = Hosts + Members + Waiting + Blocked (the IA's rule; `unsubscribed` never counted).

### 3.4 Row actions sheet, mobile (opens from ⋯)

```
┌──────────────────────────────────────────────┐
│                   ──                         │
│  (M) Maya Katz · Host                        │
│                                              │
│  [ Remove host ]                             │  secondary, full width
│  [ Block ]                                   │  danger text, full width
│                                              │
│  [ Cancel ]                                  │
└──────────────────────────────────────────────┘
RTL: same sheet, text right-aligned, same button order top→bottom.
```

For a Member the first button is "Make host"; for a Blocked person the sheet has one button, "Unblock". The sheet title repeats name + role so the host never acts on the wrong person.

### 3.5 Desktop LTR (≥ 901 px), card at 56 rem, Members open

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ▣  People                                                                     ⌃  │
│    Who can join, waiting, members, hosts, entry check, stakeholders, rooms       │
├──────────────────────────────────────────────────────────────────────────────────┤
│  [Who can join] [Waiting ●3] [Members 42] [Questions 2] [Entry check ●5]         │  jump strip (sticky
│  [Stakeholders] [Joining & rooms]                                                 │  inside the card)
│  ────────────────────────────────────────────────────────────────────────────── │
│  Who can join · Open to all · same as the group                                ⌄ │
│  ────────────────────────────────────────────────────────────────────────────── │
│  Waiting to join                                                          ●3   ⌄ │
│  ────────────────────────────────────────────────────────────────────────────── │
│  Members · 42                                                                  ⌃ │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ 🔍 Search members                        [All 45][Hosts 3][Members 39]      │ │  search + chips on one line
│  │                                          [Waiting 3][Blocked 0][Responded 31]│ │
│  │                                                                            │ │
│  │ (T) Tal Yaron    Creator · You    host · joined 3 mo ago                   │ │
│  │ (M) Maya Katz    Host             joined 2 mo ago     [Remove host] [Block] │ │  inline ghost buttons
│  │ (D) Dana Levi                     joined 2 h ago      [Make host]   [Block] │ │
│  │ (R) Roi Amir     Blocked          joined 1 mo ago                 [Unblock] │ │
│  │ …                                                                          │ │
│  │ [ Show 20 more ]                                               10 of 42    │ │
│  │ Invite link → Live now                                                     │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│  ────────────────────────────────────────────────────────────────────────────── │
│  Questions on joining · 2 · same as the group                                  ⌄ │
│  Entry check                                                              ●5   ⌄ │
│  Stakeholders · 1,200 · same as the group                                      ⌄ │
│  Joining answers & rooms · Off                                                 ⌄ │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Desktop differences, and nothing else: the jump strip appears (chips with counts; click opens the subsection and scrolls `h3` to the top); search and chips share one row; row actions are inline labelled ghost buttons instead of the ⋯ sheet. Breakpoint for inline actions: ≥ 601 px (the hub's existing `strip` breakpoint); the jump strip: ≥ 601 px as well.

### 3.6 Desktop RTL (≥ 901 px), Who can join open, Hebrew

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  ⌃                                                                     אנשים  ▣  │
├──────────────────────────────────────────────────────────────────────────────────┤
│         [הצטרפות וחדרים] [בעלי עניין] [5● בדיקת כניסה] [2 שאלות] [42 חברים/ות]  │
│                                                      [3● ממתינים] [מי יכול להצטרף] │
│  ────────────────────────────────────────────────────────────────────────────── │
│ ⌃                                                                 מי יכול להצטרף │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                       [ שינוי לשאלה הזו ] [ כמו הקבוצה ✓ ]                 │ │  InheritanceSwitch
│  │                                                                            │ │
│  │                 ‹ נקבע בקבוצה «תקציב השכונה»   ·   פתוח לכולם : כרגע        │ │  read-only summary,
│  │                                                                            │ │  link to the group's People
│  │                            קישור הזמנה ← שידור חי                          │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│ ⌄                                                           3●  ממתינים לאישור  │
│ ⌄                                                                 42 · חברים/ות │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 3.7 Who can join, mobile LTR — overridden state (after "Change for this question")

```
│  Who can join · By approval                ⌃ │  #join
│  ┌────────────────────────────────────────┐  │
│  │ [ Same as the group ] [ Change here ✓ ]│  │  SegmentedControl; hidden on top level
│  │ Group is: Open to all                  │  │  caption; stays visible so the host
│  │                                        │  │  sees what "Same as the group" would give
│  │ Who can join this question             │  │  fieldset legend (visually hidden on mobile
│  │ ( ) Public, no sign-in                 │  │  if space is tight; present for AT)
│  │     Anyone can take part, no account   │  │
│  │ ( ) Open to all                        │  │
│  │     Anyone with the link joins         │  │
│  │ ( ) Signed-in only                     │  │
│  │     Must have an account               │  │
│  │ (•) By approval                        │  │
│  │     You let each person in             │  │
│  │ ( ) Invite only                        │  │
│  │     Only people you invite             │  │
│  │                                        │  │
│  │ Invite link → Live now                 │  │
│  └────────────────────────────────────────┘  │
```

Radio rows: 48 px tall, label + one hint line, whole row tappable. Five values fit a 360 px RTL screen because they stack; no segmented control is wide enough for five Hebrew labels. The segmented control label "Change here" is the short form of `people.changeHere` ("Change for this question") used only when the segment would otherwise wrap; full text in the `aria-label`.

### 3.8 Stakeholders, mobile LTR — inherited, with "More" closed and open

```
│  Stakeholders · 1,200 · same as the group  ⌃ │  #stakeholders
│  ┌────────────────────────────────────────┐  │
│  │ [ Same as the group ✓ ] [ Change here ]│  │
│  │ Number of stakeholders                 │  │
│  │ ┌──────────────────────────────┐       │  │
│  │ │ 1,200   (from the group)     │       │  │  read-only while inherited; placeholder
│  │ └──────────────────────────────┘       │  │  shows the resolved value and its source
│  │ How many people this decision          │  │
│  │ concerns. Used for confidence.         │  │  one line of explainer, not four
│  │                                        │  │
│  │ More ⌄                                 │  │  disclosure, text button
│  └────────────────────────────────────────┘  │

  "More" open:
│  │ More ⌃                                 │  │
│  │ Sample quality                         │  │
│  │ [ Fully self-selected          ⌄ ]     │  │  native select; 5 presets
│  │ [ Recalculate ]  Recalculated for 312  │  │  result line replaces the button's
│  │                  answers · just now    │  │  label while running ("Recalculating…")
```

When "Change here" is chosen the field becomes editable with the inherited number prefilled; saving happens on blur; the header summary drops "same as the group". "Not set anywhere" (existing key) is the placeholder when neither the space nor any parent declares a count.

### 3.9 Questions on joining + Entry check, mobile LTR

```
│  Questions on joining · 2 · same as group  ⌃ │  #questions
│  ┌────────────────────────────────────────┐  │
│  │ [ Same as the group ✓ ] [ Change here ]│  │
│  │ From the group «Neighbourhood budget»: │  │
│  │ 1. Which street do you live on?   view │  │  inherited rows: read-only, "view"
│  │ 2. Age group                      view │  │
│  │                                        │  │
│  │ Edit in the group →                    │  │
│  └────────────────────────────────────────┘  │

  "Change here" (question declares its own; inherited ones can be excluded):
│  │ [ Same as the group ] [ Change here ✓ ]│  │
│  │ 1. Which street…   (from group) [x] ask│  │  checkbox "ask" per inherited question
│  │ 2. Age group       (from group) [ ] ask│  │
│  │ 3. Are you a parent here?    [Edit] ⋯  │  │  own question
│  │ [ + Add question ]                     │  │  opens Question editor modal
│  └────────────────────────────────────────┘  │
│  Entry check                          ●5   ⌃ │  #entry-check
│  ┌────────────────────────────────────────┐  │
│  │ 5 waiting review · 2 flagged · 30 ok   │  │  counts line
│  │ [ Review answers ]                     │  │  opens the Review list modal
│  └────────────────────────────────────────┘  │
```

### 3.10 Joining answers & rooms (question only), mobile LTR

```
│  Joining answers & rooms · On              ⌃ │  #joining
│  ┌────────────────────────────────────────┐  │
│  │ Joining answers                  [●  ] │  │  Toggle; when Off nothing below renders
│  │ People can join an answer they back    │  │
│  │                                        │  │
│  │ Each person joins   [ One ✓ ] [ Many ] │  │  SegmentedControl
│  │ Join form                        [  ●] │  │  Toggle + hint
│  │ Conditional joining              [●  ] │  │
│  │ Activation threshold   [ 5 ] people    │  │  number input, inline
│  │                                        │  │
│  │ Rooms                                  │  │  h4
│  │ Room size   [ − ] 6 [ + ]              │  │  stepper
│  │ [x] Mix across answers (diversity)     │  │
│  │ [ Split into rooms ]                   │  │  primary; disabled until ≥ 2 joined
│  │                                        │  │
│  │ Rooms created · 4                      │  │
│  │ Answer A — Room 1 (6) · Room 2 (5)     │  │  grouped by answer, count per room
│  │ Answer B — Room 3 (6) · Room 4 (4)     │  │
│  └────────────────────────────────────────┘  │
```

### 3.11 Header waiting badge (QuestionHeaderBar / HomeHeader)

```
   LTR:  ┌───┐        RTL:  ┌───┐
         │ 👥 ●3│             │3● 👥│
         └───┘              └───┘
```

Same icon as today; the badge is a `--radius-pill` count in `--btn-primary` with `--text-inverse`, `aria-label="3 waiting to join"`. Tap navigates to `?section=people#waiting` (no modal). Hidden at 0. "99+" above 99 (existing rule).

---

## 4. Interaction details

### 4.1 Subsection accordion

- Controlled by `PeopleSection` (`Set<anchorId>`), mirroring how `HostHub` controls `HostHubCard`. Opening sets `location.hash` with `history.replaceState` (no new entry); the hub's existing `?section=people` keeps browser Back working.
- Deep link `#waiting` etc.: on mount, open that subsection, scroll its `h3` into view with `block: 'start'`, move focus to the `h3 > button`. If the anchor names a hidden subsection (e.g. `#joining` on a group, `#entry-check` with no questions) open nothing and show the card top.
- Default open: the first of [Waiting (n > 0), Entry check (n > 0), Who can join (0 members)] that applies; else none.
- Several may be open at once (a host comparing Waiting and Members). No auto-close.
- Chevron rotates with `var(--motion-base) var(--motion-ease)`; none under `prefers-reduced-motion`.

### 4.2 Who can join

- Radio change saves immediately (`setStatementMembership`). While saving the chosen row shows a 16 px `Loader` at inline-end; on failure the row reverts and an inline error line "Could not save. Try again." appears under the fieldset (replaces today's `console.info`/`logError`-only path).
- Choosing a value while "Same as the group" is active switches the segmented control to "Change for this question" in the same tap (one action, not two). The reverse — tapping "Same as the group" — clears the override at once and shows the toast "Now same as the group · Undo".
- Changing to **By approval** on a space that has members: no confirm (existing members stay). Changing to **Invite only**: no confirm either, but the hint under the radio says "Current members keep access."
- Top-level space: no `InheritanceSwitch`, the picker shows directly.

### 4.3 Waiting to join

- Row: avatar, name, "asked {relative time}", two buttons: **Let in** (`variant="agree"`) and **Decline** (secondary).
- Single Let in / Decline: optimistic — row leaves the list with a 150 ms fade, toast "{name} let in · Undo" / "{name} declined · Undo" for 6 s. Undo re-issues the opposite call. If the call fails the row returns and shows an inline error under its name ("Could not let in. Try again.").
- Bulk: the "Select all" checkbox and per-row checkboxes appear always (not only when every row is selected, which is today's behaviour). As soon as ≥ 1 is selected a sticky action bar replaces the list header: "2 selected · [Let in] [Decline] [Clear]". Bulk Let in: no confirm, one toast "2 let in · Undo". Bulk Decline with n ≥ 2: confirm dialog "Decline 2 people? They can ask to join again." → [Cancel] [Decline 2].
- Empty: "Nobody is waiting" + caption "People who ask to join appear here" — shown only when access = By approval; otherwise the subsection is hidden entirely (IA §7).
- Focus after a single action: next row's Let in button; if the list became empty, the subsection `h3` button.

### 4.4 Members

- Search filters client-side on display name (and email where the host may see it); 300 ms debounce (`UI.DEBOUNCE_DELAY`); result count announced: "12 people match" via `aria-live="polite"`.
- Chips are single-select; All is the default. Waiting chip filters to `Role.waiting` rows **inside Members** with the same Let in / Decline actions as the Waiting subsection (one list, as the IA asks); the Waiting subsection above remains the fast path.
- On questions, add **Responded / Did not respond** chips (evaluations ∪ votes). They combine with the role chips as a second single-select group (`role="group"` each). Counts shown.
- Pagination: first 10, "Show 20 more" button (existing `initialLoadCount` / `loadMoreCount`), "10 of 42" caption. Loading more shows 3 `Skeleton` rows under the list.
- Row actions by role:
  - Creator: none; badges Creator (+ You if self).
  - Host (admin): Remove host · Block.
  - Member: Make host · Block.
  - Waiting: Let in · Decline.
  - Blocked: Unblock.
  - Self (non-creator host): Remove host only, with confirm "Remove your own host rights? You will lose access to Host tools." No Block on self.
- Make host / Remove host: optimistic, badge updates, toast "{name} is now a host · Undo" / "{name} is no longer a host · Undo". Failure reverts and shows the existing `Failed to update role` inline under the row.
- Block: confirm dialog (Modal) — title "Block {name}?", body "They will not be able to see or take part in this space. You can unblock them later." [Cancel] [Block] (danger). After confirming: row moves to the Blocked state (dimmed, badge "Blocked"), toast "{name} blocked · Undo". Engineering must confirm what happens to the person's existing votes and put that sentence in the dialog body if they are removed (IA §9 defect 1 — the host must know which action removes votes).
- Unblock: no confirm, toast with Undo.
- Empty (0 members, 0 waiting): icon + "Nobody has joined yet" + button-link "Invite link → Live now" (navigates to `?section=live`).
- Error loading memberships: inline banner at the top of the list "Could not load members. [Retry]"; search and chips stay rendered.

### 4.5 Questions on joining · Entry check

- Add / Edit open the existing question editor as a `Modal`; on close, focus returns to the button that opened it; the list re-renders without scrolling.
- Delete a question: confirm "Delete this question? Answers already given are kept." [Cancel] [Delete].
- Reordering: not in v1 (lists are < 10 items; drag-and-drop later).
- Entry check subsection shows only counts and one button "Review answers" → the Review list modal (status tabs: Waiting review · Flagged · Approved · Blocked; search by name). Status change inside the modal updates the subsection counts and the Members chips live. Flagged uses `--warning-background` / `--warning-ink`, never colour alone (the word "Flagged" is always printed).

### 4.6 Stakeholders

- Field saves on blur (existing). While inherited the field is read-only and shows the resolved number with "(from the group)" / "(from the parent question)" as placeholder-style caption.
- "More" is a text button with `aria-expanded`; it holds Sample quality (native `select`) and Recalculate. Recalculate: button label becomes "Recalculating…" with the button disabled; result line "Recalculated for n answers" (existing key) or "Recalculation failed" (existing key) with [Try again].
- On a question, the inherited caption links to the group's `?section=people#stakeholders`.

### 4.7 Joining answers & rooms

- Master toggle Off: only the toggle row renders ("switch off: one line, nothing else", IA §7).
- Split: button disabled with hint "At least 2 people must join an answer" until true. During split: button shows "Splitting…"; on failure inline error "Could not split. Try again." under the button; existing rooms remain listed. Re-split asks: "Replace the 4 existing rooms?" [Cancel] [Replace].

### 4.8 Toasts and Undo

- One toast at a time, bottom-centre on mobile, bottom-inline-end on desktop; 6 s; pause on hover/focus; the Undo button is the first tab stop inside it; `role="status"`.
- Undo re-issues the inverse write and shows "Undone" for 2 s. If the inverse fails: toast "Could not undo" with [Retry].

---

## 5. Progressive disclosure map

| Level | What the host sees | What is hidden until asked |
|---|---|---|
| 0 Card header | "People" + one-line description | everything |
| 1 Subsection headers | 6–7 lines, each with its live summary and count badge | all controls |
| 2 Subsection open | the primary control: picker · waiting rows · list · questions list · count field · master toggle | expert controls |
| 3 Disclosures | Stakeholders "More" (sample quality, recalculate) · row ⋯ sheet · Review modal · Question editor · Joining's rooms block (only when On) | — |

Rule of thumb: a host who only ever needs to let people in and make a co-host never scrolls past level 2.

---

## 6. Decisions on the IA's "yours to decide" list

1. **Collapse/expand component**: `PeopleSubsection`, a one-row accordion item (not nested cards — cards inside a card read as clutter at 360 px). Summary line format: `Title · value [· same as the group]`, with the count badge at inline-end only when action is pending.
2. **Access picker**: vertical radio list with hints (3.7). Fits 360 px RTL; five labels in a segmented control do not.
3. **Person row**: avatar 40 px · name + text badges · one meta line · actions at inline-end: ⋯ → Sheet on < 601 px, two inline labelled ghost buttons on ≥ 601 px. Min row height 56 px; whole row is not a button (only the actions are), so screen-reader users get a clean list.
4. **Inheritance idiom**: `InheritanceSwitch` = two-segment control "Same as the group ✓ | Change for this question" + one caption stating the group's value, then the control (read-only while inherited). Same component in three places.
5. **Entry check**: stays a modal. The review needs tabs, search and per-person answers; inlined it would be the tallest thing in the card and would fight the accordion. The subsection shows counts + one button.
6. **Stakeholders "More"**: a text-button disclosure directly under the one-line explainer, inside the subsection body (not a separate subsection).
7. **Badges**: text badges, `--radius-pill`, caption size: Creator (`--surface-background` fill, `--text-body`), Host (`--btn-primary` outline, `--btn-primary` text), You (`--text-caption` outline), Blocked (`--error-bg` fill, `--error-text`). Never colour-only.
8. **Header waiting badge**: count pill on the existing people icon; deep-links, no modal (3.11).
9. **Empty states**: lucide icon (24 px, `--text-caption`) + one sentence + at most one action. No illustrations in v1; revisit once the section is stable.

---

## 7. Accessibility (WCAG 2.2 AA)

- **Structure**: card `section > h2 > button`; subsections `h3 > button[aria-expanded][aria-controls]`; lists are `ul > li`; chips in a `div[role="group"][aria-label="Filter members"]` with `aria-pressed` (Chip atom); access picker is `fieldset > legend + input[type=radio]` with the hint tied via `aria-describedby`.
- **Keyboard**: Tab reaches every header button, chip, row action and link in DOM order; Enter/Space toggle headers; arrow keys move within the radio group (native); Escape closes the Sheet / Modal and returns focus to the opener; the jump strip is a list of buttons, not links, so it does not pollute the tab order with duplicate anchors on mobile (it is not rendered there).
- **Focus**: visible `outline: 2px solid var(--btn-primary); outline-offset: 2px` on every interactive element (the hub's `cardToggle` already does this); focus never lands on a removed row (4.3, 4.4 rules).
- **Live regions**: one `aria-live="polite"` region in `PeopleSection` announces count changes ("2 waiting"), filter results, save failures; toasts are `role="status"`.
- **Targets**: ≥ 44 × 44 px for every tap target (row ⋯, chips get `min-block-size: 2.75rem` on touch), ≥ 24 px for inline desktop buttons with 8 px spacing (2.2 AA 2.5.8).
- **Contrast**: all text ≥ 4.5:1 using tokens; badges verified in both normal and high-contrast variable sets (`--*-contrast`). Flagged / Blocked are words, with colour as reinforcement only.
- **Motion**: chevron rotation and row fade under `prefers-reduced-motion: reduce` → none.
- **RTL**: logical properties only; `dir="auto"` on names (Latin names inside Hebrew lists); counts isolated with `unicode-bidi: isolate`.
- **Confirm dialogs**: `Modal` with `aria-modal`, focus trapped, initial focus on Cancel for destructive dialogs.
- **Language**: every new string through `useTranslation()`; keys from IA §3 added to all 7 language files in the same commit as the UI.

---

## 8. Recommended defaults for the IA's open questions

| Question | Recommendation | Why |
|---|---|---|
| **A4** Host vs Admin | **Host / מארח/ת** | The hub is already "Host tools / כלי מארח/ת"; "Admin" is a system word hosts do not use about themselves; `Role.admin` stays in code. Rows 15–17 of IA §3 as written. |
| **Q2** Where "Joining answers & rooms" lives | **People** (as the spec says), with a one-line read-only mirror "Rooms: 4 · manage in People →" inside Answers once rooms exist | The host's verb is "split the *people*"; keeping the switch, the room size and the split in one place fixes defect 5. The mirror keeps Answers' mental model ("answers get people") without a second control. |
| **Q3** Anonymity | **No new setting in v1.** Retire the "anonymous users" label; Public (no sign-in) already covers the real case. If "hide names from members" is asked for later, it is one `Toggle` at the bottom of Who can join: "Hide names from members", default off, hint "Hosts still see names." | Nothing in the code implements per-person anonymity today; shipping a toggle that does nothing violates principle 5. |
| **Q4** xlsx pre-approved list | **Remove from People now.** When the backend exists, it returns under Waiting to join as "Pre-approve a list" with a drag-and-drop zone (`.xlsx`/`.csv`), preview of the parsed names, then [Pre-approve n people]. | Today's upload is a no-op (`SetWaitingListCont.ts` commented out). Drag-and-drop matches the house preference for file input. |

---

## 9. Phased implementation order (safest wins first)

Each phase is independently shippable and leaves the section working. Tests per CLAUDE.md (`__tests__` beside the files; `settings/__tests__/duplicateControls.test.ts` updated when composition changes).

**Phase 1 — Words only (no structure change)**
1. Add every key from IA §3 to `packages/shared-i18n/src/languages/{en,he,ar,de,es,fa,nl}.json`.
2. Replace the untranslated literals listed in IA §3 (Inherit from parent group, Banned users, Invite, Review Members, Member Management, total members, Ban/Unban member, tooltips, Approve All / Deny All, Load More, Flagged, Admins) with `t('people.*')` calls in the existing components.
3. Access labels: one label per value (`people.access.*`), fix the double-space Hebrew string.
4. "Host / מארח/ת" everywhere in UI text (A4). `host.peopleDesc` rewritten to the §3 vocabulary.
Risk: none. Win: Hebrew hosts stop seeing English.

**Phase 2 — Remove what lies**
5. `MembersSettings`: delete the "Joined members (N)" count (N is the cross-statement waiting count) and the xlsx upload (dead). Keep its banned list for now.
6. `MembersSettings` + `MembersManagement`: replace the `/statement-an/true/:id/options` share with a link "Invite link → Live now" (`buildHostHubPath(id, 'live')`).
7. `MembershipSettings`: surface the save error inline instead of `console.info`.
Risk: low. Win: no dead route, no wrong number.

**Phase 3 — Waiting to join has a home**
8. New `WaitingSubsection` in `PeopleSection` built on `useApproveMembership` + `approveMultiple` / `rejectMultiple`; per-row Let in / Decline with Undo toast; selection bar at ≥ 1 selected; bulk Decline confirm.
9. Header badge (`WaitingList.tsx`) becomes a count pill that navigates to `?section=people#waiting`; its own popover removed.
10. Hash handling in `PeopleSection` (open + scroll + focus).
Risk: low-medium (new list, existing actions). Win: task flow "let a waiting person in" reachable from People.

**Phase 4 — One inheritance idiom + lighter Stakeholders**
11. `InheritanceSwitch` molecule (SCSS first, BEM, in `src/view/style/molecules/_inheritance-switch.scss`).
12. `AccessPicker` radio list replaces `MultiSwitch` + "Inherit" checkbox in `MembershipSettings`.
13. `ConfidenceIndexSettings`: count first, `More` disclosure for sample quality + recalculate; inherited state through `InheritanceSwitch`.
14. `UserDemographicSetting`: "Apply to all sub-discussions" + exclude list re-expressed through `InheritanceSwitch` (inherited rows read-only with "ask" checkbox under override).
Risk: medium (touches three save paths). Win: defects 6, 11, 18 closed.

**Phase 5 — One Members list**
15. `PersonRow` molecule (+ `RoleBadge` element), ⋯ Sheet on mobile, inline actions on desktop; Block confirm; Undo toasts.
16. `MembersManagement` becomes the Members subsection: chips Hosts · Members · Waiting · Blocked (+ Responded / Did not respond on questions), hosts-first sort, Creator/You badges, "nobody to promote" hint kept, empty state with Invite link.
17. Delete `MembersSettings`, `AdminsManagement`, `EnhancedMembersManagement`, `EnhancedMemberCard`, `MembershipCard` usages in People; remove Get Voters / Non Voters / Evaluators from Data & Advanced.
18. Update `duplicateControls.test.ts` `FORM_COMPOSITION`; legacy `StatementSettingsForm` renders `PeopleSection`.
Risk: highest (deletions, four role-action paths collapse into one). Win: defects 1, 2, 8, 13, 20 closed.

**Phase 6 — Local navigation**
19. `PeopleSubsection` accordion with summaries and anchors for all subsections; desktop jump strip; default-open rule.
20. Entry check subsection (counts + Review button) shown wherever questions exist (A3); `MemberValidation` re-skinned onto `Modal`.
Risk: low-medium (presentation). Win: defects 15, 19, 22 closed.

**Phase 7 — Joining answers & rooms as one block**
21. Move Enable joining, Join form, Conditional joining, Activation threshold from Participation Rules into `OptionRooms` → `JoiningSubsection`; delete `host.joiningOffHint`; split error state; re-split confirm.
Risk: medium (settings keys unchanged, only placement). Win: defect 5, task flow "split into rooms" drops from 6 steps to 4.

Verification per phase: `npm run check-all`, Playwright pass at 360 px (he, RTL) and 1280 px (en) through the host hub `?section=people`, axe run with no serious/critical violations, keyboard-only walkthrough of the subsection the phase touched.

---

## 10. A/B candidates (after Phase 6, if instrumented via `uxAnalytics.hostHubOpened`)

- Default-open rule (first actionable subsection) vs all collapsed: measure time-to-first-Let-in.
- Row actions on mobile: ⋯ sheet vs a single visible "Make host" plus ⋯ for Block: measure mis-taps on Block (confirm-cancel rate).
- Jump strip on desktop: with vs without; measure scroll distance before the first subsection open.

---

## 11. Copy table (new strings only; keys per IA §3)

| Key | EN | HE |
|---|---|---|
| `people.whoCanJoin` | Who can join | מי יכול להצטרף |
| `people.access.public` | Public, no sign-in | ציבורי, בלי התחברות |
| `people.access.public.hint` | Anyone can take part without an account | כל אחד יכול להשתתף בלי חשבון |
| `people.access.openToAll` | Open to all | פתוח לכולם |
| `people.access.openToAll.hint` | Anyone with the link joins | כל מי שיש לו קישור מצטרף |
| `people.access.signedIn` | Signed-in only | מחוברים בלבד |
| `people.access.signedIn.hint` | Must have an account | נדרש חשבון |
| `people.access.byApproval` | By approval | באישור המארח/ת |
| `people.access.byApproval.hint` | You let each person in | את/ה מאשר/ת כל אחד |
| `people.access.inviteOnly` | Invite only | בהזמנה בלבד |
| `people.access.inviteOnly.hint` | Only people you invite. Current members keep access | רק מי שהוזמן. חברים קיימים נשארים |
| `people.sameAsGroup` | Same as the group | כמו הקבוצה |
| `people.changeHere` | Change for this question | שינוי לשאלה הזו |
| `people.groupIs` | Group is: {value} | בקבוצה: {value} |
| `people.inviteLink` | Invite link | קישור הזמנה |
| `people.inviteLinkInLive` | Invite link → Live now | קישור הזמנה ← שידור חי |
| `people.waiting` | Waiting to join | ממתינים לאישור |
| `people.waiting.empty` | Nobody is waiting | אין ממתינים |
| `people.waiting.asked` | asked {time} | ביקש/ה {time} |
| `people.letIn` | Let in | לאשר |
| `people.decline` | Decline | לדחות |
| `people.selectAll` | Select all | לבחור את כולם |
| `people.nSelected` | {n} selected | נבחרו {n} |
| `people.declineN.title` | Decline {n} people? | לדחות {n} אנשים? |
| `people.declineN.body` | They can ask to join again. | הם יוכלו לבקש להצטרף שוב. |
| `people.letInToast` | {name} let in | {name} אושר/ה |
| `people.declinedToast` | {name} declined | {name} נדחה/תה |
| `people.undo` | Undo | ביטול |
| `people.members` | Members | חברים/ות |
| `people.members.empty` | Nobody has joined yet | עוד אף אחד לא הצטרף |
| `people.searchMembers` | Search members | חיפוש חברים/ות |
| `people.filter.all` | All | הכול |
| `people.role.host` | Host | מארח/ת |
| `people.role.member` | Member | חבר/ה |
| `people.role.banned` | Blocked | חסומים/ות |
| `people.role.you` | You | את/ה |
| `people.makeHost` | Make host | הפיכה למארח/ת |
| `people.removeHost` | Remove host | הסרת מארח/ת |
| `people.removeOwnHost.title` | Remove your own host rights? | להסיר את הרשאות המארח/ת שלך? |
| `people.removeOwnHost.body` | You will lose access to Host tools. | תאבד/י גישה לכלי המארח/ת. |
| `people.block` | Block | חסימה |
| `people.unblock` | Unblock | ביטול חסימה |
| `people.block.title` | Block {name}? | לחסום את {name}? |
| `people.block.body` | They will not be able to see or take part in this space. You can unblock them later. | הם לא יוכלו לראות או להשתתף במרחב הזה. אפשר לבטל את החסימה אחר כך. |
| `people.nowHostToast` | {name} is now a host | {name} עכשיו מארח/ת |
| `people.noLongerHostToast` | {name} is no longer a host | {name} כבר לא מארח/ת |
| `people.blockedToast` | {name} blocked | {name} נחסם/ה |
| `people.showMore` | Show {n} more | להציג עוד {n} |
| `people.nOfM` | {n} of {m} | {n} מתוך {m} |
| `people.responded` | Responded | הגיבו |
| `people.notResponded` | Did not respond | לא הגיבו |
| `people.joinQuestions` | Questions on joining | שאלות בהצטרפות |
| `people.joinQuestions.fromGroup` | From the group «{name}» | מהקבוצה «{name}» |
| `people.joinQuestions.ask` | Ask | לשאול |
| `people.joinQuestions.editInGroup` | Edit in the group | עריכה בקבוצה |
| `people.addQuestion` | Add question | הוספת שאלה |
| `people.deleteQuestion.title` | Delete this question? | למחוק את השאלה? |
| `people.deleteQuestion.body` | Answers already given are kept. | תשובות שכבר ניתנו נשמרות. |
| `people.entryCheck` | Entry check | בדיקת כניסה |
| `people.entry.waitingReview` | Waiting review | ממתין לבדיקה |
| `people.entry.flagged` | Flagged | מסומן |
| `people.entry.approved` | Approved | אושר |
| `people.entry.blocked` | Blocked | חסום |
| `people.reviewAnswers` | Review answers | בדיקת תשובות |
| `people.stakeholders.hint` | How many people this decision concerns. Used for confidence. | כמה אנשים ההחלטה נוגעת להם. משמש לחישוב ביטחון. |
| `people.stakeholders.fromGroup` | from the group | מהקבוצה |
| `people.stakeholders.fromParent` | from the parent question | מהשאלה שמעל |
| `people.more` | More | עוד |
| `people.sampleQuality` | Sample quality | איכות הדגימה |
| `people.recalculate` | Recalculate | חישוב מחדש |
| `people.recalculating` | Recalculating… | מחשב מחדש… |
| `people.joining` | Joining answers | הצטרפות לתשובות |
| `people.joiningAndRooms` | Joining answers & rooms | הצטרפות לתשובות וחדרים |
| `people.joining.hint` | People can join an answer they back | אנשים יכולים להצטרף לתשובה שהם תומכים בה |
| `people.joining.each` | Each person joins | כל אחד מצטרף ל־ |
| `people.joining.one` | One | אחת |
| `people.joining.many` | Many | כמה |
| `people.rooms.size` | Room size | גודל חדר |
| `people.rooms.split` | Split into rooms | לחלק לחדרים |
| `people.rooms.splitting` | Splitting… | מחלק… |
| `people.rooms.needTwo` | At least 2 people must join an answer | לפחות 2 אנשים צריכים להצטרף לתשובה |
| `people.rooms.replace.title` | Replace the {n} existing rooms? | להחליף את {n} החדרים הקיימים? |
| `people.rooms.created` | Rooms created | חדרים שנוצרו |
| `people.error.save` | Could not save. Try again. | השמירה נכשלה. נסו שוב. |
| `people.error.load` | Could not load members. | טעינת החברים נכשלה. |
| `people.retry` | Retry | ניסיון חוזר |
| `people.couldNotUndo` | Could not undo | הביטול נכשל |

Existing keys reused: `Creator`, `Rooms`, `No questions yet`, `Failed to update role`, `Not set anywhere`, `Recalculated for`, `Recalculation failed`, `host.people`, `host.people.stakeholders`. The HE gendered forms follow the slash convention already used in the app (מארח/ת).
