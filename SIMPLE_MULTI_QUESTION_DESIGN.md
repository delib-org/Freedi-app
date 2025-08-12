# Simple Multi-Question Mass Consensus Design

## Overview
A straightforward implementation where multiple independent questions are presented sequentially, each with its own configurable steps from the existing `MassConsensusPageUrls` enum.

## Core Concept
- Multiple questions in sequence
- Each question is independent (no data sharing)
- Each question can have different steps
- Simple navigation: complete one question, move to the next

## 1. Data Structure

### 1.1 Session Model
```typescript
interface SimpleMCSession {
  sessionId: string;
  title: string;
  description: string;
  createdBy: string;
  createdAt: number;
  
  // Array of independent questions
  questions: SimpleMCQuestion[];
  
  // Optional shared steps (appear once for entire session)
  sharedSteps?: {
    hasIntroduction?: boolean;
    hasUserDemographics?: boolean;
    hasFeedback?: boolean;
    hasThankYou?: boolean;
  };
  
  status: 'draft' | 'active' | 'completed';
}
```

### 1.2 Question Model
```typescript
interface SimpleMCQuestion {
  questionId: string;
  order: number; // 1, 2, 3...
  
  // Question content
  content: {
    question: string;
    description?: string;
  };
  
  // Which steps this question uses (from MassConsensusPageUrls)
  steps: MassConsensusPageUrls[];
  
  // Optional: Configure how each step behaves
  stepConfigs?: {
    [key in MassConsensusPageUrls]?: any;
  };
  
  required: boolean; // Can user skip this question?
}
```

### 1.3 User Progress
```typescript
interface UserProgress {
  userId: string;
  sessionId: string;
  
  // Track where user is
  currentQuestionIndex: number;
  currentStepIndex: number;
  
  // Track completed questions
  completedQuestions: {
    questionId: string;
    completedAt: number;
    skipped: boolean;
  }[];
  
  lastUpdate: number;
}
```

## 2. Example Configurations

### 2.1 Example Session
```typescript
const exampleSession: SimpleMCSession = {
  sessionId: "session-001",
  title: "Community Feedback Session",
  description: "Gathering input on three topics",
  createdBy: "admin-user-id",
  createdAt: Date.now(),
  
  sharedSteps: {
    hasIntroduction: true,
    hasUserDemographics: true,
    hasFeedback: true,
    hasThankYou: true
  },
  
  questions: [
    {
      // Question 1: Full process
      questionId: "q1",
      order: 1,
      content: {
        question: "What improvements should we make to the park?",
        description: "Please suggest and vote on park improvements"
      },
      steps: [
        MassConsensusPageUrls.question,
        MassConsensusPageUrls.randomSuggestions,
        MassConsensusPageUrls.topSuggestions,
        MassConsensusPageUrls.voting
      ],
      required: true
    },
    
    {
      // Question 2: Just voting
      questionId: "q2",
      order: 2,
      content: {
        question: "Should we extend park hours?",
        description: "Vote yes or no"
      },
      steps: [
        MassConsensusPageUrls.voting
      ],
      stepConfigs: {
        [MassConsensusPageUrls.voting]: {
          type: 'binary',
          options: ['Yes', 'No']
        }
      },
      required: true
    },
    
    {
      // Question 3: Collect suggestions only
      questionId: "q3",
      order: 3,
      content: {
        question: "Any other feedback about community services?",
        description: "Optional suggestions"
      },
      steps: [
        MassConsensusPageUrls.question
      ],
      required: false
    }
  ],
  
  status: 'active'
};
```

## 3. Flow Visualization

```
┌─────────────────────────────────────────────────────────────┐
│                   SIMPLE MASS CONSENSUS                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Introduction] → [User Demographics]                       │
│         ↓                                                   │
│  ╔═══════════════════════════════════════════════════════╗ │
│  ║ QUESTION 1: Park Improvements                         ║ │
│  ║  [question] → [randomSuggestions] →                   ║ │
│  ║  [topSuggestions] → [voting]                         ║ │
│  ╚═══════════════════════════════════════════════════════╝ │
│         ↓                                                   │
│  ╔═══════════════════════════════════════════════════════╗ │
│  ║ QUESTION 2: Park Hours                                ║ │
│  ║  [voting]                                             ║ │
│  ╚═══════════════════════════════════════════════════════╝ │
│         ↓                                                   │
│  ╔═══════════════════════════════════════════════════════╗ │
│  ║ QUESTION 3: Other Feedback (Optional)                 ║ │
│  ║  [question]                                           ║ │
│  ╚═══════════════════════════════════════════════════════╝ │
│         ↓                                                   │
│  [Leave Feedback] → [Thank You]                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 4. URL Structure

```typescript
// Shared steps (appear once)
/mc/{sessionId}/introduction
/mc/{sessionId}/user-demographics

