# Multi-Question Mass Consensus - UI Design Document

## Overview
This document defines the user interface design for the Multi-Question Mass Consensus system, leveraging existing components from Mass Consensus settings, Settings Modal, and the Questionnaire Settings UI pattern from the feature/questionnaire-ai branch.

## 1. Design Principles

### 1.1 Core UI Principles
- **Consistency**: Use existing Freedi design patterns and components
- **Progressive Disclosure**: Show complexity only when needed
- **Visual Hierarchy**: Clear distinction between session, questions, and steps
- **Responsive Design**: Works on desktop and mobile
- **Accessibility**: Full keyboard navigation and screen reader support

### 1.2 Design System Integration
```scss
// Existing design tokens from Freedi
$primary-color: var(--primary-color);
$secondary-color: var(--secondary-color);
$border-radius: 8px;
$card-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
$transition: all 0.3s ease;
```

## 2. Session Creation & Management UI

### 2.1 Session Settings Modal
Based on existing `SettingsModal` component pattern:

```typescript
interface MCSessionSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  session?: SimpleMCSession;
  mode: 'create' | 'edit';
}
```

#### Visual Design:
```
┌─────────────────────────────────────────────────────────┐
│  Create Multi-Question Session                      [X] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Session Details                                        │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Title: [_____________________________]          │   │
│  │                                                  │   │
│  │ Description:                                    │   │
│  │ [____________________________________________]  │   │
│  │ [____________________________________________]  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Shared Steps                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ☑ Introduction (once at start)                  │   │
│  │ ☑ User Demographics (once at start)            │   │
│  │ ☑ Feedback (once at end)                       │   │
│  │ ☑ Thank You (once at end)                      │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [Cancel]                    [Save & Add Questions]     │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Question Management Interface
Using native HTML5 drag-and-drop (like existing `ProcessSetting` component):

```
┌─────────────────────────────────────────────────────────┐
│  Session: Community Feedback                       [←] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Questions (3)                          [+ Add Question]│
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ⋮⋮  Q1  Park Improvements          [▼]          │   │
│  │     Type: Full Consensus                        │   │
│  │     Steps: 4 (question, random, top, voting)    │   │
│  │     draggable="true" (Native HTML5)              │   │
│  │                                                  │   │
│  │     [Expanded Settings Panel - Hidden by default]│   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ⋮⋮  Q2  Park Hours                 [▶]          │   │
│  │     Type: Quick Vote                            │   │
│  │     Steps: 1 (voting only)                      │   │
│  │     draggable="true" (Native HTML5)              │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ⋮⋮  Q3  Other Feedback             [▶]          │   │
│  │     Type: Text Input                            │   │
│  │     Steps: 1 (question only)                    │   │
│  │     Optional                                    │   │
│  │     draggable="true" (Native HTML5)              │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [Preview Session]          [Save Draft]    [Publish]  │
└─────────────────────────────────────────────────────────┘
```

## 3. Question Configuration UI

### 3.1 Add/Edit Question Modal
Based on `ProcessSetting` component pattern:

```
┌─────────────────────────────────────────────────────────┐
│  Configure Question                                 [X] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Basic Information                                      │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Question: [What improvements for the park?____] │   │
│  │                                                  │   │
│  │ Description (optional):                         │   │
│  │ [Please suggest and vote on improvements_____]  │   │
│  │                                                  │   │
│  │ Required: ☑                                     │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Question Type                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ◉ Full Consensus (all steps)                   │   │
│  │ ○ Quick Vote (voting only)                     │   │
│  │ ○ Brainstorm (suggestions only)                │   │
│  │ ○ Evaluate (rate existing)                     │   │
│  │ ○ Custom (choose steps)                        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Steps Configuration                                    │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Selected Steps (drag to reorder):              │   │
│  │                                                  │   │
│  │ ⋮⋮ 1. question           [⚙️] [🗑️]              │   │
│  │ ⋮⋮ 2. random-suggestions [⚙️] [🗑️]              │   │
│  │ ⋮⋮ 3. top-suggestions    [⚙️] [🗑️]              │   │
│  │ ⋮⋮ 4. voting             [⚙️] [🗑️]              │   │
│  │                                                  │   │
│  │ Available Steps:                                │   │
│  │ [+ initial-question]                            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [Cancel]                              [Save Question]  │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Step Configuration Panel
When clicking ⚙️ on a step:

