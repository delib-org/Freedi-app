/**
 * Strategic export — demographic slicing with k-anonymity enforcement.
 *
 * For a given aggregated suggestion, produce one DemographicSlice per
 * (demographic question, observed answer). Suppress slices whose pooled
 * evaluator count drops below `kAnonymity`.
 */

import type {
	DemographicSlice,
	UserDemographicQuestion,
	DemographicQuestionSummary,
	DemographicAnswerCount,
} from '@freedi/shared-types';
import { aggregateFromUserAverages } from './aggregator';

/**
 * @param userAverages - per-user pooled evaluation average for ONE aggregate
 * @param userAnswers - userId → (questionId → answer) map (whole sample)
 * @param questions - demographic questions in scope
 * @param kAnonymity - minimum cell size; slices below this are suppressed
 */
export function buildDemographicBreakdown(
	userAverages: Map<string, number>,
	userAnswers: Map<string, Map<string, string>>,
	questions: UserDemographicQuestion[],
	kAnonymity: number,
): DemographicSlice[] {
	const slices: DemographicSlice[] = [];

	for (const q of questions) {
		const qid = q.userQuestionId;
		if (!qid) continue;

		// Bucket the aggregate's evaluators by their answer to this question.
		const answerToUsers = new Map<string, string[]>();
		for (const userId of userAverages.keys()) {
			const ans = userAnswers.get(userId)?.get(qid);
			if (!ans) continue;
			const bucket = answerToUsers.get(ans);
			if (bucket) bucket.push(userId);
			else answerToUsers.set(ans, [userId]);
		}

		for (const [answer, userIds] of answerToUsers.entries()) {
			const suppressed = userIds.length < kAnonymity;
			const evaluation = suppressed ? null : aggregateFromUserAverages(userAverages, userIds);
			slices.push({
				demographicQuestionId: qid,
				demographicQuestionText: q.question,
				answer,
				evaluation: suppressed || !evaluation ? null : evaluation,
				suppressedByKAnonymity: suppressed,
			});
		}
	}

	return slices;
}

/**
 * Produce a per-question summary of demographic answer distribution across
 * the entire evaluator pool. K-anonymity also applied here.
 */
export function buildDemographicQuestionSummaries(
	allEvaluatorIds: Set<string>,
	userAnswers: Map<string, Map<string, string>>,
	questions: UserDemographicQuestion[],
	kAnonymity: number,
): DemographicQuestionSummary[] {
	const summaries: DemographicQuestionSummary[] = [];

	for (const q of questions) {
		const qid = q.userQuestionId;
		if (!qid) continue;

		const answerCounts = new Map<string, number>();
		let totalRespondents = 0;
		for (const userId of allEvaluatorIds) {
			const ans = userAnswers.get(userId)?.get(qid);
			if (!ans) continue;
			totalRespondents++;
			answerCounts.set(ans, (answerCounts.get(ans) ?? 0) + 1);
		}

		const answers: DemographicAnswerCount[] = [];
		for (const [answer, count] of answerCounts.entries()) {
			const suppressed = count < kAnonymity;
			answers.push({
				answer,
				count: suppressed ? 0 : count,
				suppressedByKAnonymity: suppressed,
			});
		}
		// Sort answers by count desc for readability
		answers.sort((a, b) => b.count - a.count);

		summaries.push({
			demographicQuestionId: qid,
			questionText: q.question,
			totalRespondents,
			answers,
		});
	}

	return summaries;
}
