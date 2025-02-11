import {
	object,
	string,
	number,
	boolean,
	optional,
	InferOutput,
} from 'valibot';
import { UserSchema } from '../user';

export const EvaluationSchema = object({
	parentId: string(),
	evaluationId: string(),
	statementId: string(),
	evaluatorId: string(),
	updatedAt: number(),
	evaluation: number(),
	evaluator: optional(UserSchema),
});

export type Evaluation = InferOutput<typeof EvaluationSchema>;

export const EvaluatorSchema = object({
	evaluatorId: optional(string()),
	statementId: optional(string()),
	evaluated: optional(boolean()),
	suggested: optional(boolean()),
	firstEvaluation: optional(boolean()),
	secondEvaluation: optional(boolean()),
	voted: optional(boolean()),
});

export type Evaluator = InferOutput<typeof EvaluatorSchema>;

export const StatementEvaluationSchema = object({
	sumEvaluations: number(),
	agreement: number(),
	numberOfEvaluators: number(),
	sumPro: optional(number()),
	sumCon: optional(number()),
	viewed: optional(number()),
	evaluationRandomNumber: optional(number()),
});

export type StatementEvaluation = InferOutput<typeof StatementEvaluationSchema>;
