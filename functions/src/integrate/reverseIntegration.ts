import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { Collections, Statement } from '@freedi/shared-types';
import { logger } from 'firebase-functions';

/**
 * Delete evaluation docs whose `statementId` is `statementId`, chunked to stay
 * under the 500-write batch limit. Pass `migratedOnly` to delete only synthesized
 * (`migratedAt`) evaluations and preserve direct votes; omit it to delete every
 * evaluation (used when the host statement is being hard-deleted, so nothing is
 * left pointing at a gone doc). Returns the number deleted.
 */
export async function deleteEvaluationsForStatement(
	db: Firestore,
	statementId: string,
	opts: { migratedOnly?: boolean } = {},
): Promise<number> {
	const snap = await db
		.collection(Collections.evaluations)
		.where('statementId', '==', statementId)
		.get();
	const docs = opts.migratedOnly
		? snap.docs.filter((d) => typeof (d.data() as { migratedAt?: number }).migratedAt === 'number')
		: snap.docs;

	let deleted = 0;
	for (let i = 0; i < docs.length; i += 400) {
		const batch = db.batch();
		for (const d of docs.slice(i, i + 400)) {
			batch.delete(d.ref);
			deleted++;
		}
		await batch.commit();
	}

	return deleted;
}

/**
 * Reverses an integration / synthesis operation, restoring the original
 * statements and removing the cluster. Mirrors `performIntegration`
 * by undoing each side effect:
 *
 *   1. Originals: clear `hide` and `integratedInto` so they re-appear in
 *      the parent's options list with their pre-merge evaluation intact.
 *   2. Cluster: either hard-deleted (`deleteCluster: true`) or soft-hidden
 *      (`hide: true` + `reversedAt` / `reversedBy`). Soft-hide keeps
 *      `integratedOptions` and `derivedByPipeline` on the doc for audit and
 *      keeps the action undoable; hard-delete removes the doc entirely so a
 *      stale cluster disappears from EVERY view (including the tree view,
 *      which does not filter `hide`).
 *   3. Evaluations on the cluster: soft-hide deletes only migrated evals
 *      (those carrying `migratedAt`) so the original-evaluation totals on
 *      the parent are not double-counted by `updateParentTotalEvaluators`;
 *      hard-delete removes every evaluation on the cluster so none is left
 *      orphaned once the doc is gone.
 *
 * Soft-hide keeps the cluster's own consensus / evaluation aggregations on
 * the doc; consumers who filter `!hide` stop showing it. Callers can re-run
 * synthesis to rebuild it.
 *
 * Caller is responsible for authentication and authorization.
 */
export interface ReverseIntegrationInput {
	clusterStatementId: string;
	reversedByUserId: string;
	/**
	 * When true, hard-delete the cluster document instead of soft-hiding it.
	 * Used by the re-cluster cleanup so stale clusters leave Firestore entirely
	 * (the tree view renders hidden docs, so hiding alone leaves ghosts). The
	 * manual single-cluster reverse defaults to false so it stays undoable.
	 */
	deleteCluster?: boolean;
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
	const { clusterStatementId, reversedByUserId, deleteCluster = false } = input;

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

	// 2. Delete evaluations on the cluster. When soft-hiding we remove only
	//    migrated evals (synthesized from the originals at integration time)
	//    so they don't double-count against the parent now that the originals
	//    are visible again, preserving direct votes on the cluster itself.
	//    When hard-deleting the cluster we remove ALL of its evaluations —
	//    direct votes included — so nothing is left pointing at a gone doc.
	const deletedEvaluations = await deleteEvaluationsForStatement(db, clusterStatementId, {
		migratedOnly: !deleteCluster,
	});

	// 3. Remove the cluster. Re-cluster cleanup hard-deletes so the stale doc
	//    leaves Firestore entirely (the tree view renders hidden docs, so a
	//    soft-hide would leave a ghost node). The manual single-cluster reverse
	//    soft-hides instead, keeping the full audit trail (integratedOptions,
	//    derivedByPipeline, original evaluation) so the action stays undoable.
	if (deleteCluster) {
		await clusterRef.delete();
	} else {
		await clusterRef.update({
			hide: true,
			reversedAt: now,
			reversedBy: reversedByUserId,
			lastUpdate: now,
		});
	}

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
