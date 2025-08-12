# Mass Consensus V2 - Design with Existing Step Types

## Overview
Multi-question Mass Consensus using the existing `MassConsensusPageUrls` enum steps, but with flexible combinations per question.

## 1. Existing Step Types (Constraints)
```typescript
export enum MassConsensusPageUrls {
    introduction = "introduction",           // Shared - once at start
    userDemographics = "user-demographics",  // Shared - once at start
    initialQuestion = "initial-question",    // Can be used per question
    question = "question",                   // Can be used per question
    randomSuggestions = "random-suggestions", // Optional per question
    topSuggestions = "top-suggestions",      // Optional per question
    voting = "voting",                       // Optional per question
    leaveFeedback = "leave-feedback",        // Shared - once at end
    thankYou = "thank-you"                   // Shared - once at end
}
```

## 2. Flexible Question Structures Using Existing Steps

### 2.1 Question Type Configurations
```typescript
interface QuestionStructure {
  questionId: string;
  type: QuestionType;
  
  // Each question can use different combinations of existing steps
  steps: MassConsensusPageUrls[];
  
  // Step-specific configurations
  stepConfigs?: {
    [MassConsensusPageUrls.question]?: {
      allowMultipleSuggestions?: boolean;
      showSimilarSuggestions?: boolean;
      minLength?: number;
      maxLength?: number;
    };
    [MassConsensusPageUrls.randomSuggestions]?: {
      count?: number; // How many to show (default 6)
      evaluationType?: 'thumbs' | 'scale' | 'stars';
    };
    [MassConsensusPageUrls.topSuggestions]?: {
      count?: number; // How many top to show
      threshold?: number; // Minimum score to be considered "top"
    };
    [MassConsensusPageUrls.voting]?: {
      type?: 'single' | 'multiple' | 'ranked' | 'yes-no';
      maxSelections?: number;
      showResults?: 'immediate' | 'after' | 'never';
    };
  };
  
  // Dependencies on previous questions
  dependencies?: {
    fromQuestionId: string;
    dataUsed: string[]; // What data to inherit
  }[];
}
```

### 2.2 Predefined Question Types
```typescript
enum QuestionType {
  FULL_CONSENSUS = 'full_consensus',      // All steps
  QUICK_VOTE = 'quick_vote',              // Just voting
  BRAINSTORM_ONLY = 'brainstorm_only',    // Just question submission
  EVALUATE_ONLY = 'evaluate_only',        // Just evaluate existing
  SIMPLE_SURVEY = 'simple_survey',        // Initial question + voting
  CUSTOM = 'custom'                       // Custom combination
}

// Predefined step combinations
const QUESTION_TYPE_STEPS: Record<QuestionType, MassConsensusPageUrls[]> = {
  FULL_CONSENSUS: [
    MassConsensusPageUrls.question,
    MassConsensusPageUrls.randomSuggestions,
    MassConsensusPageUrls.topSuggestions,
    MassConsensusPageUrls.voting
  ],
  
  QUICK_VOTE: [
    MassConsensusPageUrls.voting
  ],
  
  BRAINSTORM_ONLY: [
    MassConsensusPageUrls.question
  ],
  
  EVALUATE_ONLY: [
    MassConsensusPageUrls.randomSuggestions,
    MassConsensusPageUrls.topSuggestions,
    MassConsensusPageUrls.voting
  ],
  
  SIMPLE_SURVEY: [
    MassConsensusPageUrls.initialQuestion,
    MassConsensusPageUrls.voting
  ],
  
  CUSTOM: [] // Define your own combination
};
```

## 3. Visual Flow with Different Step Combinations

