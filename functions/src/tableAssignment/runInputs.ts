import type { Firestore, Query, QuerySnapshot } from 'firebase-admin/firestore';
import type {
	TableAssignment,
	TableAssignmentParticipant,
	TableAssignmentTopic,
} from '@freedi/shared-types';
import { computeAnswersHash, computeInputHash } from './inputHash';
import { participantsQuery, sortTopics, topicsQuery } from './tablesAccess';

/** Reads a query: `query.get()` outside a transaction, `tx.get(query)` inside one. */
export type QueryReader = (query: Query) => Promise<QuerySnapshot>;

export interface RunInputs {
	topics: TableAssignmentTopic[];
	participants: TableAssignmentParticipant[];
	inputHash: string;
	answersHash: string;
}

/** The topics and registrants a ranked run is computed from, plus their hash. */
export async function loadRunInputs(
	firestore: Firestore,
	read: QueryReader,
	session: TableAssignment,
): Promise<RunInputs> {
	const sessionId = session.tableAssignmentId;
	const [topicsSnap, participantsSnap] = await Promise.all([
		read(topicsQuery(firestore, sessionId)),
		read(participantsQuery(firestore, sessionId)),
	]);
	const topics = sortTopics(topicsSnap.docs.map((d) => d.data() as TableAssignmentTopic));
	const participants = participantsSnap.docs.map((d) => d.data() as TableAssignmentParticipant);

	return {
		topics,
		participants,
		inputHash: computeInputHash(session.settings, topics, participants),
		answersHash: computeAnswersHash(participants),
	};
}