```
┌─────────────────────────────────────────────────────────┐
│  Configure: Random Suggestions                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Number of suggestions to show: [6___] (1-20)          │
│                                                         │
│  Evaluation type:                                       │
│  ○ Thumbs (👍/👎)                                        │
│  ◉ Scale (1-5 stars)                                   │
│  ○ Points (-100 to +100)                               │
│                                                         │
│  [Cancel]                                      [Apply]  │
└─────────────────────────────────────────────────────────┘
```

## 4. Participant Experience UI

### 4.1 Session Progress Header
Persistent header showing overall progress:

```
┌─────────────────────────────────────────────────────────┐
│  Community Feedback Session                             │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  Question 2 of 3 | Step 1 of 1                    [?]  │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Question Transition Screen
Between questions:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                    ✓ Completed                          │
│                                                         │
│         Question 1: Park Improvements                   │
│                                                         │
│      Thank you for your suggestions and votes!          │
│                                                         │
│  ───────────────────────────────────────────────────    │
│                                                         │
│                    Next Question                        │
│                                                         │
│         Question 2: Park Hours                          │
│                                                         │
│      Should we extend park hours to 10 PM?              │
│                                                         │
│                                                         │
│            [Skip Question]        [Continue →]          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 4.3 Mobile-Responsive Question View
```
┌─────────────────────┐
│ Community Feedback  │
│ ━━━━━━━━━━━━━━━━━━ │
│ Q2/3 | Step 1/1     │
├─────────────────────┤
│                     │
│ Park Hours          │
│                     │
│ Should we extend    │
│ park hours?         │
│                     │
│  ┌───────────────┐  │
│  │      Yes      │  │
│  └───────────────┘  │
│                     │
│  ┌───────────────┐  │
│  │      No       │  │
│  └───────────────┘  │
│                     │
│ [Skip]    [Next →]  │
└─────────────────────┘
```

## 5. Component Architecture

### 5.1 Component Hierarchy
```
MCSessionManager/
├── MCSessionSettings/          // Session creation/edit
│   ├── SessionDetailsForm
│   ├── SharedStepsConfig
│   └── SessionActions
│
├── MCQuestionManager/          // Question list management
│   ├── QuestionList
│   │   └── QuestionCard (draggable)
│   ├── AddQuestionButton
│   └── QuestionModal/
│       ├── QuestionForm
│       ├── QuestionTypeSelector
│       └── StepsConfigurator
│
├── MCSessionRunner/            // Participant experience
│   ├── MCProgressHeader
│   ├── MCQuestionContainer/
│   │   ├── StepRenderer
│   │   └── StepNavigation
│   ├── MCTransitionScreen
│   └── MCSummaryScreen
│
└── MCSharedComponents/
    ├── MCModal (based on SettingsModal)
    ├── MCQuestionList (native HTML5 drag-drop like ProcessSetting)
    ├── MCStepBadge
    └── MCProgressBar
```

### 5.2 State Management
```typescript
interface MCUIState {
  // Creation/Edit Mode
  creation: {
    currentSession: SimpleMCSession | null;
    editingQuestion: SimpleMCQuestion | null;
    validationErrors: ValidationError[];
    isDirty: boolean;
  };
  
  // Participant Mode
  participation: {
    sessionProgress: {
      currentQuestionIndex: number;
      currentStepIndex: number;
      completedQuestions: string[];
      totalProgress: number; // percentage
    };
    ui: {
      isTransitioning: boolean;
      showSkipConfirm: boolean;
      expandedSections: string[];
    };
  };
}
```

## 6. Styling Guidelines

### 6.1 SCSS Structure
```scss
// Multi-Question specific styles
.mc-session {
  &__header {
    background: var(--header-bg);
    padding: 1rem;
    position: sticky;
    top: 0;
    z-index: 100;
  }
  
  &__progress {
    height: 4px;
    background: var(--progress-bg);
    border-radius: 2px;
    
    &-fill {
      background: var(--primary-color);
      transition: width 0.3s ease;
    }
  }
  
  &__question {
    &-card {
      background: white;
      border-radius: $border-radius;
      box-shadow: $card-shadow;
      margin-bottom: 1rem;
      transition: $transition;
      
      &--dragging {
        opacity: 0.5;
      }
      
      &--expanded {
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
      }
    }
  }
}
```

### 6.2 Animation Guidelines
```scss
// Transitions between questions
.mc-transition {
  &-enter {
    opacity: 0;
    transform: translateX(100%);
  }
  
  &-enter-active {
    opacity: 1;
    transform: translateX(0);
    transition: all 300ms ease-out;
  }
  
  &-exit {
    opacity: 1;
    transform: translateX(0);
  }
  
  &-exit-active {
    opacity: 0;
    transform: translateX(-100%);
    transition: all 300ms ease-in;
  }
}
```

## 7. Interaction Patterns

### 7.1 Drag and Drop (Using Native HTML5 - Same as ProcessSetting)
- Uses native HTML5 drag-and-drop API (no external library needed)
- Pattern identical to existing `ProcessSetting.tsx` implementation
- Visual feedback during drag (opacity change)
- Drop zones highlighted
- Smooth reordering animation
- Touch-friendly drag handles

```typescript
// Implementation pattern from ProcessSetting.tsx
const dragItem = useRef<number | null>(null);
const dragOverItem = useRef<number | null>(null);

