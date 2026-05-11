import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { Collections, Statement } from '@freedi/shared-types';
import { logger } from 'firebase-functions';

/**
 * Reverses an integration / synthesis operation, restoring the original
 * statements and soft-deleting the cluster. Mirrors `performIntegration`
 * by undoing each side effect:
 *
 *   1. Originals: clear `hide` and `integratedInto` so they re-appear in
 *      the parent's options list with their pre-merge evaluation intact.
 *   2. Cluster: marked `hide: true` and stamped with `reversedAt` /
 *      `reversedBy`. We keep `integratedOptions` and `derivedByPipeline`
 *      for audit — the cluster doc remains queryable, just hidden from
 *      participants.
 *   3. Migrated evaluations on the cluster (those carrying `migratedAt`)
 *      are deleted so the original-evaluation totals on the parent are
 *      not double-counted by `updateParentTotalEvaluators`.
 *
 * The cluster's own consensus / evaluation aggregations are kept on the
 * doc but the cluster is hidden, so consumers who filter `!hide` will
 * stop showing it. Callers can re-run synthesis to rebuild it.
 *
 * Caller is responsible for authentication and authorization.
 */
export interface ReverseIntegrationInput {
	clusterStatementId: string;
	reversedByUserId: string;
}

export interface ReverseIntegrationResult {
	clusterStatementId: string;
	parentStatementId: string;
	restoredOriginalIds: string[];
	deletedEvaluationsCount: number;
}

export async function reverseIntegration(
	input: ReverseIntegrationInput,
): Promise<ReverseIntegrationResult> {
	const { clusterStatementId, reversedByUserId } = input;

	if (!clusterStatementId) {
		throw new Error('reverseIntegration: clusterStatementId is required');
	}

	const db = getFirestore();
	const clusterRef = db.collection(Collections.statements).doc(clusterStatementId);
	const clusterDoc = await clusterRef.get();

	if (!clusterDoc.exists) {
		throw new Error(`reverseIntegration: cluster ${clusterStatementId} not found`);
	}

	const cluster = clusterDoc.data() as Statement;

	if (cluster.isCluster !== true) {
		throw new Error(
			`reverseIntegration: statement ${clusterStatementId} is not a cluster (isCluster !== true)`,
		);
	}

	const integratedOptions = cluster.integratedOptions ?? [];
	if (integratedOptions.length === 0) {
		throw new Error(
			`reverseIntegration: cluster ${clusterStatementId} has no integratedOptions to restore`,
		);
	}

	const parentStatementId = cluster.parentId;
	const now = Date.now();

	// 1. Restore originals — unhide and detach the integratedInto pointer.
	//    We use a single batch; if the list ever exceeds the 500-write limit
	//    the existing executeBatchUpdates utility could be plugged in, but
	//    synthesis groups are small (< 50 typical).
	const restoreBatch = db.batch();
	const restoredIds: string[] = [];
	for (const originalId of integratedOptions) {
		const ref = db.collection(Collections.statements).doc(originalId);
		const doc = await ref.get();
		if (!doc.exists) {
			logger.warn(`reverseIntegration: original ${originalId} not found, skipping`);
			continue;
		}
		restoreBatch.update(ref, {
			hide: false,
			integratedInto: FieldValue.delete(),
			lastUpdate: now,
		});
		restoredIds.push(originalId);
	}
	await restoreBatch.commit();

	// 2. Delete migrated evaluations on the cluster — they were synthesized
	//    from the originals at integration time and would double-count
	//    against the parent now that originals are visible again. We only
	//    delete docs that carry the `migratedAt` flag set by
	//    `migrateEvaluationsToNewStatement`; any direct evaluations made on
	//    the cluster are preserved (they belong to users who voted on the
	//    cluster itself, not on its sources).
	const evalSnap = await db
		.collection(Collections.evaluations)
		.where('statementId', '==', clusterStatementId)
		.get();

	let deletedEvaluations = 0;
	if (!evalSnap.empty) {
		const evalBatch = db.batch();
		evalSnap.forEach((doc) => {
			const data = doc.data() as { migratedAt?: number };
			if (typeof data.migratedAt === 'number') {
				evalBatch.delete(doc.ref);
				deletedEvaluations++;
			}
		});
		if (deletedEvaluations > 0) {
			await evalBatch.commit();
		}
	}

	// 3. Soft-delete the cluster — hide it but keep audit fields. Consumers
	//    that filter `!hide` (which includes `getOptionsUsingMethod` and the
	//    suggestions list) will stop showing it. The full audit trail
	//    (integratedOptions, derivedByPipeline, original evaluation) is
	//    preserved on the doc for forensics.
	await clusterRef.update({
		hide: true,
		reversedAt: now,
		reversedBy: reversedByUserId,
		lastUpdate: now,
	});

	// 4. Bump parent so client subscriptions invalidate caches.
	if (parentStatementId) {
		await db.collection(Collections.statements).doc(parentStatementId).update({
			lastChildUpdate: now,
			lastUpdate: now,
		});
	}

	logger.info('reverseIntegration: complete', {
		clusterStatementId,
		parentStatementId,
		restored: restoredIds.length,
		deletedEvaluations,
	});

	return {
		clusterStatementId,
		parentStatementId: parentStatementId ?? '',
		restoredOriginalIds: restoredIds,
		deletedEvaluationsCount: deletedEvaluations,
	};
}
