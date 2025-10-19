# Single Like Evaluation Implementation TODO

## Overview
Add a new evaluation type called "singleLike" where users can only like (evaluation = 1) or not like (evaluation = 0) a suggestion. No negative values allowed.

## Implementation Tasks

### 1. ✅ Prerequisites
- [x] evaluationType enum already exists in delib-npm with values:
  - `likeDislike = 'like-dislike'`
  - `range = 'range'`
  - `singleLike = 'single-like'`
- [x] StatementSettingsSchema already includes `evaluationType` field

### 2. ✅ Create SingleLikeEvaluation Component
- [x] Create new component file: `src/view/pages/statement/components/evaluations/components/evaluation/singleLikeEvaluation/SingleLikeEvaluation.tsx`
- [x] Create styles: `SingleLikeEvaluation.module.scss`
- [x] Component features:
  - [x] Display single like icon (using likeIcon.svg)
  - [x] Toggle between liked (1) and not liked (0) states
  - [x] Show like count
  - [x] Show percentage of users who liked
  - [x] Handle click to toggle like status
  - [x] Call `setEvaluationToDB()` with value 0 or 1
  - [x] Visual feedback for current user's like status

### 3. ✅ Update Evaluation Router Component
- [x] Modify: `src/view/pages/statement/components/evaluations/components/evaluation/Evaluation.tsx`
- [x] Replace boolean `enhancedEvaluation` check with `evaluationType` field check
- [x] Add routing logic:
  ```typescript
  switch(parentStatement.statementSettings?.evaluationType) {
    case 'single-like':
      return <SingleLikeEvaluation ... />
    case 'range':
      return <EnhancedEvaluation ... />
    case 'like-dislike':
    default:
      return <SimpleEvaluation ... />
  }
  ```

### 4. ✅ Update Advanced Settings UI
- [x] Modify: `src/view/pages/statement/components/settings/components/advancedSettings/AdvancedSettings.tsx`
- [x] Remove or replace "Enhanced Evaluation" checkbox
- [x] Add evaluation type selector (radio buttons):
  - Like/Dislike (thumbs up/down)
  - Range (5-point emoji scale)
  - Single Like (like only)
- [x] Update handler to set `evaluationType` instead of `enhancedEvaluation`

### 5. ✅ Update Statement Settings
- [x] Modify: `src/view/pages/statement/components/settings/emptyStatementModel.ts`
- [x] Replace `enhancedEvaluation: true` with `evaluationType: 'range'` (or appropriate default)
- [x] Ensure backward compatibility maintained

### 6. ✅ Database Validation (No Changes Needed)
- [x] Keep existing validation in `setEvaluation.ts` (-1 to 1 range)
- [x] SingleLike will only send 0 or 1 values from UI
- [x] No backend validation changes required

### 7. ✅ Update Helper Functions
- [x] Checked: `src/view/pages/statement/components/evaluations/statementsEvaluationCont.ts`
- [x] No changes needed - helper functions are specific to enhanced evaluation

### 8. ✅ Update Other Components
- [x] `src/view/pages/suggestionChat/suggestionComment/evaluationPopup/EvaluationPopup.tsx`
  - [x] Check evaluation type and render appropriate UI
- [x] `src/view/pages/statement/components/map/components/nodeMenu/NodeMenu.tsx`
  - [x] Check evaluation type and render appropriate component (now uses Evaluation router)

### 9. ✅ Migration Strategy
- [x] Handle existing statements with `enhancedEvaluation` boolean
- [x] Map `enhancedEvaluation: true` → `evaluationType: 'range'`
- [x] Map `enhancedEvaluation: false` → `evaluationType: 'like-dislike'`
- [x] Backward compatibility implemented in all components

### 10. ✅ Testing
- [x] Test creating new statements with each evaluation type
- [x] Test evaluation UI for each type
- [x] Test that values are correctly saved (0/1 for single-like)
- [x] Type checking passes
- [x] Development server runs without errors
- [x] CSS properly styled without undefined variables

## UI/UX Design Considerations
- Icon choice for single-like (heart vs thumbs up vs star)
- Visual states: empty/filled, hover, active
- Animation for like/unlike action
- Displaying like count and percentage
- Mobile responsiveness

## Notes
- Keep database validation at -1 to 1 for all types (no changes needed)
- SingleLike component will only send 0 or 1 values
- Ensure backward compatibility with existing evaluations
- Consider using existing Thumb component as base if applicable

## Status Legend
- ✅ Completed
- 🔄 In Progress
- ⏸️ On Hold
- ❌ Blocked
- [ ] Not Started