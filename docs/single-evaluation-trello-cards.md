# Single Evaluation Feature - Trello Cards

## Card 1: Add Single Evaluation Setting to Admin Panel
**Title:** Add Single Evaluation Toggle to Statement Settings
**Priority:** High
**Story Points:** 3

**Description:**
Add a new evaluation type option "Single Like" to the statement settings admin panel that allows administrators to enable single-choice voting mode where each user can only select one option.

**Acceptance Criteria:**
- [ ] New checkbox appears in Advanced Settings under "Evaluation & Voting" section
- [ ] Checkbox labeled "Single Like (הצבעה בודדת)"
- [ ] Setting saved to `statementSettings.evaluationType` field
- [ ] Setting persists after page reload
- [ ] Setting can be toggled on/off by statement admins
- [ ] When enabled, overrides standard and enhanced evaluation modes

**Technical Tasks:**
- [ ] Update `AdvancedSettings.tsx` to add Single Like checkbox
- [ ] Add `evaluationType` field to StatementSettings type in delib-npm
- [ ] Update `setStatementSettingToDB` to handle evaluationType
- [ ] Add Hebrew translation for "Single Like Voting"
- [ ] Test setting persistence in Firestore

**Files to Modify:**
- `/src/view/pages/statement/components/settings/components/advancedSettings/AdvancedSettings.tsx`
- `/src/controllers/db/statementSettings/setStatementSettings.ts`

---

## Card 2: Create SingleLikeEvaluation Component
**Title:** Build Single Like Evaluation Component
**Priority:** High
**Story Points:** 5

**Description:**
Create a new evaluation component that implements single-choice voting where users can select only one option from all available options. The component should provide clear visual feedback for the selected state.

**Acceptance Criteria:**
- [ ] Component displays vote/like button for each option
- [ ] Only one option can be selected per user (evaluation = 1)
- [ ] Non-selected options have evaluation = 0
- [ ] Selected option shows clear visual indication (checkmark, highlight, etc.)
- [ ] Clicking selected option deselects it (sets evaluation to 0)
- [ ] Vote count displayed for each option (count of evaluation = 1)
- [ ] Responsive design for mobile and desktop
- [ ] Loading state while evaluation is being saved
- [ ] Error handling with user feedback

**Technical Tasks:**
- [ ] Create `SingleLikeEvaluation.tsx` component
- [ ] Create `SingleLikeEvaluation.module.scss` for styling
- [ ] Implement evaluation state management
- [ ] Add vote count display logic
- [ ] Add loading and error states
- [ ] Create unit tests for component

**Files to Create:**
- `/src/view/pages/statement/components/evaluations/components/evaluation/singleLike/SingleLikeEvaluation.tsx`
- `/src/view/pages/statement/components/evaluations/components/evaluation/singleLike/SingleLikeEvaluation.module.scss`

---

## Card 3: Update Evaluation Router Component
**Title:** Add SingleLike Routing to Evaluation Component
**Priority:** High
**Story Points:** 2

**Description:**
Update the main Evaluation component to check for singleLike evaluation type and route to the appropriate evaluation component.

**Acceptance Criteria:**
- [ ] Evaluation component checks `parentStatement.statementSettings?.evaluationType`
- [ ] Routes to SingleLikeEvaluation when `evaluationType === "singleLike"`
- [ ] Falls back to standard evaluation modes when not singleLike
- [ ] No breaking changes to existing evaluation modes

**Technical Tasks:**
- [ ] Import SingleLikeEvaluation component
- [ ] Add conditional check for evaluationType
- [ ] Test routing with different evaluation types
- [ ] Ensure backward compatibility

**Files to Modify:**
- `/src/view/pages/statement/components/evaluations/components/evaluation/Evaluation.tsx`

---

## Card 4: Update Evaluation Logic for Single Selection
**Title:** Implement Single Selection Constraint in Evaluation System
**Priority:** High
**Story Points:** 5

**Description:**
Modify the evaluation submission logic to enforce single selection constraint where selecting one option automatically deselects all other options under the same parent statement.

