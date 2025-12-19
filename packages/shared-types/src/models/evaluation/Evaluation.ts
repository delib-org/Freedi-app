import {
	object,
	string,
	number,
	boolean,
	optional,
	InferOutput,
	enum_,
	array,
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
	sumEvaluations: number(), //sum of all evaluations
	asParentTotalEvaluators: optional(number()), //sum of all evaluators as a parent
	agreement: number(),
	numberOfEvaluators: number(),
	sumPro: optional(number()), //sum of all pro evaluations
	sumCon: optional(number()), //sum of all con evaluations
	numberOfProEvaluators: optional(number()), //count of evaluators who evaluated > 0
	numberOfConEvaluators: optional(number()), //count of evaluators who evaluated < 0
	averageEvaluation: optional(number()), //average evaluation
	sumSquaredEvaluations: optional(number()), //sum of squared evaluations
	standardDeviation: optional(number()), //standard deviation of evaluations
	viewed: optional(number()), //number of users who viewed the evaluation
	evaluationRandomNumber: optional(number()),
	selectionFunction: optional(enum_(SelectionFunction)), // it is used for selecting in mass consensus random, voting and top suggestions
});

export type StatementEvaluation = InferOutput<typeof StatementEvaluationSchema>;

export enum EvaluationUI {
	suggestions = 'suggestions',
	voting = 'voting',
	checkbox = 'checkbox',
	clustering = 'clustering',
}

export const StatementEvaluationSettingsSchema = object({
	maxVotesPerUser: optional(number()),
	evaluationUI: enum_(EvaluationUI),
	anchored: optional(object({ //a two-phase process where users propose options, and evaluations always include admin-selected anchored options alongside randomly chosen user options		
		anchored:optional(boolean()), //if true, some statements are anchored to be represented in the evaluation.
		numberOfAnchoredStatements: optional(number()), //the number of anchored statements in the evaluation (while the others are not anchored)
		differentiateBetweenAnchoredAndNot: optional(boolean()), //if true, the evaluation will differentiate between anchored and not anchored statements
		anchorIcon: optional(string()),
		anchorDescription: optional(string()),
		anchorLabel: optional(string()),
	})), //the admin can chose to anchor some of the statements to be evaluated
});

export type StatementEvaluationSettings = InferOutput<typeof StatementEvaluationSettingsSchema>;

export const UserEvaluationSchema = object({
    // Composite ID: ${userId}--${parentStatementId}
    userEvaluationId: string(),

    // The user who is evaluating (can be anonymous)
    userId: string(),

    // The parent statement/question being evaluated
    parentStatementId: string(),

    // Array of statement IDs that have been evaluated
    evaluatedOptionsIds: array(string()),

    // Timestamps in milliseconds
    createdAt: number(),
    lastUpdated: number(),

    // Optional optimization fields
    evaluatedCount: optional(number()),
    totalOptionsAvailable: optional(number()),
    completedAt: optional(number()),
  });

export type UserEvaluation = InferOutput<typeof UserEvaluationSchema>;