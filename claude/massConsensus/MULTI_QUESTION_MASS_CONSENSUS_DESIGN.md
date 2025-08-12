# Multi-Question Mass Consensus - Feature Design

## Executive Summary

This document outlines the design for extending the Mass Consensus system to support multiple questions in a sequential flow, where participants complete all phases for each question before moving to the next.

## Current State vs. Desired State

### Current State
- Single question per Mass Consensus session
- One `statementId` represents the entire process
- Steps: Introduction → Demographics → Question → Suggestions → Voting → Feedback → ThankYou
- Process ends after one question

### Desired State
- Multiple questions in a single Mass Consensus session
- Sequential processing: Complete all phases of Q1, then Q2, then Q3, etc.
- Shared introduction and demographics (once at the beginning)
- Shared thank you and feedback (once at the end)
- Progress tracking across multiple questions

## Proposed Architecture

### 1. New Data Structure

#### MassConsensusSession
```typescript
export interface MassConsensusSession {
  sessionId: string;
  title: string;
  description: string;
  creatorId: string;
  questions: MassConsensusQuestionConfig[];
  sharedSteps: {
    introduction: boolean;
    demographics: boolean;
    feedback: boolean;
    thankYou: boolean;
  };
  createdAt: number;
  status: 'draft' | 'active' | 'completed';
}

export interface MassConsensusQuestionConfig {
  questionId: string;  // statementId of the question
  order: number;       // 1, 2, 3...
  question: string;    // Question text
  description?: string;
  steps: MassConsensusStep[];  // Steps specific to this question
  required: boolean;   // Can user skip this question?
}
```

#### Updated MassConsensusProcess
```typescript
export interface MassConsensusProcessV2 {
  sessionId: string;    // NEW: Links to session
  statementId: string;  // Still tracks individual question
  questionIndex: number; // NEW: Current question index (0-based)
  totalQuestions: number; // NEW: Total number of questions
  loginTypes: {
    [key in LoginType]: {
      steps: MassConsensusStep[];
      processName?: string;
      currentStep?: number;
      currentQuestion?: number; // NEW: Track which question user is on
    }
  }
}
```

#### User Progress Tracking
```typescript
export interface MassConsensusUserProgress {
  userId: string;
  sessionId: string;
  completedQuestions: {
    questionId: string;
    completedAt: number;
    skipped: boolean;
  }[];
  currentQuestionIndex: number;
  currentStepIndex: number;
  overallProgress: number; // Percentage
}
```

### 2. Flow Architecture

```
┌─────────────────────────────────────────────┐
│           MASS CONSENSUS SESSION            │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────────┐                          │
│  │ Introduction │ (Shared - Once)          │
│  └──────┬───────┘                          │
│         ▼                                   │
│  ┌──────────────┐                          │
│  │Demographics  │ (Shared - Once)          │
│  └──────┬───────┘                          │
│         ▼                                   │
│  ╔══════════════════════════════════╗      │
│  ║     QUESTION 1 CYCLE             ║      │
│  ║  ┌────────────┐                  ║      │
│  ║  │  Question  │                  ║      │
│  ║  └──────┬─────┘                  ║      │
│  ║         ▼                        ║      │
│  ║  ┌──────────────┐                ║      │
│  ║  │Random Suggest│                ║      │
│  ║  └──────┬───────┘                ║      │
│  ║         ▼                        ║      │
│  ║  ┌──────────────┐                ║      │
│  ║  │Top Suggest   │                ║      │
│  ║  └──────┬───────┘                ║      │
│  ║         ▼                        ║      │
│  ║  ┌──────────────┐                ║      │
│  ║  │   Voting     │                ║      │
│  ║  └──────────────┘                ║      │
│  ╚══════════╤═══════════════════════╝      │
│             ▼                               │
│  ╔══════════════════════════════════╗      │
│  ║     QUESTION 2 CYCLE             ║      │
│  ║         (Same structure)         ║      │
│  ╚══════════╤═══════════════════════╝      │
│             ▼                               │
│  ╔══════════════════════════════════╗      │
│  ║     QUESTION N CYCLE             ║      │
│  ║         (Same structure)         ║      │
│  ╚══════════╤═══════════════════════╝      │
│             ▼                               │
│  ┌──────────────┐                          │
│  │   Feedback   │ (Shared - Once)          │
│  └──────┬───────┘                          │
│         ▼                                   │
│  ┌──────────────┐                          │
│  │   Thank You  │ (Shared - Once)          │
│  └──────────────┘                          │
│                                             │
└─────────────────────────────────────────────┘
```

