import {
	object,
	string,
	number,
	boolean,
	optional,
	InferOutput,
	enum_,
} from 'valibot';
import { UserSchema } from '../user/User';

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

export enum SelectionFunction {
	random = 'random',
	top = 'top',
	vote = 'vote',
}

export const StatementEvaluationSchema = object({
	sumEvaluations: number(),
	agreement: number(),
	numberOfEvaluators: number(),
	sumPro: optional(number()),
	sumCon: optional(number()),
	viewed: optional(number()),
	evaluationRandomNumber: optional(number()),
	selectionFunction: optional(enum_(SelectionFunction)), // it is used for selecting in mass consensus random, voting and top suggestions
});

export type StatementEvaluation = InferOutput<typeof StatementEvaluationSchema>;
