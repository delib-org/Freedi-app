/**
 * Bounded, resumable backfill for the per-question evaluator count.
 *
 * Two phases, each cursor-paged by document id and safe to re-run:
 *
 *  1. `backfillParticipantsPage` - reads one page of `evaluations`, creates the
 *     missing `evaluationParticipants/{parentId}--{userId}` markers (existing
 *     ones are left alone, so it is idempotent and never overwrites createdAt).
 *  2. `syncParentCountsPage` - reads one page of markers, and for each question
 *     seen sets `evaluation.asParentTotalEvaluators` / `totalEvaluators` to the
 *     number of markers (an aggregation count, 1 read per 1000 index entries).
 *     A question already holding the right number is not written, so it does
 *     not trigger the statement-update fan-out for nothing.
 *
 * Each call does a bounded amount of work and returns the cursor to continue
 * from (null when finished). Driven by functions/scripts/backfillEvaluationParticipants.ts.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { Collections, Evaluation, Statement } from '@freedi/shared-types';
import type { EvaluationParticipant } from '@freedi/shared-types';
import {
	PARTICIPANT_PAGE_SIZE,
	buildCounterPatch,
	participantRef,
} from '../evaluation/evaluatorParticipationCore';

/** gRPC code for ALREADY_EXISTS - the marker is already there, which is the goal. */
const ALREADY_EXISTS_CODE = 6;

export interface BackfillPageResult {
	/** Document id to pass as the next cursor; null when the collection is exhausted. */
	nextCursor: string | null;
	scanned: number;
	created: number;
}

export interface SyncPageResult {
	nextCursor: string | null;
	scanned: number;
	parentsChecked: number;
	parentsUpdated: number;
}

export async function backfillParticipantsPage(
	firestore: Firestore,
	cursor: string | null,
	execute: boolean,
	pageSize: number = PARTICIPANT_PAGE_SIZE,
): Promise<BackfillPageResult> {
	let query = firestore.collection(Collections.evaluations).orderBy('__name__').limit(pageSize);
	if (cursor) query = query.startAfter(cursor);
	const page = await query.get();

	const markers = new Map<string, EvaluationParticipant>();
	const now = Date.now();
	page.forEach((doc) => {
		const evaluation = doc.data() as Evaluation;
		const userId = evaluation.evaluator?.uid;
		if (!evaluation.parentId || !userId) return;
		markers.set(`${evaluation.parentId}\u0000${userId}`, {
			parentId: evaluation.parentId,
			userId,
			createdAt: now,
		});
	});

	let created = 0;
	if (execute && markers.size > 0) {
		const writer = firestore.bulkWriter();
		let failure: unknown;
		markers.forEach((marker) => {
			writer.create(participantRef(firestore, marker.parentId, marker.userId), marker).then(
				() => {
					created++;
				},
				(error: { code?: number }) => {
					if (error?.code !== ALREADY_EXISTS_CODE) failure = failure ?? error;
				},
			);
		});
		await writer.close();
		if (failure) throw failure;
	}

	return {
		nextCursor: page.size < pageSize ? null : page.docs[page.size - 1].id,
		scanned: page.size,
		created: execute ? created : markers.size,
	};
}

export async function syncParentCountsPage(
	firestore: Firestore,
	cursor: string | null,
	execute: boolean,
	pageSize: number = PARTICIPANT_PAGE_SIZE,
): Promise<SyncPageResult> {
	let query = firestore
		.collection(Collections.evaluationParticipants)
		.orderBy('__name__')
		.limit(pageSize);
	if (cursor) query = query.startAfter(cursor);
	const page = await query.get();

	const parentIds = new Set<string>();
	page.forEach((doc) => parentIds.add((doc.data() as EvaluationParticipant).parentId));

	let parentsUpdated = 0;
	for (const parentId of parentIds) {
		const parentRef = firestore.collection(Collections.statements).doc(parentId);
		const parentDoc = await parentRef.get();
		if (!parentDoc.exists) continue;
		const parent = parentDoc.data() as Statement;

		const countSnapshot = await firestore
			.collection(Collections.evaluationParticipants)
			.where('parentId', '==', parentId)
			.count()
			.get();
		const count = countSnapshot.data().count;

		const inSync =
			parent.evaluation?.asParentTotalEvaluators === count && parent.totalEvaluators === count;
		if (inSync) continue;
		parentsUpdated++;
		if (execute) await parentRef.update(buildCounterPatch(parent, count));
	}

	return {
		nextCursor: page.size < pageSize ? null : page.docs[page.size - 1].id,
		scanned: page.size,
		parentsChecked: parentIds.size,
		parentsUpdated,
	};
}
