import {
	ANSWER_BATCH,
	ProposalSampler,
	buildClusterMembershipMap,
	buildSynthMembershipMap,
	deriveSeenClusters,
	expandEvaluatedIds,
	getClusterKey,
	type GetAnswerBatchResponse,
	type Statement,
} from '@freedi/shared-types';

/**
 * What goes into a batch of answers to rate. The picking itself is the shared
 * Thompson sampler MC uses; this file decides what it may pick from, and makes
 * sure the order that comes back says nothing about any answer's score.
 */

/** Answers a participant may see: hidden ones (moderation, profanity) and topic groupings stay out. */
export function visibleAnswers(statements: readonly Statement[]): Statement[] {
	const covered = buildSynthMembershipMap([...statements]);

	return statements.filter(
		(answer) =>
			!answer.hide &&
			(!answer.isCluster || answer.derivedByPipeline === 'synthesis') &&
			!covered.has(answer.statementId),
	);
}

function isOwnAnswer(answer: Statement, uid: string): boolean {
	return answer.creatorId === uid || answer.creator?.uid === uid;
}

/** Fisher-Yates. The sampler returns its picks highest priority first, which leans towards score. */
function shuffled<T>(items: readonly T[]): T[] {
	const result = [...items];
	for (let index = result.length - 1; index > 0; index--) {
		const other = Math.floor(Math.random() * (index + 1));
		[result[index], result[other]] = [result[other], result[index]];
	}

	return result;
}

/** A size the caller asked for, reduced to a whole number the cap allows. */
export function resolveBatchSize(size: unknown): number {
	if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) {
		return ANSWER_BATCH.DEFAULT_SIZE;
	}

	return Math.min(size, ANSWER_BATCH.MAX_SIZE);
}

export interface AnswerBatchInput {
	/** Every option under the question, hidden ones included. */
	statements: readonly Statement[];
	/** The caller's rated answer ids, from their own evaluation rows. */
	ratedIds: Iterable<string>;
	uid: string;
	size: number;
}

export function selectAnswerBatch({
	statements,
	ratedIds,
	uid,
	size,
}: AnswerBatchInput): GetAnswerBatchResponse {
	const allStatements = [...statements];
	const answers = visibleAnswers(allStatements);
	const rateable = answers.filter((answer) => !isOwnAnswer(answer, uid));
	const rated = expandEvaluatedIds(ratedIds, allStatements);
	const membership = buildClusterMembershipMap(allStatements);
	const sampler = new ProposalSampler();

	const picked = sampler.selectForUser(rateable, rated, size, {
		clusterKeyOf: (answer) => getClusterKey(answer, membership),
		seenClusters: deriveSeenClusters(rated, membership),
	});
	const stats = sampler.calculateStats(rateable, rated, picked.length);

	return {
		answers: shuffled(picked),
		hasMore: stats.remainingCount > 0,
		totalAnswers: answers.length,
		stats,
	};
}
