import type { Statement } from '../../models/statement/StatementTypes';
import type { BatchStats } from './proposalSampler';

/** The contract between the main app's Rate view and the `getAnswerBatch` callable. */
export const ANSWER_BATCH = {
	/** At this many answers or fewer a question keeps its plain list and never calls the sampler. */
	RATE_VIEW_THRESHOLD: 30,
	/** Answers shown in one batch: the same size MC serves. */
	DEFAULT_SIZE: 6,
	/** The most a caller may ask for at once. */
	MAX_SIZE: 20,
} as const;

/** More answers than the threshold, so the question opens on the Rate view. */
export function isAnswerBatchQuestion(answerCount: number): boolean {
	return answerCount > ANSWER_BATCH.RATE_VIEW_THRESHOLD;
}

export interface GetAnswerBatchRequest {
	questionId: string;
	size?: number;
}

export interface GetAnswerBatchResponse {
	/** In an order that says nothing about priority or score. */
	answers: Statement[];
	hasMore: boolean;
	/** Answers a participant can see, the caller's own included: the figure the threshold is about. */
	totalAnswers: number;
	stats: BatchStats;
}