// Per question steps
/mc/{sessionId}/q/{questionIndex}/{step}

// Examples:
/mc/session-001/q/0/question           // Question 1, question step
/mc/session-001/q/0/random-suggestions // Question 1, random suggestions
/mc/session-001/q/0/voting            // Question 1, voting
/mc/session-001/q/1/voting            // Question 2, voting only
/mc/session-001/q/2/question          // Question 3, question only

// Shared steps (appear once)
/mc/{sessionId}/leave-feedback
/mc/{sessionId}/thank-you
```

## 5. Database Structure

```typescript
// Firestore collections
firestore/
├── mcSessions/
│   └── {sessionId}
│       ├── metadata (title, description, etc.)
│       └── questions[] (array of questions)
│
├── mcResponses/
│   └── {sessionId}/
│       └── {questionId}/
│           └── {userId}
│               ├── suggestions[]
│               ├── evaluations[]
│               └── votes[]
│
└── mcProgress/
    └── {sessionId}_{userId}
        ├── currentQuestionIndex
        ├── currentStepIndex
        └── completedQuestions[]
```

## 6. Navigation Logic

```typescript
class SimpleNavigator {
  getNextDestination(
    session: SimpleMCSession,
    currentQuestionIndex: number,
    currentStepIndex: number
  ): string {
    const currentQuestion = session.questions[currentQuestionIndex];
    
    // Check if more steps in current question
    if (currentStepIndex < currentQuestion.steps.length - 1) {
      // Go to next step in same question
      const nextStep = currentQuestion.steps[currentStepIndex + 1];
      return `/mc/${session.sessionId}/q/${currentQuestionIndex}/${nextStep}`;
    }
    
    // Check if more questions
    if (currentQuestionIndex < session.questions.length - 1) {
      // Go to first step of next question
      const nextQuestion = session.questions[currentQuestionIndex + 1];
      const firstStep = nextQuestion.steps[0];
      return `/mc/${session.sessionId}/q/${currentQuestionIndex + 1}/${firstStep}`;
    }
    
    // All questions done, go to feedback or thank you
    if (session.sharedSteps?.hasFeedback) {
      return `/mc/${session.sessionId}/leave-feedback`;
    }
    
    return `/mc/${session.sessionId}/thank-you`;
  }
}
```

## 7. Component Structure

```typescript
// Main container component
function MCSession() {
  const { sessionId, questionIndex, step } = useParams();
  const session = useSession(sessionId);
  const progress = useProgress(sessionId);
  
  // Render appropriate component based on step
  switch(step) {
    case MassConsensusPageUrls.introduction:
      return <Introduction session={session} />;
      
    case MassConsensusPageUrls.question:
      return <QuestionInput 
        question={session.questions[questionIndex]}
        onComplete={handleStepComplete}
      />;
      
    case MassConsensusPageUrls.voting:
      return <Voting 
        question={session.questions[questionIndex]}
        config={question.stepConfigs?.voting}
        onComplete={handleStepComplete}
      />;
      
    // ... other cases
  }
}
```

## 8. API Endpoints

```typescript
// Session management
POST   /api/mc/sessions                  // Create session
GET    /api/mc/sessions/:id              // Get session
PUT    /api/mc/sessions/:id              // Update session

// Progress tracking
GET    /api/mc/progress/:sessionId/:userId
POST   /api/mc/progress/update

// Responses
POST   /api/mc/response                  // Submit response for a step
GET    /api/mc/responses/:sessionId/:questionId

// Results
GET    /api/mc/results/:sessionId        // Get all results
GET    /api/mc/results/:sessionId/:questionId // Get question results
```

## 9. Implementation Steps

### Phase 1: Core (Week 1)
1. Create session data model
2. Set up database collections
3. Build navigation logic
4. Create progress tracking

### Phase 2: Components (Week 2)
1. Update existing step components to work with questions
2. Add question context provider
3. Build session container
4. Add progress indicator

### Phase 3: Testing (Week 3)
1. Test different step combinations
2. Test navigation flow
3. Test progress saving/resuming
4. Performance testing

## 10. Benefits of Simple Approach

1. **Easy to implement** - Minimal changes to existing code
2. **Clear mental model** - Questions are independent
3. **Flexible** - Each question can have different steps
4. **Reuses existing components** - No new step types needed
5. **Progressive** - Can add features later (dependencies, aggregation)
6. **Familiar UX** - Like a multi-page survey

## 11. Future Enhancements (Not in V1)

Once the simple version works, can add:
- Question dependencies
- Data inheritance between questions
- Aggregation summary
- Conditional questions
- Question templates

## Conclusion

This simple design provides multi-question support with minimal complexity. Each question is independent, can have its own step configuration, and users proceed through them sequentially. Perfect for starting implementation while keeping the door open for future enhancements.