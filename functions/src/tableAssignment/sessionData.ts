import { FieldValue } from 'firebase-admin/firestore';
import type { DocumentSnapshot, Firestore, Query, WriteBatch } from 'firebase-admin/firestore';
import type { TableAssignment } from '@freedi/shared-types';
import { WRITE_BATCH_SIZE } from './constants';
import {
	counterRef,
	participantsQuery,
	previewBudgetsQuery,
	rosterQuery,
	runInputsQuery,
	runsQuery,
	seatsQuery,
	sessionRef,
	topicsQuery,
} from './tablesAccess';

/** Bulk erasing and deleting of what a session left behind. Both are safe to run again. */

async function inBatches(
	firestore: Firestore,
	docs: readonly DocumentSnapshot[],
	write: (batch: WriteBatch, doc: DocumentSnapshot) => void,
): Promise<void> {
	for (let start = 0; start < docs.length; start += WRITE_BATCH_SIZE) {
		const batch = firestore.batch();

		docs.slice(start, start + WRITE_BATCH_SIZE).forEach((doc) => write(batch, doc));
		await batch.commit();
	}
}

async function docsOf(queries: readonly Query[]): Promise<DocumentSnapshot[]> {
	const snapshots = await Promise.all(queries.map((query) => query.get()));

	return snapshots.flatMap((snapshot) => snapshot.docs);
}

/**
 * Removes every answer of an ended session and all that was derived from them.
 * Kept: names, seats and the published seating, which are the session's result.
 * `preferences` is emptied rather than removed because the record's type
 * requires it. `answersErasedAt` goes last, so it is only there when all the
 * rest is done.
 */
export async function eraseSessionAnswers(
	firestore: Firestore,
	session: Pick<TableAssignment, 'tableAssignmentId' | 'publishedRunId'>,
	now: number,
): Promise<void> {
	const sessionId = session.tableAssignmentId;
	const [participants, runs, derived] = await Promise.all([
		docsOf([participantsQuery(firestore, sessionId)]),
		docsOf([runsQuery(firestore, sessionId)]),
		docsOf([runInputsQuery(firestore, sessionId), previewBudgetsQuery(firestore, sessionId)]),
	]);
	const unpublishedRuns = runs.filter((run) => run.id !== session.publishedRunId);

	await inBatches(firestore, participants, (batch, doc) =>
		batch.update(doc.ref, { position: FieldValue.delete(), preferences: [] }),
	);
	await inBatches(firestore, [...unpublishedRuns, ...derived], (batch, doc) =>
		batch.delete(doc.ref),
	);
	await sessionRef(firestore, sessionId).update({ answersErasedAt: now });
}

/**
 * Deletes everything stored under a session. The session document goes last:
 * until then a failed delete can be retried, and the host check still has
 * something to check against.
 */
export async function deleteSessionData(firestore: Firestore, sessionId: string): Promise<void> {
	const docs = await docsOf([
		topicsQuery(firestore, sessionId),
		participantsQuery(firestore, sessionId),
		rosterQuery(firestore, sessionId),
		seatsQuery(firestore, sessionId),
		runsQuery(firestore, sessionId),
		runInputsQuery(firestore, sessionId),
		previewBudgetsQuery(firestore, sessionId),
	]);

	await inBatches(firestore, docs, (batch, doc) => batch.delete(doc.ref));
	const last = firestore.batch();

	last.delete(counterRef(firestore, sessionId));
	last.delete(sessionRef(firestore, sessionId));
	await last.commit();
}
