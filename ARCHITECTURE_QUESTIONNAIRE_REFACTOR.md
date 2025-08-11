# Questionnaire Architecture Analysis & Recommendations

## Current Issues

### 1. Naming Confusion
- **Problem**: Using both `statementId` and `questionnaireId` for the same entity
- **Impact**: Confusion in code, potential bugs, harder to maintain

### 2. Mixed Concepts
Currently mixing two different architectural patterns:

#### Pattern A: Questionnaire as Statement
- Questionnaires are stored as Statements with `statementType: 'questionnaire'`
- Uses `statementId` to identify questionnaires
- Questions are sub-statements with their own `statementId`

#### Pattern B: Questionnaire as Separate Entity
- Uses `questionnaireId` as identifier
- Questions have `questionnaireQuestionId`
- Still stored in statements collection but conceptually separate

## Current Architecture Breakdown

### Data Structure
```typescript
// In Firebase/Redux
Statement {
  statementId: string  // Used as questionnaireId in questionnaire contexts
  statementType: 'questionnaire' | 'question' | 'group' | ...
  questionnaire?: {
    question: string     // Questionnaire title
    description: string
    questions: {
      [questionnaireQuestionId]: QuestionnaireQuestion {
        questionnaireQuestionId: string
        statementId: string  // References a Statement that IS the question
        questionType: QuestionType
        evaluationUI: EvaluationUI
        cutoffBy: CutoffBy
        order: number
        question?: string
        description?: string
        image?: string
      }
    }
  }
}
```

### Problems Identified

1. **Dual Identity**: 
   - A questionnaire IS a Statement (has statementId)
   - But uses questionnaireId in routes and params
   - Questions reference BOTH statementId and questionnaireQuestionId

2. **Inconsistent Routing**:
   - `/questionnaire/:questionnaireId` vs `/statement/:statementId`
   - Both referring to the same entity

3. **Confusing References**:
   - `QuestionnaireQuestion.statementId` - Which statement? The question or questionnaire?
   - `statement.questionnaire.questions` - Nested structure mixing concepts

## Recommended Architecture

### Option 1: Unified Statement Model (Recommended)
Keep everything as Statements but be consistent:

```typescript
// Clear hierarchy
Statement {
  statementId: string
  statementType: 'questionnaire' | 'question' | 'group' | ...
  
  // For questionnaires
  questionnaireSettings?: {
    title: string
    description: string
    questionOrder: string[]  // Array of statementIds in order
  }
  
  // For questions within questionnaires
  questionSettings?: {
    questionType: QuestionType
    evaluationUI: EvaluationUI
    cutoffBy: CutoffBy
    order: number
  }
  
  parentId: string  // Links question to questionnaire
}
```

**Benefits**:
- Single source of truth
- Clear parent-child relationships
- Reuses existing Statement infrastructure
- Questions can be full Statements with all features

**Implementation**:
1. Always use `statementId` everywhere
2. Route: `/statement/:statementId/questionnaire` for questionnaire view
3. Route: `/statement/:statementId/settings/questionnaire` for settings
4. Questions are child statements with `parentId` pointing to questionnaire

### Option 2: Separate Questionnaire Entity
Create a true separation:

```typescript
// Separate collection/entity
Questionnaire {
  questionnaireId: string
  statementId: string  // Links to parent statement/group
  title: string
  description: string
  questions: Question[]
}

Question {
  questionId: string
  questionnaireId: string
  statementId?: string  // Optional link to statement for responses
  ...
}
```

**Benefits**:
- Clear separation of concerns
- Specialized questionnaire features
- No confusion about identity

**Drawbacks**:
- Requires new collections/infrastructure
- Duplicates functionality
- More complex data management

## Immediate Refactoring Steps

### Phase 1: Standardize Naming (Quick Win)
1. Choose ONE term consistently:
   - If questionnaire IS a statement → use `statementId` everywhere
   - If questionnaire is SEPARATE → use `questionnaireId` everywhere

2. Update routes to be consistent:
   ```typescript
   // If using statementId
   /statement/:statementId/questionnaire
   /statement/:statementId/questionnaire/settings
   
   // If using questionnaireId  
   /questionnaire/:questionnaireId
   /questionnaire/:questionnaireId/settings
   ```

### Phase 2: Clean Data Structure
1. Remove `statementId` from `QuestionnaireQuestion` if questions are not separate statements
2. OR make questions proper child statements with clear `parentId`

### Phase 3: Update Components
1. Rename params consistently
2. Update Redux selectors
3. Clean up type definitions

## Recommended Immediate Actions

1. **Decision Required**: Choose Option 1 (Unified) or Option 2 (Separate)

2. **For Option 1 (Recommended)**:
   - Rename all `questionnaireId` to `statementId`
   - Update routes to `/statement/:statementId/questionnaire`
   - Make questions child statements with proper parent relationships
   - Remove `QuestionnaireQuestion` type, use `Statement` with `questionSettings`

3. **Update Firebase Functions**:
   - Rename `setQuestionnaireQuestion` to `setQuestionStatement`
   - Update field names in database updates

4. **Update Components**:
   ```typescript
   // Before
   const { questionnaireId } = useParams();
   const statement = useSelector(statementSelectorById(questionnaireId));
   
   // After
   const { statementId } = useParams();
   const questionnaire = useSelector(statementSelectorById(statementId));
   ```

## Migration Path

### Step 1: Update Routes (1 hour)
- Change route definitions
- Update all Links and navigation

### Step 2: Update Components (2 hours)
- Rename all param extractions
- Update prop names
- Fix TypeScript errors

### Step 3: Update Firebase Functions (1 hour)
- Rename functions
- Update field references

### Step 4: Data Migration (if needed)
- Write migration script if changing data structure
- Test thoroughly

### Step 5: Testing (2 hours)
- Test questionnaire creation
- Test question management
- Test answering flow

## Conclusion

The current mixed approach creates confusion. The recommended approach is to **fully embrace the Statement model** (Option 1) where:
- Questionnaires are Statements with `statementType: 'questionnaire'`
- Questions are child Statements with `statementType: 'question'`
- Use `statementId` consistently everywhere
- Leverage existing Statement infrastructure

This provides clarity, reuses existing code, and maintains a single source of truth.