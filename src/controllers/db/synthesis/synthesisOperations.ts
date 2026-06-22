import { httpsCallable } from 'firebase/functions';
import { functions } from '../config';
import { logError } from '@/utils/errorHandling';
import { logger } from '@/services/logger';

/**
 * Admin-initiated synthesis callables.
 *
 * Each function is a thin client-side wrapper around the corresponding
 * Cloud Function. The server enforces admin permissions, threshold
 * validation, and concurrency. The client just relays inputs and surfaces
 * errors back to the UI.
 */

interface QuestionOnlyRequest {
	questionId: string;
}

interface SynthesizeNowResponse {
	enqueued: number;
	etaMinutes: number;
}

export async function triggerSynthesizeNow(questionId: string): Promise<SynthesizeNowResponse> {
	try {
		const call = httpsCallable<QuestionOnlyRequest, SynthesizeNowResponse>(
			functions,
			'synthesizeNow',
		);
		const result = await call({ questionId });
		logger.info('Synthesis run queued', { questionId, ...result.data });

		return result.data;
	} catch (error) {
		logError(error, { operation: 'synthesis.triggerSynthesizeNow', statementId: questionId });
		throw error;
	}
}

interface ReClusterResponse {
	clustersReversed: number;
	docsArchived: number;
	membersRestored: number;
	orphansRestored: number;
	enqueued: number;
	etaMinutes: number;
}

/**
 * Clean-then-rebuild: dissolves every existing synth/cluster under the
 * question, then re-enqueues all eligible options for a fresh clustering run.
 * Use this to recover questions whose clusters drifted (over-merged, stale
 * titles, overlapping membership).
 */
export async function triggerReCluster(questionId: string): Promise<ReClusterResponse> {
	try {
		const call = httpsCallable<QuestionOnlyRequest, ReClusterResponse>(functions, 'reCluster');
		const result = await call({ questionId });
		logger.info('Re-cluster run queued', { questionId, ...result.data });

		return result.data;
	} catch (error) {
		logError(error, { operation: 'synthesis.triggerReCluster', statementId: questionId });
		throw error;
	}
}

interface GlobalClusterResponse {
	clustersReversed: number;
	docsArchived: number;
	membersRestored: number;
	evaluationsDeleted: number;
	eligibleOptions: number;
	groupsFound: number;
	synthsCreated: number;
	topicsCreated: number;
	singletons: number;
	clusterThreshold: number;
	synthLowerBound: number;
}

/**
 * One-shot whole-question clustering: dissolves existing synthesis, then groups
 * ALL eligible options at once (cosine edges + connected components). Tight
 * groups become synths, looser ones topic clusters — using the SAME thresholds
 * configured under "Advanced similarity thresholds". Unlike re-cluster
 * (incremental, one option at a time), this sees the whole corpus together and
 * surfaces themes the incremental pass misses.
 */
export async function triggerGlobalCluster(questionId: string): Promise<GlobalClusterResponse> {
	try {
		const call = httpsCallable<QuestionOnlyRequest, GlobalClusterResponse>(
			functions,
			'globalCluster',
		);
		const result = await call({ questionId });
		logger.info('Global cluster run complete', { questionId, ...result.data });

		return result.data;
	} catch (error) {
		logError(error, { operation: 'synthesis.triggerGlobalCluster', statementId: questionId });
		throw error;
	}
}

interface ReEmbedResponse {
	total: number;
	embedded: number;
	skipped: number;
	failed: number;
}

/**
 * Regenerate every option's embedding under the question (gist-based), so a
 * subsequent re-cluster / global-cluster run compares consistent vectors.
 * Run this once after enabling gist embeddings before clustering.
 */
export async function triggerReEmbed(questionId: string): Promise<ReEmbedResponse> {
	try {
		const call = httpsCallable<QuestionOnlyRequest, ReEmbedResponse>(functions, 'reEmbedQuestion');
		const result = await call({ questionId });
		logger.info('Re-embed complete', { questionId, ...result.data });

		return result.data;
	} catch (error) {
		logError(error, { operation: 'synthesis.triggerReEmbed', statementId: questionId });
		throw error;
	}
}

interface SynthesizeSelectedRequest {
	questionId: string;
	optionIds: string[];
}

interface SynthesizeSelectedResponse {
	enqueued: number;
	skipped: number;
	etaMinutes: number;
	mergedIntoExistingRun: boolean;
}

export async function triggerSynthesizeSelected(
	questionId: string,
	optionIds: string[],
): Promise<SynthesizeSelectedResponse> {
	try {
		const call = httpsCallable<SynthesizeSelectedRequest, SynthesizeSelectedResponse>(
			functions,
			'synthesizeSelected',
		);
		const result = await call({ questionId, optionIds });
		logger.info('Selective synthesis queued', {
			questionId,
			selected: optionIds.length,
			...result.data,
		});

		return result.data;
	} catch (error) {
		logError(error, {
			operation: 'synthesis.triggerSynthesizeSelected',
			statementId: questionId,
		});
		throw error;
	}
}

interface RejudgeResponse {
	pairsEnqueued: number;
	clustersScanned: number;
	mergedIntoExistingRun: boolean;
}

export async function triggerRejudgeGrayBand(questionId: string): Promise<RejudgeResponse> {
	try {
		const call = httpsCallable<QuestionOnlyRequest, RejudgeResponse>(functions, 'rejudgeGrayBand');
		const result = await call({ questionId });
		logger.info('Gray-band rejudge queued', { questionId, ...result.data });

		return result.data;
	} catch (error) {
		logError(error, {
			operation: 'synthesis.triggerRejudgeGrayBand',
			statementId: questionId,
		});
		throw error;
	}
}

export async function synthesisPause(questionId: string): Promise<void> {
	try {
		const call = httpsCallable<QuestionOnlyRequest, { paused: true }>(functions, 'synthesisPause');
		await call({ questionId });
	} catch (error) {
		logError(error, { operation: 'synthesis.synthesisPause', statementId: questionId });
		throw error;
	}
}

export async function synthesisResume(questionId: string): Promise<void> {
	try {
		const call = httpsCallable<QuestionOnlyRequest, { resumed: true }>(
			functions,
			'synthesisResume',
		);
		await call({ questionId });
	} catch (error) {
		logError(error, { operation: 'synthesis.synthesisResume', statementId: questionId });
		throw error;
	}
}

export async function synthesisCancel(questionId: string): Promise<{ deletedItems: number }> {
	try {
		const call = httpsCallable<QuestionOnlyRequest, { cancelled: true; deletedItems: number }>(
			functions,
			'synthesisCancel',
		);
		const result = await call({ questionId });

		return { deletedItems: result.data.deletedItems };
	} catch (error) {
		logError(error, { operation: 'synthesis.synthesisCancel', statementId: questionId });
		throw error;
	}
}
