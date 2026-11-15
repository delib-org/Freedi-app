import { randomInt } from 'crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import {
	TableAssignmentError,
	emptiestTableWithSeat,
	splitByChosenTopic,
} from '@freedi/table-assignment';
import type { Participant } from '@freedi/table-assignment';
import type {
	TableAssignment,
	TableAssignmentParticipant,
	TableAssignmentRun,
	TableAssignmentTopic,
} from '@freedi/shared-types';
import { ENGINE_SEED_RANGE } from './constants';
import { splitRunFields } from './runPrivacy';
import {
	newId,
	participantsQuery,
	runRef,
	sessionRef,
	sortTopics,
	topicsQuery,
} from './tablesAccess';
import { TablesError } from './tablesErrors';

/**
 * Closing a splitByTopic session ("sit where you like", IA tables-class-bridge
 * 2.3): one press closes registration and publishes the tables. The split is
 * arithmetic (2.1), so there is no preview; the engine only mixes positions
 * inside each topic, with a seed drawn here and never stored.
 */

export interface DirectCloseResult {
	publishedRunId: string;
	topicsWithOnePerson: string[];
}

/** The engine's view of a registration: the chosen topic and the position, nothing else. */
function engineParticipant(p: TableAssignmentParticipant): Participant {
	return {
		id: p.uid,
		side: p.position === undefined ? undefined : [p.position],
		preferences: p.preferences.slice(0, 1),
	};
}

/**
 * Reads the topics and every registration inside `tx`, so a choice saved at
 * the same moment either makes it in or is refused as closed. Then writes the
 * published run and moves the session to `published`.
 */
export async function closeAndPublishSplit(
	tx: Transaction,
	firestore: Firestore,
	session: TableAssignment,
	now: number,
	drawSeed: () => number = () => randomInt(0, ENGINE_SEED_RANGE),
): Promise<DirectCloseResult> {
	const sessionId = session.tableAssignmentId;
	const [topicsSnap, participantsSnap] = await Promise.all([
		tx.get(topicsQuery(firestore, sessionId)),
		tx.get(participantsQuery(firestore, sessionId)),
	]);
	const topics = sortTopics(topicsSnap.docs.map((d) => d.data() as TableAssignmentTopic));
	// By uid, so the same seed gives the same room whatever order the query returned.
	const participants = participantsSnap.docs
		.map((d) => d.data() as TableAssignmentParticipant)
		.sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0))
		.map(engineParticipant);

	let split: ReturnType<typeof splitByChosenTopic>;
	try {
		split = splitByChosenTopic(
			participants,
			topics.map((t) => t.topicId),
			{
				tableSize: session.settings.tableSize,
				balanceTolerance: session.settings.balanceTolerance,
				seed: drawSeed(),
			},
		);
	} catch (error) {
		if (error instanceof TableAssignmentError) {
			throw new TablesError('failed-precondition', error.message);
		}
		throw error;
	}

	const runId = newId();
	const run: TableAssignmentRun = {
		runId,
		sessionId,
		status: 'published',
		...splitRunFields(
			split.tables.map((t) => ({ index: t.index, topicId: t.topicId, memberUids: t.memberIds })),
			session.settings.balanceTolerance,
		),
		inputHash: '',
		createdAt: now,
		publishedAt: now,
	};

	// ---- writes (all reads are done) ----
	tx.set(runRef(firestore, runId), run);
	tx.update(sessionRef(firestore, sessionId), {
		status: 'published',
		publishedRunId: runId,
		lastUpdate: now,
	});

	return { publishedRunId: runId, topicsWithOnePerson: split.topicsWithOnePerson };
}

/**
 * A latecomer of a published splitByTopic session who just chose `topicId`:
 * the emptiest table of that topic with a free seat, read inside `tx`. Returns
 * the write to make once every read is done, or undefined when the topic has no
 * free seat (they wait, and the host seats them).
 */
export async function planSplitLatecomerSeat(
	tx: Transaction,
	firestore: Firestore,
	session: TableAssignment,
	uid: string,
	topicId: string | undefined,
): Promise<{ tableIndex: number; write: () => void } | undefined> {
	if (!topicId || !session.publishedRunId) return undefined;
	const ref = runRef(firestore, session.publishedRunId);
	const run = (await tx.get(ref)).data() as TableAssignmentRun | undefined;
	if (!run) return undefined;
	const tableIndex = emptiestTableWithSeat(
		run.tables.map((t) => ({
			index: t.index,
			topicId: t.topicId,
			memberCount: t.memberUids.length,
		})),
		topicId,
		session.settings.tableSize,
	);
	if (tableIndex === undefined) return undefined;
	const tables = run.tables.map((t) =>
		t.index === tableIndex ? { ...t, memberUids: [...t.memberUids, uid] } : t,
	);

	return { tableIndex, write: () => tx.update(ref, { tables }) };
}
