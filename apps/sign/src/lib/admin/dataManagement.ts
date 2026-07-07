/**
 * Admin data-management utilities for the Sign app.
 *
 * Provides *recoverable* deletion: instead of hard-deleting user data, every
 * deletion snapshots the affected documents into an archive "batch" and then
 * removes them from the live collections. The live data is genuinely gone
 * (reads, exports and consensus counters all exclude it), but any batch can be
 * restored with one click if the deletion was a mistake.
 *
 * Covered per-user footprint on a document:
 *   - signatures        (by userId + documentId)
 *   - statements        (comments/suggestions, by creatorId + topParentId)
 *   - evaluations       (by evaluatorId + documentId) — reverses consensus
 *   - approval          (by userId + documentId)
 *   - usersData         (demographics, by odlUserId + statementId)
 *   - paragraphViews    (dwell time, by visitorId + documentId)
 */

import { Firestore, FieldValue, DocumentData } from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';

/** Archive of deleted documents, grouped into restorable batches. */
export const DELETION_ARCHIVE_COLLECTION = 'signDeletionArchive';
/** paragraphViews is a Sign-app-local collection (not in the shared Collections enum). */
export const PARAGRAPH_VIEWS_COLLECTION = 'paragraphViews';
/** Tombstones written by the backend on statement deletion (delta-listener sync). */
const STATEMENT_DELETIONS_COLLECTION = 'statementDeletions';

/** Max writes per Firestore batch (hard limit is 500; keep headroom for triples). */
const BATCH_WRITE_LIMIT = 400;

export type DeletionBatchType = 'clearTestData' | 'purgeUser' | 'deleteStatement';

export interface DeletionBatch {
	batchId: string;
	documentId: string;
	type: DeletionBatchType;
	targetUserId?: string;
	targetStatementId?: string;
	deletedBy: string;
	deletedByName?: string;
	deletedAt: number;
	itemCount: number;
	status: 'active' | 'restored';
	restoredAt?: number;
	restoredBy?: string;
}

/** A single archived document with everything needed to restore it exactly. */
interface ArchivedItem {
	/** Top-level Firestore collection name. */
	collection: string;
	/** Document id within that collection. */
	docId: string;
	/** Full snapshot of the document data. */
	data: DocumentData;
	/**
	 * Consensus reversal to apply on delete (and re-apply on restore) when this
	 * item is an evaluation whose target statement survives the batch.
	 */
	consensusReversal?: { statementId: string; delta: number };
}

/** A document to be collected for deletion. */
interface CollectedDoc {
	collection: string;
	docId: string;
	data: DocumentData;
	/** For evaluations: the target statement + the raw evaluation value. */
	evaluation?: { statementId: string; value: number };
}

/**
 * Collect every document belonging to a single user on a document.
 */
async function collectUserDocs(
	db: Firestore,
	documentId: string,
	targetUserId: string
): Promise<CollectedDoc[]> {
	const collected: CollectedDoc[] = [];

	const [signaturesSnap, statementsSnap, evaluationsSnap, approvalsSnap, usersDataSnap, viewsSnap] =
		await Promise.all([
			db.collection(Collections.signatures)
				.where('documentId', '==', documentId)
				.where('userId', '==', targetUserId)
				.get(),
			db.collection(Collections.statements)
				.where('topParentId', '==', documentId)
				.where('creatorId', '==', targetUserId)
				.get(),
			db.collection(Collections.evaluations)
				.where('documentId', '==', documentId)
				.where('evaluatorId', '==', targetUserId)
				.get(),
			db.collection(Collections.approval)
				.where('documentId', '==', documentId)
				.where('userId', '==', targetUserId)
				.get(),
			db.collection(Collections.usersData)
				.where('statementId', '==', documentId)
				.where('odlUserId', '==', targetUserId)
				.get(),
			db.collection(PARAGRAPH_VIEWS_COLLECTION)
				.where('documentId', '==', documentId)
				.where('visitorId', '==', targetUserId)
				.get(),
		]);

	signaturesSnap.docs.forEach((d) => collected.push({ collection: Collections.signatures, docId: d.id, data: d.data() }));
	statementsSnap.docs.forEach((d) => collected.push({ collection: Collections.statements, docId: d.id, data: d.data() }));
	approvalsSnap.docs.forEach((d) => collected.push({ collection: Collections.approval, docId: d.id, data: d.data() }));
	usersDataSnap.docs.forEach((d) => collected.push({ collection: Collections.usersData, docId: d.id, data: d.data() }));
	viewsSnap.docs.forEach((d) => collected.push({ collection: PARAGRAPH_VIEWS_COLLECTION, docId: d.id, data: d.data() }));
	evaluationsSnap.docs.forEach((d) => {
		const data = d.data();
		collected.push({
			collection: Collections.evaluations,
			docId: d.id,
			data,
			evaluation: { statementId: data.statementId, value: data.evaluation || 0 },
		});
	});

	return collected;
}

