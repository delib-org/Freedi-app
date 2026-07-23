import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections, StatementType, functionConfig, type Statement } from '@freedi/shared-types';
import { ALLOWED_ORIGINS } from '../../config/cors';
import {
	claimFieldsForSpawn,
	generateClaim,
	readClaimFields,
} from '../../services/claim-registry-service';
import { loadSynthesisSettings } from '../pipeline/loadSynthesisSettings';
import { enqueueItem, initProgressDoc } from '../queue/enqueue';
import { QUEUE_COLLECTION, type ProgressDoc } from '../queue/types';
import { assertSynthesisAdmin } from './assertSynthesisAdmin';

/**
 * Claim-registry first run — invoked when an admin turns `claimRegistryEnabled`
 * ON for a question (docs/architecture/CLAIM_REGISTRY.md §4). Two idempotent
 * steps, so re-enabling after a toggle-off performs an incremental catch-up:
 *
 *   1. BACKFILL — every live cluster under the question that lacks a
 *      `canonicalClaim` gets one generated (claim + public explanation) from
 *      its title/description/member texts. Clusters that already carry a
 *      claim are untouched.
 *
 *   2. CATCH-UP ENQUEUE — every unclustered option is enqueued through the
 *      existing synthesis queue (same mechanics as `synthesizeNow`), so the
 *      pipeline — with the registry pass now active — processes the backlog.
 *      Queue item IDs are deterministic, so double-enqueueing is harmless.
 *
 * Returns quickly relative to corpus size: backfill runs inline (one
 * WORKER_MODEL call per claim-less cluster, concurrency-limited by callLLM),
 * the option backlog is processed asynchronously by the queue worker.
 */

interface FirstRunRequest {
	questionId: string;
}

interface FirstRunResponse {
	backfilledClaims: number;
	enqueuedOptions: number;
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

export const claimRegistryFirstRun = onCall<FirstRunRequest>(
	{
		timeoutSeconds: 540,
		memory: '1GiB',
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS],
	},
	async (request): Promise<FirstRunResponse> => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'User must be authenticated');
		const { questionId } = request.data;
		if (!questionId) throw new HttpsError('invalid-argument', 'questionId is required');

		const parent = await assertSynthesisAdmin(questionId, uid);

		const settings = await loadSynthesisSettings(questionId);
		if (!settings.claimRegistryEnabled) {
			throw new HttpsError(
				'failed-precondition',
				'Enable the claim registry on this question before running the first run',
			);
		}

		if (await isOperationInFlight(questionId)) {
			throw new HttpsError(
				'already-exists',
				'A synthesis operation is already running for this question',
			);
		}

		const questionText = parent.statement || questionId;

		const allSnap = await db()
			.collection(Collections.statements)
			.where('parentId', '==', questionId)
			.where('statementType', '==', StatementType.option)
			.get();

		const statements = allSnap.docs.map((d) => d.data() as Statement);
		const byId = new Map(statements.map((s) => [s.statementId, s]));

		// ---- Step 1: backfill claims on claim-less live clusters -----------
		let backfilledClaims = 0;
		const clusters = statements.filter(
			(s) => s.isCluster === true && s.hide !== true && (s.integratedOptions ?? []).length > 0,
		);
		for (const cluster of clusters) {
			if (readClaimFields(cluster) !== null) continue;
			const memberTexts = (cluster.integratedOptions ?? [])
				.map((id) => byId.get(id)?.statement)
				.filter((t): t is string => typeof t === 'string' && t.length > 0);
			// The existing title/description lead the generation input — for a
			// synth they already ARE a unified proposal; members add grounding.
			const texts = [cluster.statement, ...memberTexts].filter(
				(t): t is string => typeof t === 'string' && t.length > 0,
			);
			const generated = await generateClaim({ questionText, texts });
			if (!generated.canonicalClaim) continue;
			try {
				await db()
					.collection(Collections.statements)
					.doc(cluster.statementId)
					.update({
						...claimFieldsForSpawn(generated.canonicalClaim, generated.publicExplanation),
						// Backfilled clusters keep confirmed status if they're mature.
						claimStatus:
							(cluster.integratedOptions ?? []).length >= 3 ? 'confirmed' : 'provisional',
						lastUpdate: Date.now(),
					});
				backfilledClaims++;
			} catch (error) {
				logger.warn('claimRegistryFirstRun: backfill write failed', {
					clusterId: cluster.statementId,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		// ---- Step 2: enqueue unclustered options through the queue ---------
		const memberIds = new Set<string>();
		for (const cluster of clusters) {
			for (const m of cluster.integratedOptions ?? []) memberIds.add(m);
		}

		let enqueuedOptions = 0;
		for (const statement of statements) {
			if (statement.isCluster === true) continue;
			if (memberIds.has(statement.statementId)) continue;
			if ((statement.integratedOptions ?? []).length > 0) continue;
			await enqueueItem({
				questionId,
				kind: 'process-option',
				optionId: statement.statementId,
				forceProcess: false,
			});
			enqueuedOptions++;
		}

		await initProgressDoc({
			questionId,
			enqueuedCount: enqueuedOptions,
			operation: 'synthesizeNow',
			initiatedBy: uid,
		});

		logger.info('claimRegistryFirstRun.done', {
			questionId,
			uid,
			backfilledClaims,
			enqueuedOptions,
			clusterCount: clusters.length,
			totalStatements: statements.length,
		});

		return {
			backfilledClaims,
			enqueuedOptions,
			etaMinutes: Math.ceil(enqueuedOptions / 50),
		};
	},
);
