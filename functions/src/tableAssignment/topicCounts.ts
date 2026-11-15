import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { isTableAssignmentSplitByTopic } from '@freedi/shared-types';
import type { TableAssignment } from '@freedi/shared-types';
import { topicsCollection } from './tablesAccess';

/**
 * "{{count}} chose this topic" (IA tables-class-bridge 2.3): a count on the
 * topic doc, kept only in splitByTopic sessions. A blind increment, so a crowd
 * choosing at once does not contend on the topic. No identity is stored.
 */
export function countTopicChoice(
	tx: Transaction,
	firestore: Firestore,
	session: Pick<TableAssignment, 'mode' | 'splitByTopic'>,
	topicId: string | undefined,
	delta: number,
): void {
	if (!topicId || delta === 0 || !isTableAssignmentSplitByTopic(session)) return;
	tx.set(
		topicsCollection(firestore).doc(topicId),
		{ chosenCount: FieldValue.increment(delta) },
		{ merge: true },
	);
}

/** Moves one person's count from their old topic to their new one. */
export function moveTopicChoice(
	tx: Transaction,
	firestore: Firestore,
	session: Pick<TableAssignment, 'mode' | 'splitByTopic'>,
	from: string | undefined,
	to: string | undefined,
): void {
	if (from === to) return;
	countTopicChoice(tx, firestore, session, from, -1);
	countTopicChoice(tx, firestore, session, to, 1);
}