/**
 * Collect every interaction on a document (for "clear test data"). Keeps the
 * document itself and its paragraph statements — only removes user interactions
 * (signatures, comments, suggestions, evaluations, approvals, views, demographics).
 */
async function collectAllInteractionDocs(
	db: Firestore,
	documentId: string
): Promise<CollectedDoc[]> {
	const collected: CollectedDoc[] = [];

	const [signaturesSnap, evaluationsSnap, approvalsSnap, usersDataSnap, viewsSnap, commentsSnap, suggestionsSnap] =
		await Promise.all([
			db.collection(Collections.signatures).where('documentId', '==', documentId).get(),
			db.collection(Collections.evaluations).where('documentId', '==', documentId).get(),
			db.collection(Collections.approval).where('documentId', '==', documentId).get(),
			db.collection(Collections.usersData).where('statementId', '==', documentId).get(),
			db.collection(PARAGRAPH_VIEWS_COLLECTION).where('documentId', '==', documentId).get(),
			// Comments = statementType 'statement'; suggestions = statementType 'option'.
			db.collection(Collections.statements)
				.where('topParentId', '==', documentId)
				.where('statementType', '==', 'statement')
				.get(),
			db.collection(Collections.statements)
				.where('topParentId', '==', documentId)
				.where('statementType', '==', 'option')
				.get(),
		]);

	signaturesSnap.docs.forEach((d) => collected.push({ collection: Collections.signatures, docId: d.id, data: d.data() }));
	approvalsSnap.docs.forEach((d) => collected.push({ collection: Collections.approval, docId: d.id, data: d.data() }));
	usersDataSnap.docs.forEach((d) => collected.push({ collection: Collections.usersData, docId: d.id, data: d.data() }));
	viewsSnap.docs.forEach((d) => collected.push({ collection: PARAGRAPH_VIEWS_COLLECTION, docId: d.id, data: d.data() }));
	commentsSnap.docs.forEach((d) => collected.push({ collection: Collections.statements, docId: d.id, data: d.data() }));
	suggestionsSnap.docs.forEach((d) => collected.push({ collection: Collections.statements, docId: d.id, data: d.data() }));
	evaluationsSnap.docs.forEach((d) => {
		const data = d.data();
		collected.push({
			collection: Collections.evaluations,
			docId: d.id,
			data,
			evaluation: { statementId: data.statementId, value: data.evaluation || 0 },
		});
	});

	return collected;
}

/**
 * Commit an array of write operations in Firestore batches, respecting the
 * 500-write limit. Each op mutates a single ref.
 */
async function commitInBatches(
	db: Firestore,
	ops: Array<(batch: FirebaseFirestore.WriteBatch) => void>
): Promise<void> {
	for (let i = 0; i < ops.length; i += BATCH_WRITE_LIMIT) {
		const batch = db.batch();
		ops.slice(i, i + BATCH_WRITE_LIMIT).forEach((op) => op(batch));
		await batch.commit();
	}
}

/**
 * Archive a set of collected documents into a restorable batch, then delete
 * them from the live collections. Evaluations reverse their consensus
 * contribution on surviving target statements and are stamped `source:'sign'`
 * so the backend delete-trigger is skipped.
 */
