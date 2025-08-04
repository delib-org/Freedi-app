# Alignment with delib-npm Questionnaire Schema

## Official Schema from delib-npm

```typescript
export const QuestionnaireSchema = object({
    question: string(), // the main question of the questionnaire
    description: optional(string()), // optional description of the questionnaire
    image: optional(string()), // optional image URL for the questionnaire
    creatorId: string(), // the ID of the creator of the questionnaire
    questionnaireId: string(), // unique identifier for the questionnaire
    createdAt: optional(number()), // timestamp of when the questionnaire was created
    updatedAt: optional(number()), // timestamp of the last update to the questionnaire
    questions: array(object({
        statement: StatementSchema,
        questionType: enum_(QuestionType),
        EvaluationUI: enum_(EvaluationUI),
        question: optional(string()), // optional question text
        description: optional(string()), // optional description of the question
        image: optional(string()), // optional image URL for the question
    }))
});
```

## Key Differences from Our Initial Design

1. **Simpler Structure**: The official schema is more streamlined
   - No separate QuestionnaireStatement type
   - Questions embed full Statement objects
   - Uses existing QuestionType and EvaluationUI enums

2. **Questions as Embedded Objects**: Instead of questions being separate child statements, they're embedded in the questionnaire
   - Each question contains a full Statement object
   - Questions have questionType and EvaluationUI properties
   - Simpler data structure, fewer database queries

3. **Evaluation UI**: Uses existing EvaluationUI enum to determine how questions are displayed
   - Leverages existing evaluation components
   - Consistent UI patterns across the app

## Implementation Implications

### Data Storage
- Questionnaires stored as single documents (not in statements collection)
- Questions are embedded, not separate documents
- Responses still use evaluations collection

### Component Structure
1. **QuestionnaireCreator**: 
   - Create questionnaire with multiple questions
   - Select questionType and EvaluationUI for each
   - Reuse existing statement creation components

2. **QuestionnaireRunner**:
   - Display questions sequentially
   - Use existing evaluation UI components based on EvaluationUI type
   - Handle navigation between questions

3. **Response Storage**:
   - One evaluation per question (using statement.statementId)
   - Link evaluations to questionnaire via questionnaireId

### Benefits of This Approach
- Simpler data model
- Reuses existing evaluation UI components
- Fewer database queries (all questions in one document)
- Consistent with existing Freedi patterns