import type { DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import { TABLE_ASSIGNMENT_TOPIC_COUNTS, tableAssignmentTopicCountOf } from '@freedi/shared-types';
import type {
	TableAssignmentSettings,
	TableAssignmentTopic,
	TableAssignmentTopicCount,
} from '@freedi/shared-types';
import { newId, topicsCollection } from './tablesAccess';
import { TablesError } from './tablesErrors';

/**
 * A one-topic event (IA tables-class-bridge 2.4): the host never writes a topic
 * list. The server keeps exactly one topic, titled after the event, and the
 * session is `ranked`, so tables are mixed by position when one was asked and
 * evenly otherwise.
 */

export function parseTopicCount(value: unknown): TableAssignmentTopicCount | undefined {
	if (value === undefined) return undefined;
	if (!(TABLE_ASSIGNMENT_TOPIC_COUNTS as readonly unknown[]).includes(value)) {
		throw new TablesError('invalid-argument', 'topicCount must be one or several');
	}

	return value as TableAssignmentTopicCount;
}

export function isOneTopic(settings: Pick<TableAssignmentSettings, 'topicCount'>): boolean {
	return tableAssignmentTopicCountOf(settings) === 'one';
}

/** The single topic of a one-topic session, at order 0. */
export function oneTopicDoc(
	sessionId: string,
	title: string,
	topicId: string = newId(),
): TableAssignmentTopic {
	return { topicId, sessionId, title, order: 0 };
}

/**
 * Leaves exactly one topic titled `title`: the first existing one keeps its id
 * (choices never point at it, but a stable id costs nothing), the rest go.
 */
export function writeOneTopic(
	tx: Transaction,
	firestore: Firestore,
	sessionId: string,
	title: string,
	existing: readonly DocumentSnapshot[],
): void {
	const [keep, ...rest] = [...existing].sort(
		(a, b) =>
			(a.data() as TableAssignmentTopic).order - (b.data() as TableAssignmentTopic).order ||
			a.id.localeCompare(b.id),
	);
	rest.forEach((d) => tx.delete(d.ref));
	const topic = oneTopicDoc(sessionId, title, keep?.id);
	tx.set(topicsCollection(firestore).doc(topic.topicId), topic);
}