### 3. URL Routing Structure

#### Current Structure:
```
/mass-consensus/{statementId}/{step}
```

#### Proposed Structure:
```
/mass-consensus/{sessionId}/q/{questionIndex}/{step}

Examples:
/mass-consensus/session123/introduction
/mass-consensus/session123/demographics
/mass-consensus/session123/q/0/question
/mass-consensus/session123/q/0/random-suggestions
/mass-consensus/session123/q/0/voting
/mass-consensus/session123/q/1/question
/mass-consensus/session123/q/1/voting
/mass-consensus/session123/feedback
/mass-consensus/session123/thank-you
```

### 4. Component Updates

#### New Components Needed

##### SessionProgress.tsx
```typescript
interface SessionProgressProps {
  currentQuestion: number;
  totalQuestions: number;
  questionsCompleted: number[];
  currentStep: MassConsensusPageUrls;
}

// Shows: Question 2 of 5 | Step 3 of 6
// Visual progress bar for overall completion
```

##### QuestionTransition.tsx
```typescript
interface QuestionTransitionProps {
  completedQuestion: string;
  nextQuestion: string;
  onContinue: () => void;
  onSkip?: () => void;
}

// Shows between questions
// Summary of completed question
// Preview of next question
```

#### Updated Components

##### MassConsensus.tsx
```typescript
// Main container needs to:
- Load session configuration
- Track current question index
- Handle navigation between questions
- Manage shared vs. question-specific steps
```

##### MassConsensusVM.ts
```typescript
// Updated view model to handle:
- Multi-question navigation logic
- Step calculation per question
- Progress tracking
- Skip logic for optional questions
```

##### FooterMassConsensus.tsx
```typescript
// Enhanced navigation:
- "Next Question" button after voting
- "Skip Question" for optional questions
- Progress indicator
- Different button text based on context
```

### 5. State Management Updates

#### Redux State Structure
```typescript
interface MassConsensusState {
  // Existing
  similarStatements: Statement[] | GeneratedStatement[];
  massConsensusProcess: MassConsensusProcess[];
  
  // New
  currentSession: MassConsensusSession | null;
  userProgress: MassConsensusUserProgress | null;
  questionStates: {
    [questionId: string]: {
      suggestions: Statement[];
      evaluations: Evaluation[];
      votes: Vote[];
      completed: boolean;
    }
  };
}
```

#### New Actions
```typescript
- setCurrentSession(session: MassConsensusSession)
- updateUserProgress(progress: Partial<MassConsensusUserProgress>)
- completeQuestion(questionId: string)
- moveToNextQuestion()
- skipQuestion(questionId: string)
```

### 6. Database Schema Updates

#### New Collections

##### massConsensusSessions
```typescript
/massConsensusSessions/{sessionId}
{
  sessionId: string;
  title: string;
  description: string;
  questions: [{
    questionId: string;
    order: number;
    required: boolean;
  }];
  sharedSteps: {
    introduction: boolean;
    demographics: boolean;
    feedback: boolean;
  };
  createdAt: timestamp;
  creatorId: string;
  status: string;
}
```

##### massConsensusProgress
```typescript
/massConsensusProgress/{userId}_{sessionId}
{
  userId: string;
  sessionId: string;
  currentQuestionIndex: number;
  currentStepIndex: number;
  completedQuestions: [{
    questionId: string;
    completedAt: timestamp;
    skipped: boolean;
  }];
  lastUpdate: timestamp;
}
```

#### Updated Collections

##### massConsensusMembers
```typescript
// Add session tracking
{
  statementId: string;
  sessionId: string;  // NEW
  questionIndex: number; // NEW
  // ... existing fields
}
```

### 7. Implementation Strategy

#### Phase 1: Backend Foundation
1. Create session data model
2. Update Firebase schema
3. Create session management functions
4. Update process tracking

