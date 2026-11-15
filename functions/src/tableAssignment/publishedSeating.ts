import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { PinnedTable } from '@freedi/table-assignment';
import { isTableAssignmentSplitByTopic } from '@freedi/shared-types';
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

/**
 * Sessions whose seating the host computes and publishes: ranked ones, and a
 * splitByTopic one once its tables are out, to seat the latecomers whose topic
 * had no free seat (IA tables-class-bridge 2.3).
 */
export function seatsByEngine(
	session: Pick<TableAssignment, 'mode' | 'splitByTopic' | 'status'>,
): boolean {
	return (
		session.mode === 'ranked' ||
		(isTableAssignmentSplitByTopic(session) && session.status === 'published')
	);
}

/** The published run as stored, or undefined when the session has none or it cannot be read. */
export async function readPublishedRun(
	tx: Transaction,
	firestore: Firestore,
	session: Pick<TableAssignment, 'publishedRunId'>,
): Promise<TableAssignmentRun | undefined> {
	if (!session.publishedRunId) return undefined;
	const runSnap = await tx.get(runRef(firestore, session.publishedRunId));

	return runSnap.data() as TableAssignmentRun | undefined;
}

/** Whether the run seats this person at any table. */
export function runSeats(run: Pick<TableAssignmentRun, 'tables'>, uid: string): boolean {
	return run.tables.some((table) => table.memberUids.includes(uid));
}

/**
 * Takes a person off the published run's seat lists, so the participant view
 * and the host view stop listing them. The table keeps its index and topic,
 * so nobody else moves. The run holds no counts of its own to correct.
 */
export function unseatFromRun(
	tx: Transaction,
	firestore: Firestore,
	run: Pick<TableAssignmentRun, 'runId' | 'tables'>,
	uid: string,
): void {
	const tables = run.tables.map((table) => ({
		...table,
		memberUids: table.memberUids.filter((memberUid) => memberUid !== uid),
	}));
	tx.update(runRef(firestore, run.runId), { tables });
}
