import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, type Statement } from '@freedi/shared-types';
import { recordLiveSynthEvent } from '../liveSynth/auditLog';
import { enqueueClusterRecompute } from '../liveSynth/clusterRecompute';

/**
 * Merge `loser` cluster into `winner` cluster.
 *
 * Winner inherits the union of `integratedOptions`. Loser is marked
 * `mergedInto: winner.statementId` and hidden so it disappears from the
 * cluster list but remains in the database for audit and recovery.
 *
 * NOTE: this is the pipeline-internal merge. The Cloud Functions codebase
 * also has a `mergeClusters` callable at `condensation/fn_mergeClusters.ts`
 * with broader semantics (link cleanup, polarization recompute, etc.) — we
 * intentionally don't reuse it here because:
 *   1. That callable expects HTTP-callable auth context (we're internal).
 *   2. Its scope is different (cleans up cluster-linked entities the
 *      synthesis pipeline doesn't create).
 *   3. Coupling the queue worker to a callable would make tests harder.
 *
 * If we later need the broader cleanup behavior, we can extract the shared
 * logic into a `mergeClustersCore()` helper that both call.
 */

interface MergeInput {
	winnerId: string;
	loserId: string;
	reason: string;
}

function db() {
	return getFirestore();
}

export async function mergeClusters(input: MergeInput): Promise<void> {
	const { winnerId, loserId, reason } = input;
	if (winnerId === loserId) return;

	const [winnerSnap, loserSnap] = await Promise.all([
		db().collection(Collections.statements).doc(winnerId).get(),
		db().collection(Collections.statements).doc(loserId).get(),
	]);
	if (!winnerSnap.exists || !loserSnap.exists) {
		logger.info('synthesis.mergeClusters: one cluster missing, skipping', {
			winnerId,
			loserId,
		});

		return;
	}

	const winner = winnerSnap.data() as Statement;
	const loser = loserSnap.data() as Statement;
	const winnerMembers = winner.integratedOptions ?? [];
	const loserMembers = loser.integratedOptions ?? [];
	const mergedMembers = Array.from(new Set([...winnerMembers, ...loserMembers]));

	const batch = db().batch();
	const winnerRef = db().collection(Collections.statements).doc(winnerId);
	const loserRef = db().collection(Collections.statements).doc(loserId);
	const now = Date.now();

	batch.update(winnerRef, {
		integratedOptions: mergedMembers,
		lastUpdate: now,
	});
	batch.update(loserRef, {
		integratedOptions: [],
		mergedInto: winnerId,
		hide: true,
		lastUpdate: now,
	});

	try {
		await batch.commit();
	} catch (error) {
		logger.warn('synthesis.mergeClusters: batch commit failed', {
			winnerId,
			loserId,
			error: error instanceof Error ? error.message : String(error),
		});

		return;
	}

	await recordLiveSynthEvent({
		action: 'spawn',
		clusterId: winnerId,
		optionId: '',
		reason: `merge: ${reason}`,
		prevState: {
			winnerMembers,
			loserMembers,
		},
		newState: {
			mergedMembers,
			absorbedClusterId: loserId,
		},
		triggerSource: 'pipeline:mergeClusters',
		parentStatementId: winner.parentId,
	});

	// Re-aggregate the winner's evaluation now that it has new members.
	await enqueueClusterRecompute(winnerId, 'pipeline:mergeClusters', winner.creatorId);
}
