/**
 * Per-question answer notification choices (Trello 6sHeWQgD).
 *
 * A person who published an answer chooses, once per question, whether to hear
 * about (a) replies in the chat on their answers and (b) new answers to the
 * question. The choices live on their subscription to the QUESTION. `false`
 * vetoes that event on every channel; true or absent means no veto, so people
 * who were never asked keep today's behaviour. Master mute, app mute, snooze
 * and frequency are applied elsewhere and still win.
 */
import {
	Collections,
	getStatementSubscriptionId,
	Statement,
	StatementSubscription,
	StatementType,
} from '@freedi/shared-types';
import { db } from '../index';

/** An option added under a question. */
export function isNewAnswer(statement: Statement, parent: Statement): boolean {
	return (
		statement.statementType === StatementType.option &&
		parent.statementType === StatementType.question
	);
}

/** A chat message under an answer (option). Discussion on the question itself is not one. */
export function isReplyToAnswer(statement: Statement, parent: Statement): boolean {
	return (
		statement.statementType === StatementType.statement &&
		parent.statementType === StatementType.option
	);
}

/** The subscriber turned "new answers" off on this question. */
export function vetoesNewAnswers(
	sub: Pick<StatementSubscription, 'notifyOnNewAnswers'> | undefined,
): boolean {
	return sub?.notifyOnNewAnswers === false;
}

/**
 * Whether the answer's author turned "replies" off on the question the answer
 * belongs to. One read of the author's question subscription.
 */
export async function authorVetoesReplies(answer: Statement): Promise<boolean> {
	const authorUid = answer.creator?.uid;
	if (!authorUid || !answer.parentId) return false;

	const subId = getStatementSubscriptionId(answer.parentId, answer.creator);
	if (!subId) return false;

	const snap = await db.collection(Collections.statementsSubscribe).doc(subId).get();
	if (!snap.exists) return false;

	return (snap.data() as StatementSubscription).notifyOnReplies === false;
}
