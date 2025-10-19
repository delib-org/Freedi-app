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

### 2. 🔄 Create SingleLikeEvaluation Component
- [ ] Create new component file: `src/view/pages/statement/components/evaluations/components/evaluation/singleLikeEvaluation/SingleLikeEvaluation.tsx`
- [ ] Create styles: `SingleLikeEvaluation.module.scss`
- [ ] Component features:
  - [ ] Display single like icon (heart or thumbs up)
  - [ ] Toggle between liked (1) and not liked (0) states
  - [ ] Show like count
  - [ ] Show percentage of users who liked
  - [ ] Handle click to toggle like status
  - [ ] Call `setEvaluationToDB()` with value 0 or 1
  - [ ] Visual feedback for current user's like status

### 3. 🔄 Update Evaluation Router Component
- [ ] Modify: `src/view/pages/statement/components/evaluations/components/evaluation/Evaluation.tsx`
- [ ] Replace boolean `enhancedEvaluation` check with `evaluationType` field check
- [ ] Add routing logic:
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

### 4. 🔄 Update Advanced Settings UI
- [ ] Modify: `src/view/pages/statement/components/settings/components/advancedSettings/AdvancedSettings.tsx`
- [ ] Remove or replace "Enhanced Evaluation" checkbox
- [ ] Add evaluation type selector (radio buttons or dropdown):
  - Like/Dislike (thumbs up/down)
  - Range (5-point emoji scale)
  - Single Like (like only)
- [ ] Update handler to set `evaluationType` instead of `enhancedEvaluation`

### 5. 🔄 Update Statement Settings
- [ ] Modify: `src/view/pages/statement/components/settings/emptyStatementModel.ts`
- [ ] Replace `enhancedEvaluation: true` with `evaluationType: 'range'` (or appropriate default)
- [ ] Ensure backward compatibility if needed

### 6. ✅ Database Validation (No Changes Needed)
- [x] Keep existing validation in `setEvaluation.ts` (-1 to 1 range)
- [x] SingleLike will only send 0 or 1 values from UI
- [x] No backend validation changes required

### 7. 🔄 Update Helper Functions
- [ ] Modify: `src/view/pages/statement/components/evaluations/statementsEvaluationCont.ts`
- [ ] Update `getEvaluationThumbIdByScore()` to handle single-like
- [ ] Update `getEvaluationThumbsToDisplay()` if needed
- [ ] Update consensus calculation for single-like (percentage of likes)

### 8. 🔄 Update Other Components
- [ ] `src/view/pages/suggestionChat/suggestionComment/evaluationPopup/EvaluationPopup.tsx`
  - [ ] Check evaluation type and render appropriate UI
- [ ] `src/view/pages/statement/components/map/components/nodeMenu/NodeMenu.tsx`
  - [ ] Check evaluation type and render appropriate component

### 9. 🔄 Migration Strategy
- [ ] Handle existing statements with `enhancedEvaluation` boolean
- [ ] Map `enhancedEvaluation: true` → `evaluationType: 'range'`
- [ ] Map `enhancedEvaluation: false` → `evaluationType: 'like-dislike'`

### 10. 🔄 Testing
- [ ] Test creating new statements with each evaluation type
- [ ] Test evaluation UI for each type
- [ ] Test that values are correctly saved (0/1 for single-like)
- [ ] Test consensus calculations
- [ ] Test migration of existing statements
- [ ] Test on mobile and desktop views

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