```
┌─────────────────────────────────────────────────────────────────┐
│                    MASS CONSENSUS SESSION                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐                                              │
│  │ Introduction │ (Shared - Once)                              │
│  └──────┬───────┘                                              │
│         ▼                                                       │
│  ┌──────────────────┐                                          │
│  │ User Demographics│ (Shared - Once)                          │
│  └──────┬───────────┘                                          │
│         ▼                                                       │
│  ╔══════════════════════════════════════════════════════════╗  │
│  ║ QUESTION 1: BRAINSTORM_ONLY                              ║  │
│  ║ "What challenges does our community face?"               ║  │
│  ║ ┌────────────────────────────────────────────────────┐   ║  │
│  ║ │ Steps: [question]                                  │   ║  │
│  ║ │ → Collect suggestions only, no evaluation          │   ║  │
│  ║ └────────────────────────────────────────────────────┘   ║  │
│  ╚══════════════════╤═══════════════════════════════════════╝  │
│                     ▼                                           │
│  ╔══════════════════════════════════════════════════════════╗  │
│  ║ QUESTION 2: QUICK_VOTE                                   ║  │
│  ║ "Which challenge is most urgent?" (uses Q1 suggestions)  ║  │
│  ║ ┌────────────────────────────────────────────────────┐   ║  │
│  ║ │ Steps: [voting]                                    │   ║  │
│  ║ │ → Vote on inherited options from Q1                │   ║  │
│  ║ └────────────────────────────────────────────────────┘   ║  │
│  ╚══════════════════╤═══════════════════════════════════════╝  │
│                     ▼                                           │
│  ╔══════════════════════════════════════════════════════════╗  │
│  ║ QUESTION 3: FULL_CONSENSUS                               ║  │
│  ║ "How to solve {{Q2.topVoted}}?"                         ║  │
│  ║ ┌────────────────────────────────────────────────────┐   ║  │
│  ║ │ Steps: [question, randomSuggestions,               │   ║  │
│  ║ │         topSuggestions, voting]                     │   ║  │
│  ║ │ → Complete consensus process                        │   ║  │
│  ║ └────────────────────────────────────────────────────┘   ║  │
│  ╚══════════════════╤═══════════════════════════════════════╝  │
│                     ▼                                           │
│  ╔══════════════════════════════════════════════════════════╗  │
│  ║ QUESTION 4: EVALUATE_ONLY                                ║  │
│  ║ "Rate these implementation plans" (uses Q3 suggestions)   ║  │
│  ║ ┌────────────────────────────────────────────────────┐   ║  │
│  ║ │ Steps: [randomSuggestions, topSuggestions]         │   ║  │
│  ║ │ → Evaluate inherited suggestions, no new input      │   ║  │
│  ║ └────────────────────────────────────────────────────┘   ║  │
│  ╚══════════════════╤═══════════════════════════════════════╝  │
│                     ▼                                           │
│  ╔══════════════════════════════════════════════════════════╗  │
│  ║ QUESTION 5: SIMPLE_SURVEY                                ║  │
│  ║ "Ready to proceed?"                                      ║  │
│  ║ ┌────────────────────────────────────────────────────┐   ║  │
│  ║ │ Steps: [initialQuestion, voting]                   │   ║  │
│  ║ │ → Simple yes/no decision                           │   ║  │
│  ║ └────────────────────────────────────────────────────┘   ║  │
│  ╚══════════════════╤═══════════════════════════════════════╝  │
│                     ▼                                           │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              AGGREGATION SUMMARY                       │    │
│  │  • Consensus levels across questions                   │    │
│  │  • Decision flow visualization                         │    │
│  │  • Export comprehensive report                         │    │
│  └────────────────┬───────────────────────────────────────┘    │
│                   ▼                                             │
│  ┌──────────────┐                                              │
│  │Leave Feedback│ (Shared - Once)                              │
│  └──────┬───────┘                                              │
│         ▼                                                       │
│  ┌──────────────┐                                              │
│  │  Thank You   │ (Shared - Once)                              │
│  └──────────────┘                                              │
└─────────────────────────────────────────────────────────────────┘
```

## 4. Data Models

### 4.1 Session Model
```typescript
interface MCSession {
  sessionId: string;
  title: string;
  description: string;
  
  // Questions with flexible step combinations
  questions: MCQuestion[];
  
  // Shared steps (appear once for entire session)
  sharedSteps: {
    introduction?: boolean;
    userDemographics?: boolean;
    leaveFeedback?: boolean;
    thankYou?: boolean;
  };
  
  // Aggregation configuration
  aggregation?: {
    enabled: boolean;
    showSummary: boolean;
    calculations: string[];
  };
}
```

