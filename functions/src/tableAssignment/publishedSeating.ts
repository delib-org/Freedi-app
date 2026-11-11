import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { PinnedTable } from '@freedi/table-assignment';
import type { TableAssignment, TableAssignmentRun } from '@freedi/shared-types';
import { runRef } from './tablesAccess';

/**
 * Whether a person may hold a seat in the published run. When the session has
 * a published run that cannot be read, the answer is "maybe": callers refuse
 * rather than guess, so a seated person is never treated as a latecomer.
 */
export async function maySitInPublishedRun(
	tx: Transaction,
	firestore: Firestore,
	session: TableAssignment,
	uid: string,
): Promise<boolean> {
	if (!session.publishedRunId) return false;
	const runSnap = await tx.get(runRef(firestore, session.publishedRunId));
	const run = runSnap.data() as TableAssignmentRun | undefined;

	return !run || run.tables.some((table) => table.memberUids.includes(uid));
}

/**
 * A latecomer: the tables are published, the published run is readable, and it
 * does not seat this person. Only they may still change or cancel their registration.
 */
export async function isUnseatedLatecomer(
	tx: Transaction,
	firestore: Firestore,
	session: TableAssignment,
	uid: string,
): Promise<boolean> {
	if (session.status !== 'published' || !session.publishedRunId) return false;

	return !(await maySitInPublishedRun(tx, firestore, session, uid));
}

/**
 * The published tables as the engine's `pinnedTables`: a recompute keeps
 * everyone seated there where they are and seats only the people the run does
 * not know. In the run's own order, so table numbers do not move.
 */
export function pinnedTablesOf(published: Pick<TableAssignmentRun, 'tables'>): PinnedTable[] {
	return [...published.tables]
		.sort((a, b) => a.index - b.index)
		.map((table) => ({ topicId: table.topicId, memberIds: table.memberUids }));
}
