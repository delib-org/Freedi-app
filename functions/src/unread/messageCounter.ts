import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore, DocumentReference } from 'firebase-admin/firestore';
import { Collections, StatementType } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';

/** gRPC status code Firestore uses when an update targets a missing doc. */
const NOT_FOUND_CODE = 5;
const TOP_PARENT = 'top';

interface CounterUpdate {
	ref: DocumentReference;
	data: Record<string, FieldValue>;
}

/**
 * Chat messages and answers count. Paragraphs (the body of a statement),
 * questions, groups and every other kind do not.
 */
export function isCountableMessage(statement: Pick<Statement, 'statementType'>): boolean {
	return (
		statement.statementType === StatementType.statement ||
		statement.statementType === StatementType.option
	);
}

/**
 * Every real statement doc above this one: parents plus parentId, without
 * duplicates, the "top" sentinel or the statement itself.
 */
export function counterAncestorIds(
	statement: Pick<Statement, 'statementId' | 'parentId' | 'parents'>,
): string[] {
	const ids = new Set<string>([...(statement.parents ?? []), statement.parentId]);
	ids.delete(TOP_PARENT);
	ids.delete(statement.statementId);

	return [...ids].filter((id) => typeof id === 'string' && id.length > 0);
}

function isNotFound(error: unknown): boolean {
	return (error as { code?: number | string })?.code === NOT_FOUND_CODE;
}

/** One batch. If a doc is missing the whole batch fails, so retry one by one. */
async function commitUpdates(
	db: Firestore,
	updates: CounterUpdate[],
	operation: string,
	statementId: string,
): Promise<void> {
	if (updates.length === 0) return;
	try {
		const batch = db.batch();
		updates.forEach(({ ref, data }) => batch.update(ref, data));
		await batch.commit();
	} catch {
		const results = await Promise.allSettled(updates.map(({ ref, data }) => ref.update(data)));
		results.forEach((result) => {
			if (result.status === 'rejected' && !isNotFound(result.reason)) {
				logError(result.reason, { operation, statementId });
			}
		});
	}
}

/**
 * A new chat message or answer: +1 on `descendantMessageCount` of every
 * ancestor, and +1 on the sender's own `seenMessageCount` where the sender
 * already follows that ancestor (so they never see their own message as
 * unread). Never creates a subscription doc. Never throws.
 */
export async function recordMessageCreated(db: Firestore, statement: Statement): Promise<void> {
	const operation = 'unread.recordMessageCreated';
	try {
		if (!isCountableMessage(statement)) return;
		const ancestorIds = counterAncestorIds(statement);
		if (ancestorIds.length === 0) return;

		const updates: CounterUpdate[] = ancestorIds.map((id) => ({
			ref: db.collection(Collections.statements).doc(id),
			data: { descendantMessageCount: FieldValue.increment(1) },
		}));

		if (statement.creatorId) {
			try {
				const subRefs = ancestorIds.map((id) =>
					db.collection(Collections.statementsSubscribe).doc(`${statement.creatorId}--${id}`),
				);
				const snapshots = await db.getAll(...subRefs);
				snapshots
					.filter((snapshot) => snapshot.exists)
					.forEach((snapshot) =>
						updates.push({
							ref: snapshot.ref,
							data: { seenMessageCount: FieldValue.increment(1) },
						}),
					);
			} catch (error) {
				logError(error, {
					operation: `${operation}.senderSubscriptions`,
					statementId: statement.statementId,
				});
			}
		}

		await commitUpdates(db, updates, operation, statement.statementId);
	} catch (error) {
		logError(error, { operation, statementId: statement?.statementId });
	}
}

/** A deleted chat message or answer: -1 on every ancestor still there. Never throws. */
export async function recordMessageDeleted(db: Firestore, statement: Statement): Promise<void> {
	const operation = 'unread.recordMessageDeleted';
	try {
		if (!isCountableMessage(statement)) return;
		const updates: CounterUpdate[] = counterAncestorIds(statement).map((id) => ({
			ref: db.collection(Collections.statements).doc(id),
			data: { descendantMessageCount: FieldValue.increment(-1) },
		}));

		await commitUpdates(db, updates, operation, statement.statementId);
	} catch (error) {
		logError(error, { operation, statementId: statement?.statementId });
	}
}
