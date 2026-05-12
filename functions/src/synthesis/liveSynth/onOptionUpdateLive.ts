import { logger } from 'firebase-functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { Collections, Statement } from '@freedi/shared-types';
import { embeddingService } from '../../services/embedding-service';
import { embeddingCache } from '../../services/embedding-cache-service';
import { judgeSemanticEquivalenceCached } from '../../services/verdict-cache-service';
import { synthesisFlags } from '../featureFlags';
import { recordLiveSynthEvent } from './auditLog';
import { enqueueClusterRecompute, findClustersContainingMember } from './clusterRecompute';
import { cosineSimilarity } from '../bulkCluster';
import { pairKey } from '../completeLinkage';

/**
 * Live-synth edit invalidation.
 *
 * When an option that already belongs to one or more clusters has its
 * `statement` text edited, we have to re-validate that it still belongs
 * to those clusters — otherwise an unrelated edit could silently
 * misrepresent the cluster's content.
 *
 * Two-stage cost guard:
 *   1. Cheap cosine drift check vs the previous embedding. Drift below
 *      the `EMBEDDING_DRIFT_FLOOR` (0.05) means the meaning is essentially
 *      preserved (typo fix, light rewording) — skip the LLM entirely.
 *   2. LLM diff via the existing `verdictCache` keyed by (oldHash, newHash).
 *      If the verdict is anything other than "same", unlink the option from
 *      every cluster it currently sits in.
 *
 * Auto-dissolve: when a cluster's `integratedOptions` count drops to <2,
 * the cluster is meaningless (a "cluster of one" is just an option). The
 * cluster doc is deleted and any direct evaluations on it are archived
 * to `_orphanedClusterVotes/`. Members revert to standalone options.
 *
 * Failure mode is fail-open at every step. The user's edit always
 * succeeds; this trigger is a safety net for the cluster integrity
 * invariants.
 */

const EMBEDDING_DRIFT_FLOOR = 0.05;
const ORPHANED_VOTES_COLLECTION = '_orphanedClusterVotes';

function db() {
	return getFirestore();
}

interface EditDiff {
	statementId: string;
	parentId: string;
	oldText: string;
	newText: string;
}

/**
 * Decide whether the trigger should run at all. Returns the diff payload
 * when text actually changed; null otherwise.
 */
export function diffEditEvent(beforeRaw: unknown, afterRaw: unknown): EditDiff | null {
	if (!beforeRaw || !afterRaw) return null;
	const before = beforeRaw as Statement;
	const after = afterRaw as Statement;
	if (after.statementType !== 'option') return null;
	if (!after.statementId || !after.parentId) return null;
	const oldText = (before.statement ?? '').trim();
	const newText = (after.statement ?? '').trim();
	if (!newText) return null;
	if (newText === oldText) return null;

	return { statementId: after.statementId, parentId: after.parentId, oldText, newText };
}

interface DissolveContext {
	cluster: Statement;
	remainingMember: string;
}

/**
 * Delete a cluster whose member count has dropped below 2. Direct votes
 * on the cluster are archived to `_orphanedClusterVotes/` for forensic
 * recovery — synth-direct votes are rare but we don't want to silently
 * drop them.
 */
