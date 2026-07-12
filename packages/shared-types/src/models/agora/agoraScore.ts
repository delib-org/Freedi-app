import {
	object,
	string,
	number,
	optional,
	array,
	enum_,
	InferOutput,
} from 'valibot';
import { AgoraCamp } from './agoraEnums';

/** Per-camp evaluation aggregates for one proposal */
export const AgoraCampAggregateSchema = object({
	/** Sum of evaluation values (-1..1 each) from this camp */
	sum: number(),
	/** Number of evaluators from this camp */
	n: number(),
	/** Number of positive (> 0) evaluations from this camp */
	positiveN: number(),
});

export type AgoraCampAggregate = InferOutput<typeof AgoraCampAggregateSchema>;

export const AgoraCriterionScoreSchema = object({
	criterionId: string(),
	score: number(),
});

export type AgoraCriterionScore = InferOutput<typeof AgoraCriterionScoreSchema>;

export const AgoraPlausibilitySchema = object({
	/** Weighted total, 0-100 */
	score: number(),
	criterionScores: array(AgoraCriterionScoreSchema),
	reasoning: string(),
	scoredAt: number(),
});

export type AgoraPlausibility = InferOutput<typeof AgoraPlausibilitySchema>;

/**
 * Camp-aware scoring for one proposal. Doc id = proposal statementId.
 * Written ONLY by Cloud Functions (admin SDK) — client-write is denied.
 */
export const AgoraProposalScoreSchema = object({
	statementId: string(),
	sessionId: string(),
	authorCamp: enum_(AgoraCamp),
	perCamp: object({
		left: AgoraCampAggregateSchema,
		right: AgoraCampAggregateSchema,
		center: AgoraCampAggregateSchema,
	}),
	/** 0-100; cross-camp support weighted above same-camp support */
	bridgingScore: number(),
	/** Set once the bridging credit was awarded (idempotency guard) */
	bridgingCreditAwardedAt: optional(number()),
	plausibility: optional(AgoraPlausibilitySchema),
	lastUpdate: number(),
});

export type AgoraProposalScore = InferOutput<typeof AgoraProposalScoreSchema>;
