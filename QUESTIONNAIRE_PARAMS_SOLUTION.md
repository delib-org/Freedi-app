# Solution: Question StatementId in Params

## The Real Problem
Components like `StatementBottomNav`, `SuggestionCards`, etc. use `useParams()` directly to get `statementId`. When in a questionnaire:
- URL has `/questionnaire/:questionnaireId`
- Components get `questionnaireId` instead of the question's `statementId`
- Context overrides don't help because `useParams()` reads from the actual URL

## Solution Options

### Option 1: Custom Hook with Context Fallback (RECOMMENDED)
Create a custom hook that intelligently gets the right statementId:

```typescript
// hooks/useStatementId.ts
export const useStatementId = () => {
  const { statementId, questionnaireId } = useParams<{ 
    statementId?: string; 
    questionnaireId?: string;
  }>();
  
  // Get current question from context if in questionnaire mode
  const { statement, currentQuestion } = useContext(StatementContext);
  
  // Priority order:
  // 1. If we have a statementId in params, use it (normal statement pages)
  // 2. If we have currentQuestion in context, use its statementId (questionnaire mode)
  // 3. Fallback to questionnaireId (viewing questionnaire itself)
  
  if (statementId) {
    return statementId; // Normal statement page
  }
  
  if (currentQuestion?.statementId) {
    return currentQuestion.statementId; // Question within questionnaire
  }
  
  return questionnaireId; // Questionnaire page
};
```

**Then update all components:**
```typescript
// Before:
const { statementId } = useParams();

// After:
const statementId = useStatementId();
```

### Option 2: Enhanced StatementContext
Extend StatementContext to include the "effective" statementId:

```typescript
// StatementCont.ts
interface StatementContextProps {
  statement: Statement | undefined;
  currentQuestionStatement?: Statement; // NEW
  effectiveStatementId?: string; // NEW - the ID components should use
  // ... other fields
}

// In QuestionnaireProvider:
const contextValue = {
  statement: questionnaire,
  currentQuestionStatement: questionStatement,
  effectiveStatementId: questionStatement?.statementId || questionnaire?.statementId,
  // ...
};
```

**Update components to use context:**
```typescript
// StatementBottomNav.tsx
const { effectiveStatementId } = useContext(StatementContext);
const statementId = effectiveStatementId || useParams().statementId;
```

### Option 3: Wrapper Components (Clean but more work)
Create questionnaire-aware versions of components:

```typescript
// QuestionnaireBottomNav.tsx
const QuestionnaireBottomNav: FC<{ questionStatementId: string }> = ({ 
  questionStatementId 
}) => {
  // Mock the params
  const MockedParamsProvider = ({ children }) => {
    // Override useParams for children
    return (
      <ParamsContext.Provider value={{ statementId: questionStatementId }}>
        {children}
      </ParamsContext.Provider>
    );
  };
  
  return (
    <MockedParamsProvider>
      <StatementBottomNav />
    </MockedParamsProvider>
  );
};
```

## Recommended Implementation

### Step 1: Create useStatementId Hook
```typescript
// src/controllers/hooks/useStatementId.ts
import { useParams } from 'react-router';
import { useContext } from 'react';
import { StatementContext } from '@/view/pages/statement/StatementCont';

export const useStatementId = (): string | undefined => {
  const { statementId, questionnaireId } = useParams<{ 
    statementId?: string; 
    questionnaireId?: string;
  }>();
  
  const context = useContext(StatementContext);
  
  // For questionnaires, check if we have a current question
  if (questionnaireId && context?.currentQuestion) {
    return context.currentQuestion.statementId;
  }
  
  // Normal statement pages or questionnaire itself
  return statementId || questionnaireId;
};
```

### Step 2: Update StatementContext
```typescript
// StatementCont.ts
interface StatementContextProps {
  statement: Statement | undefined;
  currentQuestion?: QuestionnaireQuestion; // NEW
  // ... existing fields
}
```

### Step 3: Update Questionnaire Component
```typescript
const Questionnaire = () => {
  const { questionnaireId } = useParams();
  const questionnaire = useSelector(statementSelectorById(questionnaireId));
  const questions = Object.values(questionnaire?.questionnaire?.questions || {});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const currentQuestion = questions[currentQuestionIndex];
  
  // Get the actual statement for current question
  const currentQuestionStatement = useSelector(
    statementSelectorById(currentQuestion?.statementId)
  );
  
  // Provide both questionnaire and current question in context
  const contextValue = useMemo(() => ({
    statement: currentQuestionStatement || questionnaire, // Use question's statement if available
    currentQuestion, // NEW - so components know which question is active
    // ... other values
  }), [currentQuestionStatement, questionnaire, currentQuestion]);
  
  return (
    <StatementContext.Provider value={contextValue}>
      {/* Rest of component */}
    </StatementContext.Provider>
  );
};
```

### Step 4: Update Components
Replace `useParams()` with `useStatementId()` in:
- StatementBottomNav
- SuggestionCards  
- Description
- Any other component that needs statementId

```typescript
// StatementBottomNav.tsx
const StatementBottomNav: FC = () => {
  const statementId = useStatementId(); // Instead of useParams
  const subscription = useSelector(statementSubscriptionSelector(statementId));
  // Rest stays the same
};
```

## Benefits
1. **Minimal changes**: Just replace one hook call
2. **Works everywhere**: Same components work in statements and questionnaires
3. **Clean abstraction**: Logic is centralized in one hook
4. **Progressive migration**: Can update components one by one

## Quick Test Implementation

Try this in StatementBottomNav first:

```typescript
// At the top of StatementBottomNav.tsx
const useStatementId = () => {
  const { statementId, questionnaireId } = useParams<{ 
    statementId?: string; 
    questionnaireId?: string;
  }>();
  const { statement } = useContext(StatementContext);
  
  // If we're in a questionnaire and have a question statement, use its ID
  if (questionnaireId && statement?.statementType === 'question') {
    return statement.statementId;
  }
  
  return statementId || questionnaireId;
};

// Then in the component:
const StatementBottomNav: FC = () => {
  const statementId = useStatementId(); // Use our custom hook
  // ... rest of component
};
```

This way, when StatementBottomNav is rendered within a questionnaire question, it gets the question's statementId, not the questionnaire's.