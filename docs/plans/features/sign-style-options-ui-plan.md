# Plan: Sign-Style Options UI in Main App

## Context
The main app's options tab currently uses `SuggestionCards`/`SuggestionCard` components with a row-reverse card layout. The Sign app has a cleaner, more polished suggestion UI with vertical card stacks, inline voting, sort controls at top, and author info. We want to bring the Sign app's visual/UX patterns to the main app's options tab while keeping all main-app-specific features (joining, rooms, AI improve, images, hidden state, etc.).

**Scope**: Only the `options` tab when `EvaluationUI.suggestions` is active (not tree view, not chat, not questions, not voting/clustering modes).

**Data structure**: No changes needed. `Statement` from `@freedi/shared-types` already has `reasoning`, `creator` (with `displayName`), `consensus`, `evaluation` (with `numberOfProEvaluators`/`numberOfConEvaluators`). All fields needed are already present.

---

## Phase 1: SCSS Foundation

### 1a. Create `src/view/style/atoms/_option-sort-bar.scss`
Grouped segmented button bar (Consensus | Random | Newest) + Freeze toggle button.
- BEM: `.option-sort-bar`, `__group`, `__button`, `__freeze-btn`
- Modifiers: `--active`, `--frozen`, `--disabled`
- Adapt from Sign's `SortControls.module.scss` but use main app tokens
- RTL support, responsive (smaller on mobile), high contrast

### 1b. Create `src/view/style/molecules/_option-card.scss`
New card layout replacing the row-reverse design with vertical stack.
- BEM: `.option-card`, `__header`, `__avatar`, `__author`, `__date`, `__menu`, `__content`, `__text`, `__reasoning`, `__evaluation`, `__actions`, `__badges`, `__image`, `__join-area`, `__hidden-badge`, `__unhide-btn`, `__voting-winner-badge`
- Modifiers: `--new`, `--hidden`, `--community`, `--winner`, `--below-minimum`, `--above-minimum`, `--exceeds-maximum`, `--expanded`
- 3px left accent border (like Sign), vertical layout, card-base mixin
- RTL, high contrast, responsive

### 1c. Create `src/view/style/molecules/_inline-voting-bar.scss`
Thumbs up | Consensus score | Thumbs down - inline in card.
- BEM: `.inline-voting-bar`, `__vote-button`, `__vote-count`, `__consensus-score`, `__consensus-loader`, `__dot`
- Modifiers: `--upvote`, `--downvote`, `--active`, `--voting`, `--positive`, `--negative`, `--disabled`
- Vote pulse animation, consensus loading dots animation
- Adapt from Sign's voting bar styles, use main app color tokens (`--agree`, `--disagree`)

### 1d. Update index files
- `src/view/style/atoms/_index.scss` - add `@forward 'option-sort-bar'`
- `src/view/style/molecules/_index.scss` - add `@forward 'option-card'` and `@forward 'inline-voting-bar'`

---

## Phase 2: React Components

### 2a. `src/view/components/atomic/atoms/OptionSortBar/OptionSortBar.tsx`
Props: `activeSort`, `onSortChange`, `isFrozen`, `onToggleFreeze`, `sortOptions`, `disabled`
- Renders segmented button group + freeze button
- Uses `useTranslation()`, `clsx` for BEM classes
- Minimal SCSS module file alongside

### 2b. `src/view/components/atomic/molecules/OptionCard/InlineVotingBar.tsx`
Props: `statement`, `userId`, `disabled`
- Thumbs up/down with counts + consensus score display
- Uses Redux `evaluationSelector` for user's current vote
- Calls existing `setEvaluationToDB` for voting
- Optimistic UI updates via local state
- Loading dots animation for consensus calculation

### 2c. `src/view/components/atomic/molecules/OptionCard/OptionCardHeader.tsx`
Props: `statement`, `parentStatement`, `isAdmin`, callbacks for menu
- Avatar circle (first letter of creator displayName)
- Author name, relative date
- Reuses existing `SolutionMenu` component

### 2d. `src/view/components/atomic/molecules/OptionCard/OptionCardContent.tsx`
Props: `statement`, `parentStatement`, `isEdit`, edit callbacks
- Reuses existing `EditableStatement` for text display/edit
- Show more/less for long text
- New: reasoning section (light bg, italic) when `statement.reasoning` exists
- Image display (reuses existing pattern)

### 2e. `src/view/components/atomic/molecules/OptionCard/OptionCardEvaluation.tsx`
Props: `statement`, `parentStatement`
- Routes to existing `Evaluation` component (SimpleEvaluation, Enhanced, SingleLike, CommunityVoice)
- OR renders `InlineVotingBar` when evaluation type is `like-dislike`
- Keeps all existing evaluation types working

### 2f. `src/view/components/atomic/molecules/OptionCard/OptionCardActions.tsx`
Props: factored from current SuggestionCard actions
- Join button, room badge, AI improve, undo, add image, member count, chat-more, badges