const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
  dragItem.current = index;
  e.dataTransfer.effectAllowed = 'move';
};

const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, index: number) => {
  dragOverItem.current = index;
};

const handleDragEnd = () => {
  if (dragItem.current !== null && dragOverItem.current !== null) {
    const newQuestionsOrder = [...questions];
    const draggedItemContent = newQuestionsOrder[dragItem.current];
    newQuestionsOrder.splice(dragItem.current, 1);
    newQuestionsOrder.splice(dragOverItem.current, 0, draggedItemContent);
    setQuestions(newQuestionsOrder);
    // Save to database
  }
};
```

### 7.2 Progressive Disclosure
- Questions collapsed by default in manager
- Click to expand full settings
- Accordion pattern for step configurations
- Show advanced options only when needed

### 7.3 Form Validation
```typescript
// Real-time validation feedback
const validationRules = {
  session: {
    title: { required: true, maxLength: 100 },
    questions: { minCount: 1, maxCount: 20 }
  },
  question: {
    text: { required: true, maxLength: 500 },
    steps: { minCount: 1 }
  }
};
```

### 7.4 Navigation Patterns
- Breadcrumb navigation in creation mode
- Step indicators in participation mode
- Clear back/forward navigation
- Skip confirmations for optional questions

## 8. Responsive Design

### 8.1 Breakpoints
```scss
$breakpoints: (
  mobile: 320px,
  tablet: 768px,
  desktop: 1024px,
  wide: 1440px
);
```

### 8.2 Mobile Adaptations
- Full-width cards on mobile
- Bottom sheet pattern for modals
- Swipe gestures for navigation
- Collapsed progress info
- Touch-optimized buttons (min 44px)

### 8.3 Desktop Enhancements
- Side-by-side question preview
- Keyboard shortcuts
- Hover states for all interactive elements
- Multi-column layouts for settings

## 9. Accessibility

### 9.1 ARIA Labels
```html
<div role="region" aria-label="Question Configuration">
  <div role="list" aria-label="Selected Steps">
    <div role="listitem" aria-label="Step 1: Question">
      <!-- Step content -->
    </div>
  </div>
</div>
```

### 9.2 Keyboard Navigation
- Tab through all interactive elements
- Arrow keys for list navigation
- Space/Enter for selection
- Escape to close modals
- Custom shortcuts (Cmd+S to save)

### 9.3 Screen Reader Support
- Announce progress changes
- Read question transitions
- Describe drag and drop actions
- Provide context for all actions

## 10. Error States & Feedback

### 10.1 Error Display
```
┌─────────────────────────────────────────────────────────┐
│  ⚠️ Cannot Save Session                                 │
│                                                         │
│  Please fix the following issues:                       │
│  • Session must have at least one question              │
│  • Question 2 is missing required text                  │
│                                                         │
│  [Review Issues]                              [Dismiss] │
└─────────────────────────────────────────────────────────┘
```

### 10.2 Success Feedback
- Toast notifications for saves
- Checkmarks for completed questions
- Progress celebration animations
- Clear completion states

## 11. Loading States

### 11.1 Skeleton Screens
```
┌─────────────────────────────────────────────────────────┐
│  ░░░░░░░░░░░░░░░░░░░░                                  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░                │
│                                                         │
│  ░░░░░░░░░░░░                                          │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 11.2 Progressive Loading
1. Load session structure first
2. Load current question
3. Preload next question
4. Load previous responses async

## 12. Implementation Priorities

### Phase 1: Core UI (Week 1)
- Session creation modal
- Basic question list
- Simple question types

### Phase 2: Advanced Features (Week 2)
- Drag and drop reordering
- Step configuration
- Custom question types

### Phase 3: Polish (Week 3)
- Animations and transitions
- Mobile optimization
- Accessibility features

### Phase 4: Testing (Week 4)
- User testing
- Performance optimization
- Bug fixes

## Conclusion

This UI design leverages existing Freedi patterns while introducing new multi-question capabilities. The design prioritizes clarity, ease of use, and flexibility while maintaining consistency with the existing application design language.