### 4.2 Question Model
```typescript
interface MCQuestion {
  questionId: string;
  sessionId: string;
  order: number;
  
  // Question content
  content: {
    text: string;
    description?: string;
    dynamicTemplate?: string; // Can reference previous questions
  };
  
  // Question type determines step combination
  type: QuestionType;
  
  // Actual steps for this question (subset of MassConsensusPageUrls)
  steps: MassConsensusPageUrls[];
  
  // Configuration for each step
  stepConfigs?: StepConfigMap;
  
  // Dependencies
  dependencies?: {
    fromQuestionId: string;
    inheritedData: {
      suggestions?: boolean;
      votes?: boolean;
      evaluations?: boolean;
    };
  }[];
  
  // Display conditions
  displayCondition?: {
    dependsOn: string;
    condition: string; // e.g., "votes.winner === 'yes'"
  };
}
```

### 4.3 Step Configuration Per Question
```typescript
interface StepConfigMap {
  // Each step can have different config per question
  [MassConsensusPageUrls.question]?: {
    mode?: 'suggestion' | 'feedback' | 'idea';
    allowMultiple?: boolean;
    minLength?: number;
    maxLength?: number;
    placeholder?: string;
    showPreviousSuggestions?: boolean;
  };
  
  [MassConsensusPageUrls.initialQuestion]?: {
    type?: 'binary' | 'multiple' | 'scale';
    options?: string[];
    scale?: { min: number; max: number; };
  };
  
  [MassConsensusPageUrls.randomSuggestions]?: {
    source?: 'current' | 'inherited' | 'mixed';
    count?: number;
    evaluationMethod?: 'thumbs' | 'stars' | 'scale';
    inheritFromQuestion?: string;
  };
  
  [MassConsensusPageUrls.topSuggestions]?: {
    source?: 'current' | 'inherited' | 'mixed';
    count?: number;
    minScore?: number;
    showScores?: boolean;
  };
  
  [MassConsensusPageUrls.voting]?: {
    voteType?: 'single' | 'multiple' | 'ranked' | 'yes-no' | 'allocation';
    options?: 'inherited' | 'current' | VotingOption[];
    maxSelections?: number;
    allocationTotal?: number; // For allocation type
    showLiveResults?: boolean;
  };
}
```

## 5. Example Session Configuration

```typescript
const policySession: MCSession = {
  sessionId: "policy-2024",
  title: "Policy Development Session",
  
  sharedSteps: {
    introduction: true,
    userDemographics: true,
    leaveFeedback: true,
    thankYou: true
  },
  
  questions: [
    {
      // Q1: Just collect ideas
      questionId: "q1",
      type: QuestionType.BRAINSTORM_ONLY,
      content: { text: "What policy changes do we need?" },
      steps: [MassConsensusPageUrls.question],
      stepConfigs: {
        [MassConsensusPageUrls.question]: {
          mode: 'suggestion',
          allowMultiple: true,
          maxLength: 500
        }
      }
    },
    
    {
      // Q2: Vote on the collected ideas
      questionId: "q2",
      type: QuestionType.QUICK_VOTE,
      content: { 
        text: "Select top 3 priorities",
        dynamicTemplate: "From suggestions: {{q1.allSuggestions}}"
      },
      steps: [MassConsensusPageUrls.voting],
      stepConfigs: {
        [MassConsensusPageUrls.voting]: {
          voteType: 'multiple',
          options: 'inherited',
          maxSelections: 3
        }
      },
      dependencies: [{
        fromQuestionId: "q1",
        inheritedData: { suggestions: true }
      }]
    },
    
    {
      // Q3: Full consensus on top priority
      questionId: "q3",
      type: QuestionType.FULL_CONSENSUS,
      content: {
        text: "How to implement {{q2.topVoted}}?",
        dynamicTemplate: "How to implement {{q2.topVoted}}?"
      },
      steps: [
        MassConsensusPageUrls.question,
        MassConsensusPageUrls.randomSuggestions,
        MassConsensusPageUrls.topSuggestions,
        MassConsensusPageUrls.voting
      ],
      stepConfigs: {
        [MassConsensusPageUrls.randomSuggestions]: {
          count: 6,
          evaluationMethod: 'scale'
        },
        [MassConsensusPageUrls.voting]: {
          voteType: 'ranked',
          maxSelections: 3
        }
      }
    },
    
    {
      // Q4: Just evaluate without new input
      questionId: "q4",
      type: QuestionType.EVALUATE_ONLY,
      content: { text: "Rate implementation difficulty" },
      steps: [
        MassConsensusPageUrls.randomSuggestions,
        MassConsensusPageUrls.topSuggestions
      ],
      stepConfigs: {
        [MassConsensusPageUrls.randomSuggestions]: {
          source: 'inherited',
          inheritFromQuestion: 'q3',
          evaluationMethod: 'scale'
        }
      },
      dependencies: [{
        fromQuestionId: "q3",
        inheritedData: { suggestions: true }
      }]
    },
    
    {
      // Q5: Simple binary decision
      questionId: "q5",
      type: QuestionType.SIMPLE_SURVEY,
      content: { text: "Approve for implementation?" },
      steps: [
        MassConsensusPageUrls.initialQuestion,
        MassConsensusPageUrls.voting
      ],
      stepConfigs: {
        [MassConsensusPageUrls.initialQuestion]: {
          type: 'binary',
          options: ['Yes', 'No']
        },
        [MassConsensusPageUrls.voting]: {
          voteType: 'yes-no',
          showLiveResults: true
        }
      }
    }
  ],
  
  aggregation: {
    enabled: true,
    showSummary: true,
    calculations: ['consensus', 'participation', 'correlation']
  }
};
```

