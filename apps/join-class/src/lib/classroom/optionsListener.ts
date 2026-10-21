import { Collections, Statement, StatementType } from '@freedi/shared-types';
import { db, collection, query, where } from '../firebase';
import type { Unsubscribe } from '../firebase';
import { resilientOnSnapshot } from '../resilientListeners';

/**
 * The options (answers / proposals) under one question, for the teacher console.
 * A standalone listener on purpose: Join's `subscribeOptions` writes the one
 * global "current question" list, and the console needs the challenge question
 * AND every guiding question at the same time.
 */
export function listenOptions(
	questionId: string,
	onData: (options: Statement[]) => void,
	onError?: (error: Error) => void,
): Unsubscribe {
	return resilientOnSnapshot(
		`consoleOptions:${questionId}`,
		query(
			collection(db, Collections.statements),
			where('parentId', '==', questionId),
			where('statementType', '==', StatementType.option),
		),
		(snap) => onData(snap.docs.map((d) => d.data() as Statement)),
		(err) => onError?.(err),
	);
}
