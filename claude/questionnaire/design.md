# Questionnaire Design Document

## Goal

A questionnaire is a set of questions that the user fills out one after the other.

## Architecture

- A questionnaire is a type of questionnaire
- The questionnaire holds an array of sub-questions
- Sub-questions can be:
  - Simple questions
  - Mass consensus questions
- User interface includes screens similar to mass consensus with navigation controls (back/forward)
- The questionnaire allows AI or users to dissect questions and propose summaries

## Schema

Source: `delib-npm`

### Question Types

```typescript
export enum QuestionType {
   simple = 'simple',
   massConsensus = 'mass-consensus',
   multiStage = 'multi-stage',
   questionnaire = 'questionnaire',
}
```

### Questionnaire Schema

```typescript
export const QuestionnaireSchema = object({
   questionnaireId: string(),              // unique identifier for the questionnaire
   createdAt: optional(number()),          // timestamp of when the questionnaire was created
   updatedAt: optional(number()),          // timestamp of the last update to the questionnaire
   questions: array(QuestionnaireQuestionSchema), // array of QuestionnaireQuestion
});
```

### Questionnaire Question Schema

```typescript
export const QuestionnaireQuestionSchema = object({
   questionnaireId: string(),               // unique identifier for the questionnaire
   statementId: string(),                   // unique identifier for the statement that the question uses to store data
   evaluationUI: optional(enum_(EvaluationUI)),
   order: number(),                         // order of the question in the questionnaire
});
```

### Statement Schema Extension

In `statementSchema`:

```typescript
questionnaire: optional(QuestionnaireSchema), // if a statement is a questionnaire, it will have this field
```