async function archiveAndDelete(
	db: Firestore,
	documentId: string,
	collected: CollectedDoc[],
	meta: Omit<DeletionBatch, 'batchId' | 'itemCount' | 'documentId' | 'deletedAt' | 'status'>,
	deletedAt: number
): Promise<{ batchId: string; itemCount: number }> {
	const batchRef = db.collection(DELETION_ARCHIVE_COLLECTION).doc();
	const batchId = batchRef.id;

	// statementIds being deleted in this batch — their consensus is moot.
	const deletedStatementIds = new Set(
		collected.filter((c) => c.collection === Collections.statements).map((c) => c.docId)
	);

	// 1. Pre-stamp evaluations with source:'sign' so the backend delete-trigger
	//    skips reprocessing. Done as its own pass so we never write and delete the
	//    same document in one batch (Firestore forbids that).
	const evalStampOps = collected
		.filter((c) => c.collection === Collections.evaluations)
		.map((c) => (batch: FirebaseFirestore.WriteBatch) =>
			batch.update(db.collection(Collections.evaluations).doc(c.docId), { source: 'sign' })
		);
	await commitInBatches(db, evalStampOps);

	// 2. Aggregate consensus reversals per surviving target statement so a target
	//    is never written twice in one batch.
	const consensusByTarget = new Map<string, number>();

	const ops: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];

	for (const doc of collected) {
		const item: ArchivedItem = {
			collection: doc.collection,
			docId: doc.docId,
			data: doc.data,
		};

		// Consensus reversal only when the target statement survives this batch.
		if (
			doc.collection === Collections.evaluations &&
			doc.evaluation &&
			doc.evaluation.value !== 0 &&
			!deletedStatementIds.has(doc.evaluation.statementId)
		) {
			item.consensusReversal = { statementId: doc.evaluation.statementId, delta: doc.evaluation.value };
			consensusByTarget.set(
				doc.evaluation.statementId,
				(consensusByTarget.get(doc.evaluation.statementId) || 0) + doc.evaluation.value
			);
		}

		const itemRef = batchRef.collection('items').doc();
		ops.push((batch) => batch.set(itemRef, item));

		const liveRef = db.collection(doc.collection).doc(doc.docId);
		ops.push((batch) => batch.delete(liveRef));
	}

	// One consensus update per target statement (reverse the sum of removed votes).
	for (const [statementId, delta] of consensusByTarget) {
		const targetRef = db.collection(Collections.statements).doc(statementId);
		ops.push((batch) => batch.update(targetRef, { consensus: FieldValue.increment(-delta), lastUpdate: deletedAt }));
	}

	await commitInBatches(db, ops);

	// 2. Write the batch metadata doc (after items exist).
	const batchDoc: DeletionBatch = {
		batchId,
		documentId,
		deletedAt,
		itemCount: collected.length,
		status: 'active',
		...meta,
	};
	await batchRef.set(batchDoc);

	logger.info(`[DataManagement] Archived batch ${batchId} (${collected.length} items, type=${meta.type}) on ${documentId}`);

	return { batchId, itemCount: collected.length };
}

/** Delete all of a single user's data on a document (recoverable). */
export async function purgeUserData(
	db: Firestore,
	documentId: string,
	targetUserId: string,
	deletedBy: string,
	deletedByName: string | undefined,
	deletedAt: number
): Promise<{ batchId: string; itemCount: number }> {
	const collected = await collectUserDocs(db, documentId, targetUserId);

	return archiveAndDelete(
		db,
		documentId,
		collected,
		{ type: 'purgeUser', targetUserId, deletedBy, deletedByName },
		deletedAt
	);
}

/** Delete all interactions on a document, keeping the document + paragraphs (recoverable). */
export async function clearTestData(
	db: Firestore,
	documentId: string,
	deletedBy: string,
	deletedByName: string | undefined,
	deletedAt: number
): Promise<{ batchId: string; itemCount: number }> {
	const collected = await collectAllInteractionDocs(db, documentId);

	return archiveAndDelete(
		db,
		documentId,
		collected,
		{ type: 'clearTestData', deletedBy, deletedByName },
		deletedAt
	);
}

