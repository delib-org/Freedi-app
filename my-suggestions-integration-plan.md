# My Suggestions Integration Plan for Mass Consensus Flow

## Overview
This document outlines the plan to integrate "My Suggestions" as an admin-controlled step in the mass consensus process flow. The feature allows administrators to include a step where users can view and manage their own suggestions during the mass consensus journey.

## Current System Understanding

### Existing Architecture
1. **Mass Consensus Flow**: A multi-step process that users go through, currently including:
   - Introduction
   - User Demographics
   - Question
   - Random Suggestions
   - Top Suggestions
   - Voting
   - Leave Feedback
   - Thank You

2. **Process Settings**: Located in statement settings, allows admins to:
   - View all steps in the process
   - Drag-and-drop to reorder steps
   - Delete unwanted steps
   - Configure different flows for different login types (default, Google, anonymous)

3. **My Suggestions Page**: Currently exists as a separate route (`/my-suggestions/statement/:statementId`) where users can view their own suggestions for a statement.

## The Logic

### Why This Integration Makes Sense
1. **User Journey Continuity**: Instead of users having to navigate away from the mass consensus flow to see their suggestions, it becomes part of the guided experience.

2. **Admin Control**: Admins can decide:
   - Whether to include "My Suggestions" in the flow at all
   - Where it appears in the sequence (e.g., after seeing top suggestions but before voting)
   - Different configurations for different user types

3. **Conditional Display**: The step should only appear for users who have actually created suggestions, preventing empty screens.

### How It Works
1. **Enum Addition**: `MassConsensusPageUrls.mySuggestions` has been added to delib-npm package
2. **Component Creation**: A new component wraps the existing MySuggestions logic within the mass consensus navigation context
3. **Routing**: The new route is added to the mass consensus children routes
4. **Admin Configuration**: Through the existing ProcessSetting component, admins can manage this step

## Implementation Plan

### Phase 1: Component Creation
Create a new component that integrates MySuggestions into the mass consensus flow:
- **Location**: `/src/view/pages/massConsensus/mySuggestions/MassConsensusMySuggestions.tsx`
- **Purpose**: Wrapper component that combines MySuggestions functionality with mass consensus navigation
- **Key Features**:
  - Shows user's own suggestions
  - Includes mass consensus header with navigation
  - Integrates with the step progression system

### Phase 2: Routing Integration
Update the mass consensus routes to include the new page:
- **File**: `/src/routes/massConsensusRoutes.ts`
- **Addition**: New route for `MassConsensusPageUrls.mySuggestions`
- **Component**: Links to the new MassConsensusMySuggestions component

### Phase 3: Process Configuration
Make mySuggestions available in the admin settings:
- **Option 1**: Add to default process (in `/src/model/massConsensus/massConsensusModel.ts`)
- **Option 2**: Keep it optional - admins explicitly add it when needed
- **Recommendation**: Option 2 - keeps it optional and admin-controlled

### Phase 4: Add Step Functionality (if needed)
If not already present, add ability for admins to add available steps:
- UI button to "Add Step"
- Dropdown of available steps not currently in the process
- Adds selected step to the process list

### Phase 5: Conditional Logic
Implement smart visibility:
- Only show mySuggestions step if user has suggestions
- Similar to how userDemographics is hidden when no demographic questions exist
- Prevents empty/confusing screens

## Technical Details

### File Structure
```
src/view/pages/massConsensus/
├── mySuggestions/
│   ├── MassConsensusMySuggestions.tsx
│   ├── MassConsensusMySuggestions.module.scss
│   └── MassConsensusMySuggestionsVM.ts (if needed)
```

### Dependencies
- Existing MySuggestions component logic
- Mass consensus navigation system
- Redux selectors for user suggestions
- Statement subscription system

### Database Structure
- No new database fields required
- Uses existing MassConsensusProcess structure
- Steps array includes `{ screen: MassConsensusPageUrls.mySuggestions }`

## TODO List

### Development Tasks
- [ ] Create `/src/view/pages/massConsensus/mySuggestions/` directory
- [ ] Implement `MassConsensusMySuggestions.tsx` component
  - [ ] Import and reuse logic from existing MySuggestions component
  - [ ] Add mass consensus header with navigation
  - [ ] Handle empty state (no suggestions)
  - [ ] Integrate with step progression
- [ ] Create `MassConsensusMySuggestions.module.scss` for styling
- [ ] Update `/src/routes/massConsensusRoutes.ts`
  - [ ] Import new component
  - [ ] Add route entry for `MassConsensusPageUrls.mySuggestions`
- [ ] Optionally update `/src/model/massConsensus/massConsensusModel.ts`
  - [ ] Add mySuggestions to default process (if desired)
- [ ] Implement "Add Step" functionality in ProcessSetting (if not exists)
  - [ ] UI to add available but unused steps
  - [ ] Database update logic

### Testing Tasks
- [ ] Test component renders correctly in mass consensus flow
- [ ] Verify navigation (previous/next) works properly
- [ ] Test admin can see mySuggestions in process settings
- [ ] Verify drag-and-drop reordering works
- [ ] Test delete functionality for mySuggestions step
- [ ] Verify different login type configurations
- [ ] Test conditional display (only shows when user has suggestions)
- [ ] Check responsive design
- [ ] Test with multiple users/suggestions

### Documentation Tasks
- [ ] Update user documentation about new mass consensus step
- [ ] Document admin configuration options
- [ ] Add inline code comments for future maintenance

## Success Criteria
1. Admins can add/remove mySuggestions from mass consensus flow
2. Admins can position mySuggestions anywhere in the sequence via drag-and-drop
3. Users with suggestions see their suggestions as part of the flow
4. Users without suggestions skip this step automatically
5. Navigation flows smoothly through all steps
6. Different configurations work for different login types

## Notes
- The beauty of this implementation is that it leverages the existing infrastructure
- No changes needed to the core drag-and-drop or database logic
- The ProcessSetting component already handles reordering and persistence
- This pattern can be used to add other optional steps in the future

## Future Enhancements
- Add configuration for minimum number of suggestions before showing the step
- Allow customization of the mySuggestions page text per statement
- Add analytics to track how many users view their suggestions during the flow
- Consider adding filters or sorting options within the mySuggestions step