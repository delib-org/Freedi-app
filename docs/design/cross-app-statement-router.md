# Cross-App Statement Router — UX Design Proposal

**Status:** Strawman for review (Tal + design agent iteration)
**Scope:** Main app only (the control plane). v1 targets: **Join, Sign, Mass-Consensus**. Registry covers all 8 apps.
**Author:** UX design agent, 2026-07-23

---

## 1. The One-Paragraph Pitch

Every Statement card in the main app gets a **"Continue in…"** action inside its existing
card menu (the ellipsis `⋯` that already hosts SolutionMenu on option cards; question cards
get the same menu added). Tapping it opens a **Route Picker** — a bottom sheet on mobile, an
anchored popover on desktop — listing the *lenses* this Statement can be opened in. The list
is derived at render time from a small **route registry** (an extension of the existing
`ACTIVITY_REGISTRY`), never hardcoded per card. Choosing a destination is just a deep-link
open — same Statement, different engine — with one exception: choosing **Sign** first shows
an inline confirm step that writes `isDocument: true` (the flag the Sign app already keys
on), then opens the doc. That write is reversible from the same menu, and from an Undo on
the success toast.

Naming note: participants never see app names anywhere else in Freedi (the activity
registry deliberately uses labels like "Crowd Consensus", not "mass-consensus app"). The
router follows suit — destinations are named by **what happens next** ("Gather crowd
consensus", "Turn into a signable document"), not by app brand. App names appear only in
the small print ("opens in a new tab").

---

## 2. Concept: Every Route Is a Lens Switch

### 2.1 Mental model

A Statement is the deliberation object; each app is a lens. The router never copies,
spawns, or transforms data. It does exactly two things:

1. **Open** — resolve a deep link into the destination app for this `statementId` and open it.
2. **Mark** (Sign only) — set `isDocument: true` on the Statement before opening, because
   the Sign app renders `isDocument` Statements as signable documents
   (`packages/shared-types/src/models/statement/StatementTypes.ts:314`, and
   `src/controllers/db/statements/setIsDocument.ts` already implements the toggle).

This maps 1:1 onto infrastructure that already exists for the Event Control Center:

| Need | Existing infra (REUSED as-is) | Where |
|---|---|---|
| Classify a Statement | `getActivityType(statement)` | `packages/shared-types/src/models/event/activityRegistry.ts` |
| App metadata (label, icon, engine) | `ACTIVITY_REGISTRY` / `ActivityTypeDef` | same file |
| App identity enum | `SourceApp` | `packages/shared-types/src/models/engagement/SourceApp.ts` |
| Deep-link path templates | `APP_DEEP_LINKS` + `buildDeepLink` | `packages/shared-types/src/models/engagement/DeepLinks.ts` |
| Absolute URL building (env-injected bases) | `createActivityUrlResolver` | `packages/event-core/src/activityUrls.ts` |
| Main-app resolver wiring (origin, `getMassConsensusUrl()`, `VITE_SIGN_APP_URL`) | `getMainAppResolver()` | `src/controllers/events/activityUrls.ts` |
| Card menu chrome | `Menu` (with `isCardMenu`) + `MenuOption` | `src/view/components/menu/` |
| The Sign document flag + write | `isDocument` field, `toggleIsDocument()` | `src/controllers/db/statements/setIsDocument.ts` |
| Visual language for pills/rows | `RunStatePill`, `ActivityRow` | `src/view/pages/eventControlCenter/components/` |

### 2.2 What is genuinely NEW

Three small pure pieces, one UI surface:

1. **`ROUTE_REGISTRY`** (new, in shared-types next to `activityRegistry.ts`) — one
   `RouteTargetDef` per destination app: label, icon, `SourceApp`, which deep-link it uses,
   an eligibility predicate over `(statementType, questionType)`, minimum role, and an
   optional `prerequisiteWrite` (only Sign uses it: `'markDocument'`).
2. **`deriveRouteTargets(statement, resolver, ctx)`** (new, in `@freedi/event-core`, sibling
   of `deriveActivities`) — pure function producing the per-Statement destination list with
   a resolved `href` and a **state** (`ready | needsMark | alreadyMarked | disabled`).
3. **`SourceApp` extension** — add `JOIN`, `STUDIO`, `ADMIN` (the enum currently stops at
   agora), and extend `EventUrlConfig` with `joinBaseUrl` (+ later studio/admin bases).
4. **`RoutePicker`** UI (new, main app) — the sheet/popover, the Sign confirm step, the
   success toast. Entry points: one new `MenuOption` in `SolutionMenu`, and a new (first
   ever) card menu on `SubGroupCard`.

Everything else is plumbing through functions that already exist.

### 2.3 Registry sketch (illustrative, not final code)

```typescript
// packages/shared-types/src/models/event/routeRegistry.ts
export enum RoutePrerequisite { none = 'none', markDocument = 'markDocument' }

export interface RouteTargetDef {
  sourceApp: SourceApp;
  /** English label, translated via t() like ACTIVITY_REGISTRY labels. */
  label: string;            // e.g. "Gather crowd consensus"
  description: string;      // one-liner shown in the picker
  icon: string;             // emoji for now, same convention as ActivityTypeDef
  /** Which Statement shapes this lens can open. Pure data, no functions. */
  eligibleTypes: StatementType[];            // e.g. [question]
  eligibleQuestionTypes?: QuestionType[];    // omit = any
  minRole: 'admin' | 'member';
  prerequisite: RoutePrerequisite;           // Sign = markDocument
  deepLinkKey: string;                       // key into APP_DEEP_LINKS[sourceApp]
}

export const ROUTE_REGISTRY: RouteTargetDef[] = [ /* 8 entries */ ];
```

`deriveRouteTargets` then does what `deriveActivities` does for the Event dashboard:
filter by eligibility + role, resolve `href` via the injected resolver, and attach state:

```typescript
export type RouteTargetState = 'ready' | 'needsMark' | 'alreadyMarked' | 'disabled';

export interface RouteTarget {
  def: RouteTargetDef;
  href: string | null;
  external: boolean;        // reuse ActivityLink.external semantics
  state: RouteTargetState;
  disabledReason?: string;  // English key for t()
}
```

`needsMark` = Sign target on a Statement with `isDocument !== true`.
`alreadyMarked` = Sign target where `isDocument === true` (pure open, badge shown).

### 2.4 v1 destination matrix (the registry's initial truth table)

| Destination | Eligible statement | Deep link | Prereq | Min role | Phase |
|---|---|---|---|---|---|
| **Join** (live facilitation) | `question` | `<join>/{statementId}` *(confirm exact join route — open Q)* | none | admin | **v1** |
| **Sign** (signable document) | `option` (v1; see §5.2 for questions) | `<sign>/doc/{statementId}` | markDocument | admin | **v1** |
| **Mass-Consensus** | `question` | `<mc>/q/{statementId}` | none | admin | **v1** |
| Chat (dialectic debate) | `question`, `option` | `<chat>/q/{statementId}` | none | admin | v2 |
| Flow | `question` | `<flow>/…` | none | admin | v2 |
| Agora (classroom game) | `question` | `<agora>/…` | none | admin | later |
| Studio | any (authoring lens) | `<studio>/…` | none | admin | later |
| Admin | any | `<admin>/…` | none | admin | later |

Opinionated call: **v1 is admin/creator-only** (this is a control-plane feature; members
already reach other apps through shared links and the Event Control Center's ShareHub).
The `minRole` field keeps the door open to per-destination relaxation later without UI
changes. *Flagged as an open question in §9.*

---

## 3. The Per-Card Contextual Action

### 3.1 Where the affordance lives

**Option / suggestion cards** (`SuggestionCard` → `SolutionMenu`): one new `MenuOption`
appended to the existing ellipsis menu, **replacing** the current raw
"Mark as a Document" item (that action becomes the Sign route's confirm step —
one concept instead of two). "Unmark as a Document" stays, relabeled
"Stop being a document" under the Sign row's already-marked state (§5.2).

**Question cards** (`SubGroupCard` in `QuestionsView`): this card has no menu today —
it gets one, top corner (inline-end), using the same `Menu isCardMenu` component with
the same `⋯` trigger. v1 contents: "Continue in…" only (plus room to grow — the card
will inevitably need Edit/Hide someday, and this gives them a home).

Why inside the menu and not a dedicated visible button on the card face:

- Card faces are already dense (results, voting, join buttons, chat bubbles); a per-card
  always-visible router button would compete with the primary action (drill down / evaluate).
- Routing is an occasional, admin-grade action — exactly what the `⋯` idiom is for.
- The `Menu` component already solves positioning, overflow escape, click-outside, and RTL.

The `MenuOption` itself:

```
┌────────────────────────────────┐
│ ✎  Edit Text                   │
│ 💡 Mark as a Solution          │
│ ────────────────────────────── │
│ ⇗  Continue in…            ›   │   ← NEW (chevron = opens picker)
│ ────────────────────────────── │
│ 🗑  Delete                     │
└────────────────────────────────┘
```

Label: **"Continue in…"** (he: **"להמשיך ב…"**). It says what the user is doing
(continuing the deliberation) rather than a technical "Open in app". The trailing chevron
(`›`, auto-flips in RTL) signals a second level, distinguishing it from immediate actions.

### 3.2 Why a second-level picker instead of inline menu items

Strawman decision: destinations do **not** expand inline in the menu. Reasons:

- Sign needs an inline confirm + explanation; a flat menu row can't carry that.
- Destinations need description lines, state badges ("already a document"), and disabled
  reasons — richer than `MenuOption` affords.
- The registry can grow to 8 apps; a card menu with 8 more rows becomes a mess.
- One picker = one component to translate, test, and reuse from other entry points later
  (e.g. from the statement header, from Event Control Center rows).

### 3.3 Deriving the list per card

The card never knows about destinations. It calls a hook:

```typescript
// src/controllers/statementRouter/useRouteTargets.ts (new)
const targets = useRouteTargets(statement);
// → deriveRouteTargets(statement, getMainAppResolver(), { role })
```

- Eligibility comes from `statement.statementType` + `statement.questionSettings?.questionType`
  via the registry — identical philosophy to `getActivityType()`.
- If `targets.length === 0` (or role too low), the "Continue in…" row simply doesn't render.
  No dead entry points.
- Targets that are eligible-in-principle but currently blocked (e.g. Sign on a question in
  v1) render **disabled with a reason** inside the picker, not hidden — this teaches the
  model ("options become documents") instead of silently varying the menu.
  Only truly-inapplicable destinations are hidden (MC on an option, for example).

### 3.4 Mobile-first, RTL, i18n

- **Mobile:** picker is a bottom sheet (design guide already prescribes the bottom-sheet
  pattern for modals): full-width, drag handle, 48px min touch targets, safe-area padding.
- **Desktop (≥768px):** anchored popover near the menu trigger, same content, max-width
  ~360px — matching `Menu`'s fixed-position escape behavior.
- **RTL:** all layout via logical properties (`margin-inline-start`, `inset-inline-end`);
  the `›` chevron and the `⇗` route glyph flip via `[dir='rtl']` transform, as arrows are
  directional. `useTranslation()`'s `dir` is already available (Menu uses it today).
- **i18n:** every string through `useTranslation()`; registry labels stay English keys
  translated at render (exact convention of `ACTIVITY_REGISTRY.label` + `t(def.label)`
  in `ActivityRow`). New keys added to all 6 language files in
  `packages/shared-i18n/src/languages/`.

---

## 4. Wireframes

### 4.1 The trigger, on a question card (SubGroupCard)

```
┌──────────────────────────────────────────────┐
│ How should we allocate the 2027       💬  ⋯ │  ← ⋯ NEW on question cards
│ community budget?                            │
│                                              │
│  Answers:                                    │
│   • Participatory budgeting rounds           │
│   • Delegate committee                       │
│                                              │
│  ⇗ Drill down                                │
└──────────────────────────────────────────────┘
              tap ⋯ →
                      ┌───────────────────────┐
                      │ ⇗  Continue in…     › │
                      └───────────────────────┘
```

### 4.2 The Route Picker — mobile bottom sheet (question card)

```
╭──────────────────────────────────────────────╮
│                    ────                      │  ← drag handle
│  Continue this question in…                  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ 🤝  Live facilitation           [Open ⇗]│  │
│  │     Run this question in a live         │  │
│  │     joining session                     │  │
│  └────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────┐  │
│  │ ⚡  Crowd consensus             [Open ⇗]│  │
│  │     Let a large crowd suggest and       │  │
│  │     rate answers anonymously            │  │
│  └────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────┐  │
│  │ ✍  Signable document                    │  │
│  │     Only answers (options) can become   │  │
│  │     documents                    ⓘ      │  │  ← disabled + reason
│  └────────────────────────────────────────┘  │
│                                              │
│  Links open in a new tab            [Close]  │
╰──────────────────────────────────────────────╯
```

Notes: 1 tap on an enabled row = go (no extra "confirm" for pure-open routes — it's just a
link). Disabled rows are non-interactive, 40% opacity, reason always visible (no tooltip-
only on mobile). Desktop version is the same list in a ~360px popover anchored to `⋯`.

### 4.3 The Sign confirm — the only two-step route (option card)

Tapping "Signable document" on an option that is not yet a document **morphs the sheet
in place** (no second modal):

```
╭──────────────────────────────────────────────╮
│  ‹ Back                                      │
│                                              │
│  ✍  Turn into a signable document            │
│                                              │
│  "Participatory budgeting rounds"            │
│                                              │
│  This marks the statement as a document so   │
│  it opens as signable text. Nothing is       │
│  copied — it is the same statement, viewed   │
│  as a document. You can undo this at any     │
│  time.                                       │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │      Make document & open  ⇗         │    │  ← primary (--btn-primary)
│  └──────────────────────────────────────┘    │
│               Cancel                         │
╰──────────────────────────────────────────────╯
```

- Single write on confirm: `{ isDocument: true, lastUpdate }` (idempotent **set**, not the
  existing toggle — see §6). Then open `<sign>/doc/{statementId}` in a new tab.
- If the option is **already** a document, there is no confirm — the picker row shows a
  state badge and opens directly:

```
│  ┌────────────────────────────────────────┐  │
│  │ ✍  Signable document  [● document]     │  │
│  │     Open the existing document [Open ⇗]│  │
│  │     Stop being a document              │  │  ← quiet text-button, undoes flag
│  └────────────────────────────────────────┘  │
```

### 4.4 Success / return state

The destination opens in a **new tab**; the main app stays put (the user's control-plane
context is never destroyed). On the main-app side, a toast confirms the write-cases:

```
┌──────────────────────────────────────────────┐
│ ✍ Now a signable document          [Undo]    │   ← 8s, then auto-dismiss
└──────────────────────────────────────────────┘
```

- Undo = write `isDocument: false`. Pure-open routes (Join/MC/…) get **no toast** — the new
  tab itself is the feedback, and toasting a link click is noise.
- The card reflects the marked state persistently: a small `✍` document chip appears in the
  card's icon strip (same slot pattern `SubGroupCard` uses for its type icon), so
  "already routed to Sign" is visible without opening any menu.

### 4.5 Loading / error (Sign write only)

```
[ Make document & open ⇗ ]  →  [ ◌ Marking… ]  →  (open tab, toast)
                                    │
                                    └─ on failure: inline error in sheet:
                                       "Couldn't mark as document. Try again."
                                       [Try again]   (logError with operation:
                                       'statementRouter.markDocument')
```

The tab is opened **after** the write resolves — never optimistically — so the Sign app
can't land on a not-yet-document Statement (Sign create-flow expects `isDocument: true`).

---

## 5. Route Behavior Specs

### 5.1 Common contract (all routes)

| Aspect | Behavior |
|---|---|
| Data | Same `statementId`, zero transformation, zero copies |
| Open | `window.open(href, '_blank', 'noopener,noreferrer')` when `external: true` (MC/Sign/Join/Chat/…); in-app `navigate()` for `SourceApp.MAIN` lenses |
| URL source | `createActivityUrlResolver` config; new bases added to `EventUrlConfig` (`joinBaseUrl`, later others) — env-injected, exactly like MC/Sign today |
| Visibility | Row hidden if type-ineligible; disabled+reason if contextually blocked; hidden entirely below `minRole` |
| Analytics | one event `statement_routed { statementId, sourceApp, state }` (hook for later phases) |

### 5.2 Sign — the special case, fully specified

| Question | Answer |
|---|---|
| What marks it a document? | `isDocument: true` on the Statement — the exact field Sign already reads and Sign's own create flow writes (`apps/sign/app/api/home/create/route.ts` sets `isDocument: true` on the created option). No new field, no `statementType` change. |
| Why not `statementType: document`? | Changing `statementType` is destructive to the option's role in its parent question (evaluations, results, consensus). `isDocument` is additive: the Statement stays an option in the main app *and* renders as a document in Sign. That's the "same data, different lens" principle in field form. |
| Reversible? | Fully. `isDocument: false` restores; nothing in Sign is deleted because Sign state (signatures, approvals, comments) lives in its own collections keyed by statementId and simply becomes unreachable until re-marked. **Caveat to confirm:** if people have signed, unmarking hides a signed document — v1 shows a stronger confirm ("N people have signed this document") when signatures exist. |
| Who can? | Admin/creator only (matches existing `SolutionMenu` gating of Mark-as-Document). |
| Questions → Sign? | **Not in v1.** The existing controller intentionally restricts to options, and Sign's document model is built around option-anchored docs. The picker shows the row disabled with "Only answers (options) can become documents" so the capability is discoverable. Revisit in v2 (Tal call). |
| Write path | New `setIsDocument(statementId, value: boolean)` in the existing `src/controllers/db/statements/setIsDocument.ts` (the current `toggleIsDocument` is race-prone for this UX — two taps of Undo/redo could desync; explicit set is idempotent). Existing toggle stays for the legacy menu until it's removed. |
| After | New tab on `<sign>/doc/{statementId}`; toast + Undo in main app; persistent `✍` chip on the card. |

### 5.3 Join / Mass-Consensus (pure opens)

| | Join | Mass-Consensus |
|---|---|---|
| Eligible | `question` (any questionType — Join facilitates any evaluable question) | `question`; **no write needed** — MC's `/q/{statementId}` renders any question. If Tal wants routing to *also* set `questionSettings.questionType = massConsensus`, that becomes a second `prerequisiteWrite` kind — strawman says **no**: keep routes write-free except Sign (the locked decision), and let MC admin settings own that flag. |
| URL | `joinBaseUrl` + join's statement route *(exact path to confirm — join app is vanilla-TS with non-obvious routing; open question)* | `getMassConsensusUrl()/q/{statementId}` — helper already exists in `src/controllers/db/config.ts` |
| After | New tab; no toast | New tab; no toast |

---

## 6. Edge Cases & States

| Case | Handling |
|---|---|
| No eligible destinations | "Continue in…" row not rendered at all |
| Below `minRole` | Same — entry point absent (never a "you can't" dead-end) |
| Type-ineligible destination | Hidden from picker (e.g. MC for an option) |
| Contextually blocked (Sign on question, v1) | Shown disabled + inline reason — teaches the model |
| Already marked (Sign) | State badge `● document`, direct open, quiet "Stop being a document" |
| Unmark with existing signatures | Escalated confirm naming the signature count |
| Sign write fails | Inline error in sheet + retry; `logError` with `operation: 'statementRouter.markDocument'`, statementId, userId; tab NOT opened |
| Destination app URL not configured (missing env) | Resolver returns `null` href → row disabled with "Not available in this environment"; `logError` once |
| Hidden statement (`hide: true`) | Router still available to admins (they see hidden cards); no special casing |
| Offline | Pure opens fail in the new tab (browser's problem); Sign confirm button disabled when `navigator.onLine === false` with "You're offline" |
| Double-tap / repeat routing | Pure opens: browsers handle it (another tab). Sign: idempotent set — second confirm is a no-op, picker already shows marked state |
| New tab vs in-app | `external: true` → new tab always (control-plane context preserved); `SourceApp.MAIN` lenses (future: Studio-style views) → in-app navigate |
| Popup blocked | `window.open` return checked; on `null`, toast with a plain link "Open ⇗" the user can tap (user-gesture-safe) |

Accessibility: sheet/popover is `role="dialog"` + focus-trap, ESC closes, focus returns to
the `⋯` trigger; rows are buttons with full labels ("Continue in crowd consensus — opens in
a new tab"); state conveyed in text, never color-only; WCAG AA contrast via design-system
tokens only (`--btn-primary`, `--text-body`, `--card-default`, `--agree` for the marked
badge).

---

## 7. Phased Implementation Plan

No code below — component names, homes, and the utilities they call.

### Phase 1 — Registry + derivation (pure, no UI)
| Deliverable | Location | Notes |
|---|---|---|
| `RouteTargetDef`, `ROUTE_REGISTRY`, `RoutePrerequisite` | `packages/shared-types/src/models/event/routeRegistry.ts` | Pure serializable data, sibling + same conventions as `activityRegistry.ts`; export from shared-types index |
| `SourceApp.JOIN / STUDIO / ADMIN` | `packages/shared-types/src/models/engagement/SourceApp.ts` | Plus `APP_DEEP_LINKS` entries |
| `deriveRouteTargets()` | `packages/event-core/src/deriveRouteTargets.ts` | Mirrors `deriveActivities`; consumes `ActivityUrlResolver`; `EventUrlConfig` gains `joinBaseUrl` |
| Unit tests | `packages/event-core/src/__tests__/deriveRouteTargets.test.ts` | Truth-table per statement shape × role × isDocument |

### Phase 2 — Main-app wiring + option-card entry (v1 ship)
| Deliverable | Location | Notes |
|---|---|---|
| `useRouteTargets(statement)` hook | `src/controllers/statementRouter/useRouteTargets.ts` | Wraps `getMainAppResolver()` + role from `statementSubscriptionSelector` |
| `setIsDocument(statementId, value)` | extend `src/controllers/db/statements/setIsDocument.ts` | Idempotent set beside existing toggle; `createStatementRef`, `getCurrentTimestamp`, `logError` |
| `RoutePicker` (+ `.module.scss`) | `src/view/components/statementRouter/RoutePicker/` | Sheet (mobile) / popover (desktop); contains list, Sign confirm step, error state; CSS module, design tokens, logical properties |
| `RouteTargetRow` | same folder | One destination row incl. disabled/marked states |
| `RoutedToast` | same folder (or reuse existing toast infra if one fits) | Undo wire to `setIsDocument(false)` |
| SolutionMenu integration | `src/view/pages/statement/components/evaluations/components/solutionMenu/SolutionMenu.tsx` | Add "Continue in…" `MenuOption`; retire raw "Mark as a Document" row in favor of the Sign route |
| Translations ×6 | `packages/shared-i18n/src/languages/*` | All picker strings + registry labels |

### Phase 3 — Question cards + polish
| Deliverable | Location | Notes |
|---|---|---|
| Card menu on question cards | `src/view/components/subGroupCard/SubGroupCard.tsx` | First `⋯` on this card; `Menu isCardMenu` + the router `MenuOption` |
| `✍ document` chip on cards | `SuggestionCard` / `SubGroupCard` icon strip | Persistent already-routed signal |
| Signature-aware unmark confirm | RoutePicker | Needs a cheap signature-count read from Sign collections |
| Analytics event | `statement_routed` | |

### Phase 4 — The long tail (registry-only growth)
Chat, Flow, Agora, Studio, Admin become **registry entries + env base URLs only** — zero
new UI. That's the payoff of §2.3: adding an app to the router is a data change.

---

## 8. What This Deliberately Does NOT Do

- No central "router panel" page — locked decision 1; Event Control Center remains the
  aggregate view, this is the per-item complement.
- No copy/spawn/transform semantics anywhere — locked decision 2.
- No participant-facing routing in v1 — sharing stays with ShareHub/QR.
- No `questionType` rewriting when routing to MC — routes are write-free except Sign.

---

## 9. Open Questions for Tal

1. **Role gate:** v1 admin/creator-only — right call, or should members get pure-open
   routes (Join/MC) immediately? The registry's `minRole` makes either cheap.
2. **Join deep link:** what is the canonical join-app URL for a question
   (`<join>/{statementId}`? hash? code-based `/join/{code}` like `APP_DEEP_LINKS` hints)?
   Needs one authoritative answer before Phase 1.
3. **Questions → Sign:** keep v1 options-only (my recommendation, matches the existing
   controller and Sign's model), or extend Sign to question-anchored documents now?
4. **"Continue in…" label:** happy with the verb-first framing and no app names in the
   rows? Alternative: lead with app names for a team that already thinks in app terms.
5. **Retiring the legacy "Mark as a Document" menu row** in favor of the Sign route — OK
   to remove in the same release, or keep both for a transition period?
6. **MC routing + `questionType`:** confirmed that routing to MC should NOT set
   `questionType = massConsensus`? (Strawman says don't; MC settings own it.)
