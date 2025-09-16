# Task: Suggestion Improvement Feature

## Overview
Implement an AI-powered suggestion improvement feature within the SuggestionCard component that helps users articulate their thoughts better and create more effective suggestions.

## Core Requirements

### 1. UI Components
- **Improve Button**: Add a button to the existing SuggestionCard component
  - Label: "Improve" or similar (localized)
  - Position: Integrated within the card's action area

- **Undo Button**: Add an undo button that appears after improvement
  - Label: "Undo" (localized)
  - Visible only when suggestion has been improved
  - Reverts to original text before AI improvement

- **Improvement Modal**: Create a modal dialog that opens when the button is clicked
  - Contains a text input field for improvement instructions
  - Optional: User can leave the field empty for automatic AI improvement
  - Action buttons: "Improve" and "Cancel"

### 2. Functionality

#### User Flow:
1. User views a suggestion in the SuggestionCard
2. User clicks the "Improve" button
3. Modal opens with instruction field
4. User either:
   - Enters specific improvement instructions, OR
   - Leaves field empty for automatic improvement
5. User clicks "Improve" in modal
6. AI processes the request and returns improved suggestion
7. SuggestionCard updates with the improved text in edit mode (automatically enabled)
8. User can further edit the AI-improved suggestion
9. User can click "Undo" button to revert to original text

#### AI Integration:
- **Language Detection**: Automatically detect the language of the original suggestion
- **Response Language**: Generate improved suggestion in the same language as the original
- **Improvement Logic**:
  - With instructions: Follow user's specific guidance
  - Without instructions: Automatically enhance clarity, structure, and articulation

### 3. Technical Implementation

#### Frontend Components to Modify/Create:
- `SuggestionCard.tsx`: Add improve button
- `ImprovementModal.tsx`: New modal component
- Firebase function call integration

#### Backend Implementation (Firebase Functions):
- **New Function**: `improveSuggestion`
  - Input:
    - Original suggestion text
    - User instructions (optional)
    - Language code (optional, for detection)
  - Processing:
    - Detect language if not provided
    - Apply AI improvement logic
    - Return improved suggestion in same language
  - Output: Improved suggestion text

#### State Management:
- Track modal open/close state
- Handle loading state during Firebase function execution
- Store original suggestion text for undo functionality
- Update suggestion text after improvement
- Automatically enable edit mode after improvement
- Track improvement status (improved/original)

#### Error Handling:
- Handle Firebase function failures gracefully
- Show appropriate error messages to user
- Maintain original suggestion if improvement fails
- Implement timeout for function calls

### 4. Localization
- All UI text should use the existing i18n system
- Support for multiple languages in:
  - Button labels
  - Modal content
  - Error messages
  - Placeholder text

### 5. Acceptance Criteria
- [ ] Improve button visible on SuggestionCard
- [ ] Modal opens/closes properly
- [ ] AI improvement works with custom instructions
- [ ] AI improvement works without instructions (auto-improve)
- [ ] Language detection and response in same language
- [ ] Loading states properly displayed
- [ ] Edit mode automatically enabled after improvement
- [ ] User can further edit the AI-improved suggestion
- [ ] Undo button appears after improvement
- [ ] Undo button reverts to original text
- [ ] Error handling implemented
- [ ] All text properly localized
- [ ] ESLint and TypeScript checks pass

## Architecture Plan for Suggestion Improvement Feature

### Current Architecture Analysis:
- **SuggestionCard**: Located at `src/view/pages/statement/components/evaluations/components/suggestionCards/suggestionCard/SuggestionCard.tsx`
- **Firebase Functions**: Use Google Generative AI (Gemini) for AI tasks
- **Modal Pattern**: Simple modal component at `src/view/components/modal/Modal.tsx`
- **Localization**: JSON files in `src/assets/Languages/`
- **HTTP Functions**: Called via fetch to endpoints like `checkForSimilarStatements`

### Proposed Architecture:

#### 1. Frontend Components:
- **Modify SuggestionCard.tsx**:
  - Add "Improve" button below the suggestion text
  - Add "Undo" button (conditionally displayed after improvement)
  - Import and use new ImprovementModal component
  - Store original suggestion text for undo functionality
  - Handle improved suggestion state update
  - Automatically enable EditableStatement component's edit mode after improvement
  - Implement undo functionality to restore original text

- **Create ImprovementModal.tsx**:
  - New modal component in `/src/view/components/improvementModal/`
  - Contains textarea for improvement instructions
  - Loading state during AI processing
  - Cancel and Improve buttons

#### 2. Backend Firebase Function:
- **Create `improveSuggestion` function** in `functions/src/fn_improveSuggestion.ts`:
  - Accept: original text, improvement instructions (optional), language code
  - Use existing AI service (Gemini) for improvement
  - Return improved suggestion in same language

- **Update AI Service** (`functions/src/services/ai-service.ts`):
  - Add new method `improveSuggestion()`
  - Implement language detection
  - Handle both guided and automatic improvements

#### 3. Frontend-Backend Integration:
- **Create API service** at `src/services/suggestionImprovement.ts`:
  - Similar pattern to `similarOptions.ts`
  - Handle HTTP call to Firebase function
  - Error handling and timeout management

#### 4. State Management:
- Use local component state in SuggestionCard for:
  - Modal visibility
  - Loading state
  - Original suggestion text (for undo)
  - Improved suggestion text
  - Improvement status flag
  - Edit mode trigger
- Update Redux state if needed for persistence
- Integrate with existing EditableStatement component's forceEditing prop

#### 5. Localization:
- Add new translation keys to all language files:
  - "Improve" button label
  - "Undo" button label
  - "Improve Suggestion" modal title
  - "Enter improvement instructions (optional)" placeholder
  - "Improving..." loading text
  - Error messages

### Implementation Steps:
1. Create backend Firebase function for suggestion improvement
2. Update AI service with improvement logic
3. Create ImprovementModal component
4. Integrate modal into SuggestionCard
5. Create frontend API service for Firebase function calls
6. Add translations for all supported languages
7. Test with multiple languages
8. Add error handling and loading states

## Next Steps
1. Locate and analyze the existing SuggestionCard component
2. Design the modal component structure
3. Implement AI service integration
4. Add necessary translations
5. Test with multiple languages
6. Ensure code quality standards are met