**Acceptance Criteria:**
- [ ] When user likes option A (evaluation = 1), all other options automatically set to evaluation = 0
- [ ] Only one option can have evaluation = 1 per user at any time
- [ ] Clicking an already liked option unlikes it (sets evaluation = 0)
- [ ] Evaluation updates happen in single transaction
- [ ] Previous evaluations are properly cleared (set to 0, not deleted)
- [ ] Vote counts update correctly (sum of evaluation = 1)
- [ ] Handles race conditions properly

**Technical Tasks:**
- [ ] Modify `setEvaluationToDB` function for singleLike mode
- [ ] Add transaction to update all sibling evaluations to 0 when one is set to 1
- [ ] Query and update previous user evaluations (set to 0, not delete)
- [ ] Update evaluation aggregation logic (count evaluations = 1)
- [ ] Add error handling and rollback
- [ ] Test concurrent evaluation scenarios

**Files to Modify:**
- `/src/controllers/db/evaluation/setEvaluation.ts`
- `/src/controllers/db/evaluation/getEvaluation.ts`

---

## Card 5: Update Suggestion Cards for Single Evaluation
**Title:** Adapt Suggestion Cards UI for Single Like Mode
**Priority:** Medium
**Story Points:** 3

**Description:**
Update the suggestion card components to properly display and handle single evaluation mode, showing clear selection states and preventing multiple selections.

**Acceptance Criteria:**
- [ ] Suggestion cards show radio button or single select UI in singleLike mode
- [ ] Clear visual distinction between selected and unselected cards
- [ ] Selected state persists on page refresh
- [ ] Vote count displays accurately
- [ ] Smooth transition animations for selection changes
- [ ] Mobile-friendly touch targets

**Technical Tasks:**
- [ ] Update SuggestionCard component to detect singleLike mode
- [ ] Modify card styling for selected state
- [ ] Update click handlers for single selection
- [ ] Add visual feedback for selection change
- [ ] Test on mobile devices

**Files to Modify:**
- `/src/view/pages/statement/components/evaluations/components/suggestionCards/suggestionCard/SuggestionCard.tsx`
- `/src/view/pages/statement/components/evaluations/components/suggestionCards/suggestionCard/SuggestionCard.module.scss`

---

## Card 6: Add Cloud Function for Single Evaluation Processing
**Title:** Create Cloud Function to Process Single Evaluations
**Priority:** Medium
**Story Points:** 3

**Description:**
Create or update cloud function to handle single evaluation processing, ensuring data consistency and calculating results correctly for single-choice voting.

**Acceptance Criteria:**
- [ ] Cloud function triggers on evaluation write
- [ ] Validates single selection constraint server-side
- [ ] Updates statement selection counts
- [ ] Calculates top voted option
- [ ] Handles evaluation removal correctly
- [ ] Performs efficiently at scale

**Technical Tasks:**
- [ ] Create/update `fn_singleEvaluation.ts`
- [ ] Add validation for single selection
- [ ] Update aggregation logic
- [ ] Add transaction support
- [ ] Deploy and test function

**Files to Create/Modify:**
- `/functions/src/fn_singleEvaluation.ts`

---

## Testing Checklist
- [ ] Single evaluation can be enabled/disabled from settings
- [ ] Only one option can be selected at a time (evaluation = 1)
- [ ] Other options automatically set to evaluation = 0
- [ ] Deselecting works properly (sets evaluation to 0)
- [ ] Vote counts are accurate (sum of evaluations = 1)
- [ ] No negative evaluation values used
- [ ] Works on mobile devices
- [ ] No performance degradation
- [ ] Backward compatible with existing evaluations

## Dependencies
- delib-npm package must be updated with evaluationType field
- Firebase Firestore rules may need updating for new fields

## Notes
- All UI text should support Hebrew translation
- Consider adding analytics events for single evaluation interactions
- Ensure accessibility standards are met (ARIA labels, keyboard navigation)