/** Delete a single comment/suggestion statement and its evaluations (recoverable). */
export async function deleteStatement(
	db: Firestore,
	documentId: string,
	statementId: string,
	deletedBy: string,
	deletedByName: string | undefined,
	deletedAt: number
): Promise<{ batchId: string; itemCount: number }> {
	const [statementSnap, evaluationsSnap] = await Promise.all([
		db.collection(Collections.statements).doc(statementId).get(),
		db.collection(Collections.evaluations).where('statementId', '==', statementId).get(),
	]);

	if (!statementSnap.exists) {
		throw new Error('Statement not found');
	}

	const collected: CollectedDoc[] = [
		{ collection: Collections.statements, docId: statementSnap.id, data: statementSnap.data() as DocumentData },
	];
	evaluationsSnap.docs.forEach((d) => {
		const data = d.data();
		collected.push({
			collection: Collections.evaluations,
			docId: d.id,
			data,
			evaluation: { statementId: data.statementId, value: data.evaluation || 0 },
		});
	});

	return archiveAndDelete(
		db,
		documentId,
		collected,
		{ type: 'deleteStatement', targetStatementId: statementId, deletedBy, deletedByName },
		deletedAt
	);
}

/**
 * Restore a previously deleted batch: re-create every archived document at its
 * original ref, re-apply consensus reversals, clear any delete tombstones, and
 * mark the batch as restored.
 */
export async function restoreBatch(
	db: Firestore,
	documentId: string,
	batchId: string,
	restoredBy: string,
	restoredAt: number
): Promise<{ restoredCount: number }> {
	const batchRef = db.collection(DELETION_ARCHIVE_COLLECTION).doc(batchId);
	const batchSnap = await batchRef.get();

	if (!batchSnap.exists) {
		throw new Error('Deletion batch not found');
	}

	const batch = batchSnap.data() as DeletionBatch;
	if (batch.documentId !== documentId) {
		throw new Error('Batch does not belong to this document');
	}
	if (batch.status === 'restored') {
		throw new Error('Batch already restored');
	}

	const itemsSnap = await batchRef.collection('items').get();
	const ops: Array<(b: FirebaseFirestore.WriteBatch) => void> = [];

	// Aggregate consensus per target so a statement is never written twice per batch.
	const consensusByTarget = new Map<string, number>();

	itemsSnap.docs.forEach((d) => {
		const item = d.data() as ArchivedItem;

		// Re-create the original document.
		const liveRef = db.collection(item.collection).doc(item.docId);
		ops.push((b) => b.set(liveRef, item.data));

		// Re-apply the consensus contribution we reversed on delete.
		if (item.consensusReversal) {
			consensusByTarget.set(
				item.consensusReversal.statementId,
				(consensusByTarget.get(item.consensusReversal.statementId) || 0) + item.consensusReversal.delta
			);
		}

		// Clear any delete tombstone so delta-listeners don't re-delete on clients.
		if (item.collection === Collections.statements) {
			const tombstoneRef = db.collection(STATEMENT_DELETIONS_COLLECTION).doc(item.docId);
			ops.push((b) => b.delete(tombstoneRef));
		}
	});

	for (const [statementId, delta] of consensusByTarget) {
		const targetRef = db.collection(Collections.statements).doc(statementId);
		ops.push((b) => b.update(targetRef, { consensus: FieldValue.increment(delta), lastUpdate: restoredAt }));
	}

	await commitInBatches(db, ops);

	await batchRef.update({ status: 'restored', restoredBy, restoredAt });

	logger.info(`[DataManagement] Restored batch ${batchId} (${itemsSnap.size} items) on ${documentId} by ${restoredBy}`);

	return { restoredCount: itemsSnap.size };
}

/** List deletion batches for a document, newest first. */
export async function listBatches(
	db: Firestore,
	documentId: string,
	includeRestored: boolean
): Promise<DeletionBatch[]> {
	const snap = await db
		.collection(DELETION_ARCHIVE_COLLECTION)
		.where('documentId', '==', documentId)
		.get();

	const batches = snap.docs
		.map((d) => d.data() as DeletionBatch)
		.filter((b) => includeRestored || b.status === 'active')
		.sort((a, b) => b.deletedAt - a.deletedAt);

	return batches;
}
