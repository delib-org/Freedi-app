import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections, StatementType, functionConfig, type Statement } from '@freedi/shared-types';
import { ALLOWED_ORIGINS } from '../../config/cors';
import { loadSynthesisSettings } from '../pipeline/loadSynthesisSettings';
import { enqueueItem, initProgressDoc } from '../queue/enqueue';
import { QUEUE_COLLECTION, type ProgressDoc } from '../queue/types';
import { dissolveQuestionSynthesis } from '../derivedDocs';
import { assertSynthesisAdmin } from './assertSynthesisAdmin';

/**
 * Admin-initiated "Re-cluster" — clean the slate and rebuild from scratch.
 *
 * Unlike `synthesizeNow` (which skips options already in a cluster and piles
 * new synths on top of old ones), this first DISSOLVES every existing synth /
 * topic-cluster under the question via `dissolveQuestionSynthesis` — reversing
 * proper clusters (un-hiding members, undoing migrated evaluations, deleting the
 * cluster doc), deleting malformed/legacy derived docs, and restoring orphaned
 * hidden options. It then enqueues every eligible option for a fresh clustering
 * pass.
 *
 * This is the recovery path for questions whose clusters drifted (over-merged,
 * stale fallback titles, overlapping membership). The dissolve is synchronous;
 * the rebuild runs in the scheduled queue worker (1 min cadence). The UI
 * subscribes to `synthesisQueue/{questionId}` for live progress.
 */

interface ReClusterRequest {
	questionId: string;
}

interface ReClusterResponse {
	clustersReversed: number;
	docsArchived: number;
	membersRestored: number;
	orphansRestored: number;
	enqueued: number;
	etaMinutes: number;
}

function db() {
	return getFirestore();
}

async function isOperationInFlight(questionId: string): Promise<boolean> {
	const snap = await db().collection(QUEUE_COLLECTION).doc(questionId).get();
	if (!snap.exists) return false;
	const progress = snap.data() as ProgressDoc;

	return progress.status === 'running' || progress.status === 'paused';
}

export const reCluster = onCall<ReClusterRequest>(
	{
		timeoutSeconds: 540,
		memory: '1GiB',
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS],
	},
	async (request): Promise<ReClusterResponse> => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'User must be authenticated');
		const { questionId } = request.data;
		if (!questionId) throw new HttpsError('invalid-argument', 'questionId is required');

		await assertSynthesisAdmin(questionId, uid);

		if (await isOperationInFlight(questionId)) {
			throw new HttpsError(
				'already-exists',
				'A synthesis operation is already running for this question',
			);
		}

		// 1. Clean: dissolve all prior synthesis output so the rebuild is not
		// contaminated by stale clusters / drifted membership.
		const dissolve = await dissolveQuestionSynthesis(questionId, { reversedByUserId: uid });

		// 2. Rebuild: enqueue every eligible option. After the dissolve, members
		// are restored (integratedOptions cleared, un-hidden), so the
		// "already-clustered" skip below no longer excludes them.
		const settings = await loadSynthesisSettings(questionId);
		const optionsSnap = await db()
			.collection(Collections.statements)
			.where('parentId', '==', questionId)
			.where('statementType', '==', StatementType.option)
			.get();

		let enqueued = 0;
		let skippedClustered = 0;
		let skippedBelowThreshold = 0;
		for (const optionDoc of optionsSnap.docs) {
			const option = optionDoc.data() as Statement;
			if ((option.integratedOptions ?? []).length > 0) {
				skippedClustered++;
				continue;
			}
			const evals = option.evaluation?.numberOfEvaluators ?? 0;
			const cons = option.consensus ?? 0;
			if (evals < settings.minEvaluators || cons < settings.minConsensus) {
				skippedBelowThreshold++;
				continue;
			}
			await enqueueItem({
				questionId,
				kind: 'process-option',
				optionId: option.statementId,
				forceProcess: false,
			});
			enqueued++;
		}

		await initProgressDoc({
			questionId,
			enqueuedCount: enqueued,
			operation: 'recluster',
			initiatedBy: uid,
		});

		logger.info('reCluster.complete', {
			questionId,
			uid,
			...dissolve,
			enqueued,
			skippedClustered,
			skippedBelowThreshold,
			totalCandidates: optionsSnap.size,
		});

		return {
			clustersReversed: dissolve.clustersReversed,
			docsArchived: dissolve.docsArchived,
			membersRestored: dissolve.membersRestored,
			orphansRestored: dissolve.orphansRestored,
			enqueued,
			etaMinutes: Math.ceil(enqueued / 50),
		};
	},
);
