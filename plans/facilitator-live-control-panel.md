# Facilitator Live Control Panel (Join App)

## Context

Tal is the sole facilitator running real-time events. He drives the room from the join app on his admin device — the cross-app facilitation feature shipped earlier handles navigation sync (`Statement.followMe` / `powerFollowMe` → join-app participants). What's missing: live, ad-hoc per-question setting control during the event. He wants to flip a few things on the fly without leaving the join app to dive into the main-app settings page.

Three settings matter for v1:
1. **Show all options vs only the above-consensus-threshold ones**
2. **Allow participants to add options**
3. **Allow chat**

Current state of these in the codebase:
- Toggle 1 (`resultsSettings.cutoffBy` + `minConsensus`) is already honoured by the join app via `getVisibleOptions()` — flipping these fields on the question doc already changes the participant view in real time.
- Toggle 2 (`statementSettings.enableAddEvaluationOption`) and toggle 3 (`statementSettings.hasChat`) **exist on the schema but the join app currently ignores them**. Flipping them today does nothing visible.

So the work splits in two: build the admin-side drawer to flip the settings, *and* gate the participant-side affordances on those settings.

User clarifications captured:
- "Show only selected" = **above-consensus threshold** (reuses existing `cutoffBy: aboveThreshold` + `minConsensus`). No new schema.
- Panel placement = **side drawer in the join app**, admin-only (not in the main app).
- Solo facilitator for now — multi-facilitator can come later.
- Skip phase presets; ad-hoc toggles only.

## Approach

Add a small **side drawer in the join app**, slid in from the inline-end edge. Visible only when `isAdmin()` is true on the current question. Three controls inside, each writing directly to the question doc with `setDoc(..., { merge: true })`. Existing `subscribeQuestion()` already listens to the doc and re-renders the participant view on every snapshot, so changes propagate within ~one snapshot tick to all connected participants.

Two of the three settings need new gating in the join-app render path so flipping them actually changes what participants see. The third (above-threshold) is already fully wired through `getVisibleOptions()`.

## Files to Modify

### 1. New — `apps/join/src/components/FacilitatorPanel.ts`

Mithril component. Reads `getQuestion()` for current settings, calls a new `setQuestionSetting()` writer for changes. Renders three toggle rows:

- **Show only above threshold** — bound to `resultsSettings.cutoffBy === 'aboveThreshold' && resultsSettings.minConsensus > 0`. A slider for the threshold (0.0–1.0, step 0.05) appears underneath when ON. Default value comes from `ResultsSettings.ts` (0.5).
- **Allow add options** — bound to `statementSettings.enableAddEvaluationOption`. Single toggle also writes the parallel `enableAddVotingOption` so evaluation and voting phases stay in sync from the facilitator's perspective.
- **Allow chat** — bound to `statementSettings.hasChat`.

Drawer chrome:
- Pinned tab/handle on the inline-end edge labelled "Facilitate" (i18n key `facilitator.panel.handle`). Visible only to admin.
- Click handle → drawer slides in (~280px wide). Backdrop dismisses. ESC closes. Click handle again to toggle.
- Mounted alongside MainHub / Solutions / Chat so it persists across views and route changes.

### 2. Edit — `apps/join/src/lib/store.ts`

Add a writer near `setOptionFlag` (line ~246) which already follows the merge-write pattern:

```ts
export async function setQuestionSetting(
  questionId: string,
  patch: Partial<Statement>,
): Promise<void> {
  const ref = doc(db, Collections.statements, questionId);
  await setDoc(ref, { ...patch, lastUpdate: Date.now() }, { merge: true });
}
```

Callers pass shaped patches like `{ statementSettings: { hasChat: false } }` — Firestore's deep merge handles the nested key.

### 3. Edit — `apps/join/src/views/Solutions.ts`

- Mount `FacilitatorPanel` (admin-only) above the existing Solutions content.
- **New gating** for "Allow add options": v1 hides the existing admin-only "Add organizer suggestion" button (line ~125) when `question.statementSettings?.enableAddEvaluationOption === false`. The toggle has a visible effect even before a participant-add flow exists.

### 4. Edit — `apps/join/src/views/Chat.ts`

- Mount `FacilitatorPanel` (admin-only) above chat content.
- **New gating** for "Allow chat": when `question.statementSettings?.hasChat === false`, hide the message input area entirely and show a small read-only banner ("Chat is paused by the facilitator", i18n key `facilitator.chat.paused`). Chat history stays readable. When the setting flips back ON, the input reappears.

### 5. Edit — `apps/join/src/components/SolutionCard.ts`

When `question.statementSettings?.hasChat === false`, hide the chat icon + counter on each SolutionCard (lines ~145-180). Removes the "tap to chat" affordance globally.

### 6. Edit — `apps/join/src/views/MainHub.ts`