#### Phase 2: Navigation Logic
1. Update routing structure
2. Implement multi-question navigation
3. Add progress tracking
4. Handle skip logic

#### Phase 3: UI Components
1. Create progress indicators
2. Add question transition screens
3. Update existing components
4. Enhance navigation controls

#### Phase 4: State Management
1. Update Redux slices
2. Add session management
3. Implement progress persistence
4. Handle offline scenarios

### 8. Migration Path

#### Backward Compatibility
- Detect single vs. multi-question mode
- Single questions create implicit session
- Existing URLs redirect to new structure
- Gradual rollout with feature flag

#### Migration Steps
```typescript
// Auto-wrap single questions in sessions
if (!session && statementId) {
  session = {
    sessionId: generateId(),
    questions: [{
      questionId: statementId,
      order: 1
    }],
    // ... defaults
  }
}
```

### 9. User Experience Enhancements

#### Progress Persistence
- Save progress after each step
- Allow users to resume sessions
- Handle browser refresh gracefully
- Sync across devices

#### Smart Navigation
- Breadcrumb navigation
- Jump to specific question
- Review completed questions
- Change answers before final submission

#### Analytics Integration
- Track completion rates per question
- Identify drop-off points
- Measure time per question
- Compare question difficulty

### 10. API Endpoints

#### New Endpoints Needed
```typescript
// Session Management
POST   /api/mass-consensus/sessions          // Create session
GET    /api/mass-consensus/sessions/{id}     // Get session
PUT    /api/mass-consensus/sessions/{id}     // Update session
DELETE /api/mass-consensus/sessions/{id}     // Delete session

// Progress Management  
GET    /api/mass-consensus/progress/{sessionId}/{userId}
POST   /api/mass-consensus/progress/update
POST   /api/mass-consensus/progress/complete-question

// Bulk Operations
POST   /api/mass-consensus/sessions/{id}/clone
GET    /api/mass-consensus/sessions/{id}/export
POST   /api/mass-consensus/sessions/import
```

### 11. Configuration Options

#### Session Configuration
```typescript
interface SessionConfig {
  allowSkipping: boolean;        // Can skip optional questions
  allowBackNavigation: boolean;  // Can go back to previous questions
  randomizeQuestions: boolean;   // Randomize question order
  timeLimit?: number;           // Time limit per question
  minSuggestions?: number;      // Minimum suggestions before voting
  showProgress: boolean;        // Show progress indicator
  allowSaveAndResume: boolean;  // Allow saving partial progress
}
```

### 12. Error Handling

#### Scenarios to Handle
- Session not found
- Question not found
- Invalid question index
- Unauthorized access
- Network failures
- Concurrent modifications
- Session expiration

#### Recovery Strategies
- Auto-save progress
- Offline queue for submissions
- Conflict resolution
- Graceful degradation

## Benefits

1. **Comprehensive Feedback**: Gather input on multiple related questions
2. **Efficient Process**: Share common steps (intro, demographics)
3. **Better Engagement**: Keep users engaged through multiple topics
4. **Richer Data**: Understand connections between different questions
5. **Flexible Configuration**: Customize flow per session needs

## Risks and Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| User fatigue | High drop-off | Allow saving progress, show time estimates |
| Complex navigation | User confusion | Clear progress indicators, breadcrumbs |
| Data consistency | Corrupted state | Transactions, validation, backups |
| Performance | Slow loading | Pagination, lazy loading, caching |
| Browser limitations | Lost progress | Auto-save, session storage |

## Success Metrics

- **Completion Rate**: % of users completing all questions
- **Time to Complete**: Average time per question and total
- **Drop-off Points**: Where users abandon the process
- **Quality Metrics**: Suggestion quality across questions
- **User Satisfaction**: Feedback scores

## Next Steps

1. **Review and Approval**: Discuss design with team
2. **Prototype**: Build proof of concept
3. **User Testing**: Test with small group
4. **Implementation**: Phased rollout
5. **Monitoring**: Track metrics and iterate

## Conclusion

This multi-question feature extends Mass Consensus to handle complex decision-making scenarios while maintaining the system's democratic principles and user-friendly approach. The design prioritizes flexibility, user experience, and backward compatibility.