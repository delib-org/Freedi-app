import { array, object, enum_, string, optional, InferOutput, number } from "valibot";
import { EvaluationUI } from "../evaluation/Evaluation";

export const QuestionnaireQuestionSchema = object({
    questionnaireId: string(), // unique identifier for the questionnaire
    statementId: string(), // unique identifier for the statement that the question uses to store data
    evaluationUI: optional(enum_(EvaluationUI)),
    order: number(), // order of the question in the questionnaire
});

export type QuestionnaireQuestion = InferOutput<typeof QuestionnaireQuestionSchema>;

export const QuestionnaireSchema = object({
    questionnaireId: string(), // unique identifier for the questionnaire
    createdAt: optional(number()), // timestamp of when the questionnaire was created
    updatedAt: optional(number()), // timestamp of the last update to the questionnaire
    questions: array(QuestionnaireQuestionSchema), // array of QuestionnaireQuestion
});

export type Questionnaire = InferOutput<typeof QuestionnaireSchema>;