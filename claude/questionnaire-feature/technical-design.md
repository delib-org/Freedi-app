# Questionnaire Feature Technical Design

## Data Structure

### Firestore Collections

#### Questionnaires Collection
```typescript
interface Questionnaire {
  id: string;
  title: string;
  description?: string;
  creatorId: string;
  statementId?: string; // Link to parent statement if applicable
  questions: string[]; // Array of question IDs in order
  settings: {
    allowBackNavigation: boolean;
    showProgress: boolean;
    randomizeQuestions: boolean;
    timeLimit?: number; // in minutes
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
  status: 'draft' | 'published' | 'closed';
}
```

#### Questions Collection
```typescript
interface Question {
  id: string;
  questionnaireId: string;
  text: string;
  type: 'multiple-choice' | 'text' | 'rating' | 'scale' | 'yes-no';
  order: number;
  required: boolean;
  options?: QuestionOption[]; // For multiple choice
  validation?: ValidationRule[];
}

interface QuestionOption {
  id: string;
  text: string;
  value: string | number;
}
```

#### Responses Collection
```typescript
interface QuestionnaireResponse {
  id: string;
  questionnaireId: string;
  userId: string;
  responses: {
    questionId: string;
    answer: any; // Type depends on question type
    timestamp: Timestamp;
  }[];
  startedAt: Timestamp;
  completedAt?: Timestamp;
  status: 'in-progress' | 'completed' | 'abandoned';
}
```

## Redux State Structure

```typescript
interface QuestionnaireState {
  questionnaires: Record<string, Questionnaire>;
  questions: Record<string, Question>;
  currentQuestionnaire: {
    id: string | null;
    currentQuestionIndex: number;
    responses: Record<string, any>;
    isLoading: boolean;
    error: string | null;
  };
  userResponses: Record<string, QuestionnaireResponse>;
}
```

## Component Architecture

1. **QuestionnaireCreator**
   - Form for creating new questionnaires
   - Question builder interface
   - Preview mode

2. **QuestionnaireRunner**
   - Displays questions sequentially
   - Handles navigation and response collection
   - Progress tracking

3. **QuestionnaireResults**
   - Display individual responses
   - Aggregate analytics
   - Export functionality

## Integration Points
- Integrate with existing statement system
- Use existing authentication/user system
- Follow current Redux patterns
- Reuse existing UI components where possible