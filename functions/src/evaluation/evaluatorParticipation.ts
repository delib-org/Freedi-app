/**
 * Per-question evaluator counting.
 *
 * `Statement.evaluation.asParentTotalEvaluators` (and the legacy
 * `Statement.totalEvaluators`) on a question is the number of distinct users
 * who evaluated any of its options. It used to be recomputed by scanning every
 * evaluation of the question on every evaluation event (O(N) reads per action,
 * O(N^2) over a vote). It is now maintained incrementally:
 *
 * - `evaluationParticipants/{parentId}--{userId}` marks "this user is counted".
 * - On an evaluation event a transaction creates the marker and increments the
 *   question's counters by one. If the marker already exists nothing is
 *   written, so duplicate / re-delivered / out-of-order events are idempotent
 *   and concurrent first evaluations by different users each add exactly one.
 * - A neutral evaluation (value 0) is participation and counts.
 * - Once counted a participant stays counted: deleting evaluations never
 *   decrements (agreed behaviour change vs. the old scan).
 * - A real count change also stamps the question's `lastUpdate` (same write),
 *   because delta listeners (`lastUpdate > watermark`) are the only live
 *   channel for bulk-loaded scopes. No change, no write, no stamp.
 *
 * `reconcileParentEvaluators` is the explicit, on-demand full recount. Full
 * scans never run in ordinary evaluation processing.
 */

import { logger } from 'firebase-functions/v1';
import type { Firestore, Transaction, WriteBatch } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { Collections, Evaluation, Statement } from '@freedi/shared-types';
import type { EvaluationParticipant } from '@freedi/shared-types';
import { db } from '../index';
import { logError } from '../utils/errorHandling';
import {
	PARTICIPANT_PAGE_SIZE,
	buildCounterPatch,
	participantRef,
	syncCountFromMarkers,
} from './evaluatorParticipationCore';

export interface ReconcileResult {
	parentId: string;
	previousCount: number;
	count: number;
	created: number;
	removed: number;
}

type BatchOperation = (batch: WriteBatch) => void;

/**
 * Counts `userId` as a participant of question `parentId` if not counted yet.
 *
 * Cost when already counted: 1 read, 0 writes. First time: 2 reads
 * (marker + question), 2 writes (marker + question counters).
 *
 * @returns true when this call added the user to the count.
 */
export async function recordEvaluatorParticipation(
	parentId: string | undefined,
	userId: string | undefined,
	firestore: Firestore = db,
): Promise<boolean> {
	if (!parentId || !userId) return false;

	try {
		const markerRef = participantRef(firestore, parentId, userId);
		const parentRef = firestore.collection(Collections.statements).doc(parentId);

		return await firestore.runTransaction(async (transaction: Transaction) => {
			const marker = await transaction.get(markerRef);
			if (marker.exists) return false;

			const parentDoc = await transaction.get(parentRef);
			if (!parentDoc.exists) {
				logger.warn(`recordEvaluatorParticipation: question ${parentId} not found`);

				return false;
			}

			const participant: EvaluationParticipant = { parentId, userId, createdAt: Date.now() };
			transaction.create(markerRef, participant);
			transaction.update(
				parentRef,
				buildCounterPatch(parentDoc.data() as Statement, FieldValue.increment(1)),
			);

			return true;
		});
	} catch (error) {
		// Not fatal: the user's next evaluation event retries, and reconcile fixes any drift.
		logError(error, {
			operation: 'evaluation.recordEvaluatorParticipation',
			metadata: { parentId },
		});

		return false;
	}
}

async function collectEvaluatorIds(firestore: Firestore, parentId: string): Promise<Set<string>> {
	const evaluatorIds = new Set<string>();
	let cursor: string | undefined;

	for (;;) {
		let query = firestore
			.collection(Collections.evaluations)
			.where('parentId', '==', parentId)
			.orderBy('__name__')
			.limit(PARTICIPANT_PAGE_SIZE);
		if (cursor) query = query.startAfter(cursor);

		const page = await query.get();
		page.forEach((doc) => {
			const uid = (doc.data() as Evaluation).evaluator?.uid;
			if (uid) evaluatorIds.add(uid);
		});
		if (page.size < PARTICIPANT_PAGE_SIZE) return evaluatorIds;
		cursor = page.docs[page.size - 1].id;
	}
}

async function collectMarkerUserIds(firestore: Firestore, parentId: string): Promise<Set<string>> {
	const markerUserIds = new Set<string>();
	const snapshot = await firestore
		.collection(Collections.evaluationParticipants)
		.where('parentId', '==', parentId)
		.get();
	snapshot.forEach((doc) => markerUserIds.add((doc.data() as EvaluationParticipant).userId));

	return markerUserIds;
}

async function commitInChunks(firestore: Firestore, operations: BatchOperation[]): Promise<void> {
	for (let start = 0; start < operations.length; start += PARTICIPANT_PAGE_SIZE) {
		const batch = firestore.batch();
		operations.slice(start, start + PARTICIPANT_PAGE_SIZE).forEach((apply) => apply(batch));
		await batch.commit();
	}
}

/**
 * Recomputes one question's evaluator count from scratch (explicit, on demand).
 *
 * Rebuilds the marker set from the evaluations that exist now (adds missing
 * markers, removes markers whose user has no evaluation left) and writes the
 * exact count to the question, only if it differs. This is the one place that
 * can lower the count: it reflects the evaluations as they are today.
 */
export async function reconcileParentEvaluators(
	parentId: string,
	firestore: Firestore = db,
): Promise<ReconcileResult> {
	const parentRef = firestore.collection(Collections.statements).doc(parentId);
	const parentDoc = await parentRef.get();
	if (!parentDoc.exists) throw new Error(`Question ${parentId} not found`);
	const parent = parentDoc.data() as Statement;

	const evaluatorIds = await collectEvaluatorIds(firestore, parentId);
	const markerUserIds = await collectMarkerUserIds(firestore, parentId);

	const now = Date.now();
	const operations: BatchOperation[] = [];
	let created = 0;
	let removed = 0;

	evaluatorIds.forEach((uid) => {
		if (markerUserIds.has(uid)) return;
		created++;
		const participant: EvaluationParticipant = { parentId, userId: uid, createdAt: now };
		operations.push((batch) => batch.set(participantRef(firestore, parentId, uid), participant));
	});
	markerUserIds.forEach((uid) => {
		if (evaluatorIds.has(uid)) return;
		removed++;
		operations.push((batch) => batch.delete(participantRef(firestore, parentId, uid)));
	});
	await commitInChunks(firestore, operations);

	// Markers now mirror the evaluations; set the count from them atomically.
	const { count } = await syncCountFromMarkers(firestore, parentId);
	const previousCount = parent.evaluation?.asParentTotalEvaluators ?? parent.totalEvaluators ?? 0;

	logger.info(
		`reconcileParentEvaluators ${parentId}: ${previousCount} -> ${count} (+${created} / -${removed} markers)`,
	);

	return { parentId, previousCount, count, created, removed };
}