Mount `FacilitatorPanel` (admin-only) so the facilitator can flip settings while on the hub before pushing participants down. The panel reads the current question only when the participant is on a question route — on the Hub it should still appear but be disabled with a hint ("Open a question to control its settings").

*Optional v1.1 alternative*: only mount on Solutions / Chat, since those are the views where settings actually apply. Decide during implementation.

### 7. Edit — `apps/join/src/lib/i18n.ts`

New keys for all 7 languages (en, he, ar, de, es, nl, fa):
- `facilitator.panel.handle` — "Facilitate"
- `facilitator.panel.title` — "Facilitator controls"
- `facilitator.toggle.threshold` — "Show only above threshold"
- `facilitator.toggle.threshold.help` — "Hide options whose consensus is below the threshold."
- `facilitator.toggle.threshold.value` — "Threshold: {{value}}"
- `facilitator.toggle.allowAdd` — "Allow add options"
- `facilitator.toggle.allowChat` — "Allow chat"
- `facilitator.chat.paused` — "Chat is paused by the facilitator"

### 8. New — append section to `apps/join/src/styles/_components.scss`

Drawer + handle + toggle row + slider styling. Uses existing design tokens (terra/teal/space/radius/shadow). Slide-in animation with `prefers-reduced-motion` fallback. Inline-end positioning works in both LTR and RTL. Match the `.facilitator-toast` visual language already in this file.

BEM names:
- `.facilitator-panel`, `.facilitator-panel--open`
- `.facilitator-panel__handle`
- `.facilitator-panel__backdrop`
- `.facilitator-panel__title`
- `.facilitator-panel__row`, `.facilitator-panel__row-label`, `.facilitator-panel__row-help`
- `.facilitator-panel__toggle`, `.facilitator-panel__toggle-track`, `.facilitator-panel__toggle-knob`
- `.facilitator-panel__slider`, `.facilitator-panel__slider-value`

## Critical Files (Reference Only — No Edits)

- `packages/shared-types/src/models/statement/StatementSettings.ts:129,134,142,148` — schema fields `enableAddEvaluationOption`, `enableAddVotingOption`, `showEvaluation`, `hasChat`
- `packages/shared-types/src/models/results/ResultsSettings.ts:15-25,34` — `cutoffBy`, `numberOfResults`, `minConsensus`, default 0.5
- `apps/join/src/lib/store.ts:181-234` — existing `getVisibleOptions()` already honours `cutoffBy`/`minConsensus` for toggle 1
- `apps/join/src/lib/store.ts:359+` — existing `subscribeQuestion()` drives real-time re-render
- `apps/join/src/lib/admin.ts` — `isAdmin()` for admin-only gating
- `src/controllers/db/statementSettings/setStatementSettings.ts:19-41` — main-app reference for the merge-write pattern (don't import; mirror in the join app's store)

## Out of v1 Scope

- **Toggle 4 (show consensus / `showEvaluation`)** — defer until the join app actually displays consensus values on cards. Today it doesn't; flipping the toggle would have no visible effect.
- **Participant-add-option flow** — adding the modal and the `createPlainOption` controller is a separate task. v1 only gates the existing admin add button.
- **Phase presets** — Tal explicitly preferred ad-hoc toggles over preset bundles. Revisit if/when more facilitators join.
- **Multi-question broadcast** — settings are still per-question. A "broadcast to all sub-questions under this main" affordance is v1.5.
- **Keyboard shortcut** ('f' to open drawer) — defer to v1.5; can ship with the click-handle only.

## Verification

### Manual end-to-end (single browser, two tabs)
1. Open the join app at `/m/{mainId}/q/{questionId}` as admin (Google sign-in upgrade if anonymous).
2. Confirm the "Facilitate" handle appears on the inline-end edge.
3. Open a second browser/incognito as an anonymous participant on the same URL.
4. Click the handle on the admin tab — drawer slides in.
5. Toggle **Allow chat OFF** → within ~1s the participant tab's chat input vanishes and the "Chat is paused" banner appears. SolutionCard chat icons disappear. Toggle ON → chat returns.
6. Toggle **Allow add options OFF** → the admin's "Add organizer suggestion" button on the participant tab disappears (admin still has the button on their own tab). Toggle ON → button returns.
7. Toggle **Show only above threshold ON** → only options with `consensus ≥ minConsensus` render on the participant tab. Drag the threshold slider → list updates live.
8. Refresh both tabs → all settings persist (read from Firestore).
9. Confirm the handle is hidden for the non-admin participant.

### Build & lint
```bash
cd apps/join && npm run typecheck && npm run build
```
Bundle delta should be small (single-digit KB).

### Regression
- Confirm Solutions cards are still display-only in facilitated mode (`/m/...`) — the new gating shouldn't accidentally re-enable affordances inside lockdown.
- Confirm chat posting still works when `hasChat` is the default (true / undefined).
- Confirm the threshold slider doesn't accidentally write `minConsensus` when the toggle is OFF (only writes when admin actively interacts after enabling).