## 6. URL Routing

```typescript
// Routes for different step combinations
/mc/{sessionId}/introduction                    // Shared
/mc/{sessionId}/user-demographics              // Shared
/mc/{sessionId}/q/{questionIndex}/question     // Per question
/mc/{sessionId}/q/{questionIndex}/initial-question
/mc/{sessionId}/q/{questionIndex}/random-suggestions
/mc/{sessionId}/q/{questionIndex}/top-suggestions
/mc/{sessionId}/q/{questionIndex}/voting
/mc/{sessionId}/aggregation                    // Summary
/mc/{sessionId}/leave-feedback                 // Shared
/mc/{sessionId}/thank-you                      // Shared
```

## 7. Navigation Logic

```typescript
class MCNavigator {
  // Get next step for current question
  getNextStep(session: MCSession, questionIndex: number, currentStep: MassConsensusPageUrls): string {
    const question = session.questions[questionIndex];
    const currentStepIndex = question.steps.indexOf(currentStep);
    
    if (currentStepIndex < question.steps.length - 1) {
      // Next step in current question
      const nextStep = question.steps[currentStepIndex + 1];
      return `/mc/${session.sessionId}/q/${questionIndex}/${nextStep}`;
    } else if (questionIndex < session.questions.length - 1) {
      // First step of next question
      const nextQuestion = session.questions[questionIndex + 1];
      return `/mc/${session.sessionId}/q/${questionIndex + 1}/${nextQuestion.steps[0]}`;
    } else if (session.aggregation?.enabled) {
      // Go to aggregation
      return `/mc/${session.sessionId}/aggregation`;
    } else if (session.sharedSteps.leaveFeedback) {
      // Go to feedback
      return `/mc/${session.sessionId}/leave-feedback`;
    } else {
      // Go to thank you
      return `/mc/${session.sessionId}/thank-you`;
    }
  }
}
```

## 8. Benefits of This Approach

1. **Works with existing code**: Uses current `MassConsensusPageUrls` enum
2. **Flexible combinations**: Questions can use any subset of steps
3. **No new step types needed**: Reuses existing components
4. **Backward compatible**: Existing single-question flows still work
5. **Progressive enhancement**: Can add features without breaking changes
6. **Clear structure**: Each question type has predefined step combinations
7. **Customizable**: Each step can be configured differently per question

## 9. Implementation Strategy

### Phase 1: Core Infrastructure
- Extend existing components to accept configuration
- Add question type system
- Implement navigation logic for multi-question

### Phase 2: Data Flow
- Add dependency system
- Implement data inheritance between questions
- Add dynamic template resolution

### Phase 3: UI Updates
- Update existing step components to be configuration-driven
- Add progress tracking across questions
- Implement aggregation summary

### Phase 4: Testing & Rollout
- Test different question type combinations
- Ensure backward compatibility
- Gradual feature flag rollout

## Conclusion

This design allows flexible question structures while working within the constraints of the existing `MassConsensusPageUrls` enum. Each question can use different combinations of the existing steps, configured uniquely for its purpose.