### 2g. `src/view/components/atomic/molecules/OptionCard/OptionCard.tsx`
Assembles all sub-components. Props similar to current `SuggestionCard`.
- Vertical layout: Header -> Content -> Evaluation -> Actions
- All existing features preserved (hidden, winner badge, community, joining states)

### 2h. `src/view/components/atomic/molecules/OptionCardList/OptionCardList.tsx`
Replaces `SuggestionCards` as the list orchestrator.
- `OptionSortBar` at top
- Sorting logic (extracted from current SuggestionCards)
- Freeze/unfreeze state (captures sorted list into ref when frozen)
- FLIP animations via `react-flip-toolkit`
- Submit mode button (existing feature)
- Empty state / loading skeletons

---

## Phase 3: Integration

### 3a. Modify `src/view/pages/statement/components/statementTypes/stage/StagePage.tsx`
- In `StagePageSwitch`, change `case EvaluationUI.suggestions` to render `OptionCardList` (lazy loaded) instead of `SuggestionCards`
- Keep `SuggestionCards` importable for fallback if needed

### 3b. Modify `src/view/pages/statement/components/nav/bottom/StatementBottomNav.tsx`
- When new sort bar is active, hide the sort menu section from bottom nav
- Add Option FAB button and hidden cards toggle remain unchanged

---

## Phase 4: Translations
Add missing keys to all 7 files in `packages/shared-i18n/src/languages/`:
- `"Freeze order"`, `"Stop live updates"` (some like "Resume", "Consensus", "Random", "Newest", "Sort by" already exist)
- `"Just now"`, `"minutes ago"`, `"hours ago"`, `"days ago"` (for relative dates if not already present)
- `"Anonymous"` (fallback for missing creator name)
- `"Reasoning"` (label for reasoning section)

---

## Phase 5: Testing

Unit tests:
- `OptionSortBar.test.tsx` - sort buttons, active state, freeze toggle
- `InlineVotingBar.test.tsx` - vote states, optimistic update, disabled for owner
- `OptionCard.test.tsx` - card rendering with various statement states
- `OptionCardList.test.tsx` - sorting, freeze, empty state

Manual testing:
- All 4 evaluation types render correctly in new card layout
- RTL mode (Hebrew, Arabic)
- High contrast mode
- Mobile responsive
- FLIP animations on sort change
- Freeze/unfreeze behavior
- All preserved features: joining, rooms, images, AI improve, hidden, menu

---

## Key Files Reference

**Files to create:**
- `src/view/style/atoms/_option-sort-bar.scss`
- `src/view/style/molecules/_option-card.scss`
- `src/view/style/molecules/_inline-voting-bar.scss`
- `src/view/components/atomic/atoms/OptionSortBar/OptionSortBar.tsx` + `.module.scss`
- `src/view/components/atomic/molecules/OptionCard/OptionCard.tsx` + sub-components + `.module.scss`
- `src/view/components/atomic/molecules/OptionCardList/OptionCardList.tsx` + `.module.scss`

**Files to modify:**
- `src/view/style/atoms/_index.scss`
- `src/view/style/molecules/_index.scss`
- `src/view/pages/statement/components/statementTypes/stage/StagePage.tsx`
- `src/view/pages/statement/components/nav/bottom/StatementBottomNav.tsx`
- `packages/shared-i18n/src/languages/*.json` (7 files)

**Files to reference (not modify):**
- `apps/sign/src/components/suggestions/Suggestion.module.scss` - Visual reference
- `apps/sign/src/components/suggestions/SuggestionThread.module.scss` - Layout reference
- `apps/sign/src/components/suggestions/VotingBar.tsx` - Voting bar logic reference
- `src/view/pages/statement/components/evaluations/components/suggestionCards/suggestionCard/SuggestionCard.tsx` - Logic to decompose
- `src/view/pages/statement/components/evaluations/components/evaluation/Evaluation.tsx` - Evaluation router to reuse
- `src/view/style/_mixins.scss` - Existing mixins to use

**Existing utilities to reuse:**
- `statementOptionsSelector` from `src/redux/statements/statementsSlice.ts`
- `evaluationSelector` from Redux
- `setEvaluationToDB` from `src/controllers/db/evaluation/setEvaluation.ts`
- `SolutionMenu` component (reuse as-is in OptionCardHeader)
- `EditableStatement` component (reuse in OptionCardContent)
- `Evaluation` component (reuse in OptionCardEvaluation)
- `react-flip-toolkit` Flipper/Flipped (already a dependency)
- `sortStatements` helper from current SuggestionCards
- `useTranslation()` from `@freedi/shared-i18n`

---

## Verification
1. `npm run dev` - options tab renders new UI
2. `npm run lint` - no lint errors
3. `npm run typecheck` - no type errors
4. `npm run build` - builds successfully
5. Manual: test all evaluation types, RTL, high contrast, mobile, freeze/sort, join/rooms, hidden cards, AI improve
