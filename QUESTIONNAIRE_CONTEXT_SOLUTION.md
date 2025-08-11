# Questionnaire Context Solution

## The Problem

When displaying questions within a questionnaire:
- Components like `SuggestionCards`, `Description`, etc. expect `statementId` from URL params
- But in questionnaire flow, we have `/questionnaire/:questionnaireId` 
- Individual questions don't have their own routes
- Components break because they can't find the question's `statementId`

### Components That Break:
1. **SuggestionCards**: Uses `useParams()` to get `statementId`
2. **Description**: Uses `StatementContext` which needs proper statement
3. **StatementBottomNav**: Expects `statementId` for navigation
4. **Evaluation components**: Need `statementId` for votes/evaluations

## Solution Options

### Option A: Virtual Statement Context (Recommended)
Create a wrapper that provides the correct statement context for each question:

```typescript
// QuestionnaireQuestionWrapper.tsx
interface Props {
  question: QuestionnaireQuestion;
  questionStatement: Statement; // The actual statement for this question
  children: React.ReactNode;
}

const QuestionnaireQuestionWrapper: FC<Props> = ({ 
  question, 
  questionStatement,
  children 
}) => {
  // Override the statement context with the question's statement
  const contextValue = useMemo(() => ({
    statement: questionStatement, // This is the question's statement
    // ... other context values
  }), [questionStatement]);

  return (
    <StatementContext.Provider value={contextValue}>
      {children}
    </StatementContext.Provider>
  );
};
```

**Usage in QuestionnaireSwitch:**
```typescript
const QuestionnaireSwitch = ({ currentQuestion }: Props) => {
  const questionStatement = useSelector(
    statementSelectorById(currentQuestion.statementId)
  );
  
  if (!currentQuestion || !questionStatement) return null;

  return (
    <QuestionnaireQuestionWrapper 
      question={currentQuestion}
      questionStatement={questionStatement}
    >
      <QuestionPage question={currentQuestion} />
    </QuestionnaireQuestionWrapper>
  );
};
```

### Option B: Props-Based Override
Pass statement explicitly to components:

```typescript
// Modify components to accept optional statement prop
const SuggestionCards: FC<Props> = ({ 
  statement: propStatement, // New prop
  ...otherProps 
}) => {
  const { statementId } = useParams();
  const stateStatement = useSelector(statementSelector(statementId));
  
  // Use prop statement if provided, otherwise use from params
  const statement = propStatement || stateStatement;
  
  // Rest of component logic
};
```

### Option C: Virtual Routing (Complex but Clean)
Create virtual routes for questions within questionnaires:

```typescript
// Route structure:
/questionnaire/:questionnaireId/question/:questionIndex

// Or with actual question statementId:
/questionnaire/:questionnaireId/question/:questionStatementId

// In components:
const { questionnaireId, questionStatementId } = useParams();
const statementId = questionStatementId || questionnaireId;
```

## Recommended Implementation Plan

### Phase 1: Create Question Context Provider

1. **Create `QuestionnaireProvider`:**
```typescript
// QuestionnaireProvider.tsx
export const QuestionnaireProvider: FC<{ 
  questionnaireId: string;
  currentQuestionId?: string;
  children: ReactNode;
}> = ({ questionnaireId, currentQuestionId, children }) => {
  const questionnaire = useSelector(statementSelectorById(questionnaireId));
  const currentQuestion = currentQuestionId 
    ? useSelector(statementSelectorById(currentQuestionId))
    : null;
    
  // Provide both questionnaire and current question contexts
  const value = useMemo(() => ({
    questionnaire,
    currentQuestion,
    statement: currentQuestion || questionnaire, // Fallback
  }), [questionnaire, currentQuestion]);
  
  return (
    <QuestionnaireContext.Provider value={value}>
      <StatementContext.Provider value={{ 
        statement: currentQuestion || questionnaire,
        // ... other values
      }}>
        {children}
      </StatementContext.Provider>
    </QuestionnaireContext.Provider>
  );
};
```

### Phase 2: Update Questionnaire Component

```typescript
const Questionnaire = () => {
  const { questionnaireId } = useParams();
  const questionnaire = useSelector(statementSelectorById(questionnaireId));
  const questions = Object.values(questionnaire?.questionnaire?.questions || {});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const currentQuestion = questions[currentQuestionIndex];
  
  // Fetch the actual statement for the current question
  const currentQuestionStatement = useSelector(
    statementSelectorById(currentQuestion?.statementId)
  );
  
  useEffect(() => {
    // Ensure question statement is loaded
    if (currentQuestion?.statementId && !currentQuestionStatement) {
      getStatementFromDB(currentQuestion.statementId);
    }
  }, [currentQuestion?.statementId]);
  
  return (
    <QuestionnaireProvider 
      questionnaireId={questionnaireId}
      currentQuestionId={currentQuestion?.statementId}
    >
      <div>
        <StatementHeader ... />
        <QuestionnaireSwitch currentQuestion={currentQuestion} />
        {/* Navigation buttons */}
      </div>
    </QuestionnaireProvider>
  );
};
```

### Phase 3: Update Components to Use Context

Components can now rely on StatementContext being properly set:
- `Description` will show the current question's description
- `SuggestionCards` will show options for the current question
- Evaluations will work with the current question's statementId

### Phase 4: Handle Navigation

Update navigation to maintain questionnaire context:

```typescript
const handleNextQuestion = () => {
  // Don't navigate to new route, just update index
  setCurrentQuestionIndex(prev => prev + 1);
  
  // Optionally update URL for bookmarking:
  navigate(`/questionnaire/${questionnaireId}?question=${currentQuestionIndex + 1}`, 
    { replace: true }
  );
};
```

## Benefits of This Approach

1. **No Breaking Changes**: Existing components continue to work
2. **Clean Context**: Each question gets proper statement context
3. **Reusability**: Question components work both standalone and in questionnaires
4. **Progressive Enhancement**: Can migrate incrementally

## Migration Steps

1. **Create Provider Components** (30 min)
2. **Update Questionnaire.tsx** (30 min)
3. **Update QuestionnaireSwitch** (15 min)
4. **Test with existing components** (1 hour)
5. **Add navigation logic** (30 min)
6. **Handle edge cases** (1 hour)

## Alternative Quick Fix

If you need a quick solution now:

```typescript
// In QuestionnaireSwitch.tsx
const QuestionnaireSwitch = ({ currentQuestion }: Props) => {
  const dispatch = useDispatch();
  
  useEffect(() => {
    // Temporarily set the question's statement as the current statement
    if (currentQuestion?.statementId) {
      getStatementFromDB(currentQuestion.statementId).then(statement => {
        dispatch(setStatement(statement));
      });
    }
  }, [currentQuestion?.statementId]);
  
  // This makes components think they're on a regular statement page
  return <QuestionPage question={currentQuestion} />;
};
```

This is hacky but works as a temporary solution while implementing the proper context provider.