async function dissolveCluster(ctx: DissolveContext): Promise<void> {
	const { cluster, remainingMember } = ctx;
	const clusterId = cluster.statementId;

	// Archive direct synth votes (evaluations whose statementId equals
	// the cluster id). Best-effort: failures are logged and ignored.
	try {
		const directEvalsSnap = await db()
			.collection(Collections.evaluations)
			.where('statementId', '==', clusterId)
			.get();
		if (!directEvalsSnap.empty) {
			const archiveBatch = db().batch();
			directEvalsSnap.docs.forEach((doc) => {
				archiveBatch.set(db().collection(ORPHANED_VOTES_COLLECTION).doc(doc.id), {
					...doc.data(),
					originalCollection: Collections.evaluations,
					archivedAt: Date.now(),
					reason: 'cluster-dissolved',
					clusterId,
				});
			});
			await archiveBatch.commit();
		}
	} catch (error) {
		logger.warn('liveSynth.dissolve: archive of direct votes failed (non-fatal)', {
			clusterId,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	try {
		await db().collection(Collections.statements).doc(clusterId).delete();
	} catch (error) {
		logger.warn('liveSynth.dissolve: cluster delete failed', {
			clusterId,
			error: error instanceof Error ? error.message : String(error),
		});

		return;
	}

	logger.info('liveSynth.dissolve', {
		clusterId,
		remainingMember,
	});

	await recordLiveSynthEvent({
		action: 'dissolve',
		clusterId,
		reason: `member count dropped below 2 (remaining=${remainingMember})`,
		prevState: {
			integratedOptions: cluster.integratedOptions ?? [],
		},
		newState: { deleted: true, remainingMember },
		triggerSource: 'fn_onOptionUpdateLive',
		parentStatementId: cluster.parentId,
	});
}

interface UnlinkInput {
	cluster: Statement;
	optionId: string;
	reason: string;
}

async function unlinkOptionFromCluster(input: UnlinkInput): Promise<void> {
	const { cluster, optionId, reason } = input;
	const previousMembers = cluster.integratedOptions ?? [];
	if (!previousMembers.includes(optionId)) return;
	const newMembers = previousMembers.filter((id) => id !== optionId);

	const clusterRef = db().collection(Collections.statements).doc(cluster.statementId);
	try {
		await clusterRef.update({
			integratedOptions: FieldValue.arrayRemove(optionId),
			lastUpdate: Date.now(),
		});
	} catch (error) {
		logger.warn('liveSynth.unlink: cluster update failed', {
			clusterId: cluster.statementId,
			optionId,
			error: error instanceof Error ? error.message : String(error),
		});

		return;
	}

	logger.info('liveSynth.unlink', {
		clusterId: cluster.statementId,
		optionId,
		previousMemberCount: previousMembers.length,
		newMemberCount: newMembers.length,
		reason,
	});

	await recordLiveSynthEvent({
		action: 'unlink',
		clusterId: cluster.statementId,
		optionId,
		reason,
		prevState: { integratedOptions: previousMembers },
		newState: { integratedOptions: newMembers },
		triggerSource: 'fn_onOptionUpdateLive',
		parentStatementId: cluster.parentId,
	});

	if (newMembers.length < 2) {
		await dissolveCluster({
			cluster,
			remainingMember: newMembers[0] ?? '',
		});
	} else {
		// Member set still ≥ 2: recompute the cluster's aggregate without the
		// unlinked option's contribution. Honors the cluster-aware
		// polarization flag.
		await enqueueClusterRecompute(cluster.statementId, 'liveSynth:unlink');
	}
}

/**
 * Top-level handler. Same fail-open contract as `liveSynthOnOptionCreate`:
 * any error is logged but never propagated. The user's edit must succeed
 * regardless of live-synth state.
 */
export async function liveSynthOnOptionUpdate(
	beforeRaw: unknown,
	afterRaw: unknown,
): Promise<void> {
	if (!synthesisFlags.liveSynth) return;

	const diff = diffEditEvent(beforeRaw, afterRaw);
	if (!diff) return;

	try {
		const containingClusters = await findClustersContainingMember(diff.statementId);
		if (containingClusters.length === 0) return;

		// Stage 1: cheap cosine drift check. Skip LLM entirely if the
		// embedding barely moved.
		const newEmbedding = await embeddingService
			.generateEmbedding(diff.newText, diff.parentId)
			.then((r) => r.embedding)
			.catch((error) => {
				logger.warn('liveSynth.update: new embedding failed; skipping invalidation', {
					statementId: diff.statementId,
					error: error instanceof Error ? error.message : String(error),
				});

				return null;
			});
		if (!newEmbedding) return;

		const oldEmbeddingMap = await embeddingCache.getBatchEmbeddings([diff.statementId]);
		const oldEmbedding = oldEmbeddingMap.get(diff.statementId);
		const drift =
			oldEmbedding && oldEmbedding.length > 0
				? 1 - cosineSimilarity(oldEmbedding, newEmbedding)
				: 1; // no cached old embedding → treat as full drift to force re-check

		if (drift < EMBEDDING_DRIFT_FLOOR) {
			logger.debug('liveSynth.update: drift below floor, skipping LLM diff', {
				statementId: diff.statementId,
				drift: Number(drift.toFixed(4)),
			});

			return;
		}

		// Stage 2: LLM diff via existing verdict cache. We compose ONE pair
		// (old text vs new text) and use it for ALL containing clusters —
		// the meaning-change verdict is intrinsic to the option, not per-
		// cluster.
		const verdicts = await judgeSemanticEquivalenceCached([
			{
				pairId: pairKey(diff.statementId, `${diff.statementId}__updated`),
				textA: diff.oldText,
				textB: diff.newText,
			},
		]);
		const verdict = verdicts[0];
		if (!verdict) return;

		// Persist the new embedding so future drift checks compare against
		// the user's latest text. (Non-blocking; failures don't block the
		// invalidation decision below.)
		embeddingCache
			.saveEmbedding(diff.statementId, newEmbedding, diff.parentId, diff.newText)
			.catch((error) => {
				logger.warn('liveSynth.update: saveEmbedding failed (non-fatal)', {
					statementId: diff.statementId,
					error: error instanceof Error ? error.message : String(error),
				});
			});

		if (verdict.verdict === 'same') {
			// Meaning preserved despite drift — keep the membership. Still
			// trigger a recompute since the text shown in cluster context
			// may have shifted enough to affect downstream presentation.
			for (const cluster of containingClusters) {
				await enqueueClusterRecompute(cluster.statementId, 'liveSynth:textRefresh');
			}

			return;
		}

		// Verdict is one of 'related' | 'different' | 'opposite' — unlink
		// from every cluster the option currently sits in.
		const reason = `LLM verdict='${verdict.verdict}' on edit (drift=${drift.toFixed(3)})`;
		for (const cluster of containingClusters) {
			await unlinkOptionFromCluster({
				cluster,
				optionId: diff.statementId,
				reason,
			});
		}
	} catch (error) {
		logger.warn('liveSynth.onOptionUpdate: handler failed', {
			statementId: diff.statementId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export const __INTERNAL = {
	EMBEDDING_DRIFT_FLOOR,
	ORPHANED_VOTES_COLLECTION,
};
