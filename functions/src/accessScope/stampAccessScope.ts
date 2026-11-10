import { logger } from 'firebase-functions';
import { Collections, type Statement } from '@freedi/shared-types';
import { db } from '../db';
import { logError } from '../utils/errorHandling';
import { resolveStatementScope } from './accessScopeLevels';

/**
 * The safety net behind client stamping. A statement that arrives without a
 * scope (an old cached client, a parent that had no scope yet) is invisible to
 * every scoped list until this runs. A statement that already has one costs no
 * read: the create rule has checked it.
 */
export async function stampNewStatement(statement: Statement | undefined): Promise<void> {
	if (!statement?.statementId || statement.accessScope) return;
	try {
		const accessScope = await resolveStatementScope(db, statement);
		await db.collection(Collections.statements).doc(statement.statementId).update({ accessScope });
	} catch (error) {
		logError(error, {
			operation: 'accessScope.stampNewStatement',
			statementId: statement.statementId,
		});
	}
}

/** Cheap gate, no reads: only these changes can move a statement's scope. */
export function mayChangeScope(before: Statement, after: Statement): boolean {
	return (
		before.membership?.access !== after.membership?.access ||
		before.parentId !== after.parentId ||
		(Boolean(before.accessScope) && !after.accessScope)
	);
}

/**
 * Called on every statement update. When a level's scope really changes, stamps
 * that statement and queues its subtree. Writes only `accessScope`, which
 * `mayChangeScope` ignores, so it cannot trigger itself.
 */
export async function restampOnAccessChange(
	before: Statement | undefined,
	after: Statement | undefined,
): Promise<void> {
	if (!before || !after?.statementId || !mayChangeScope(before, after)) return;
	try {
		const accessScope = await resolveStatementScope(db, after);
		if (accessScope === after.accessScope) return;

		const now = Date.now();
		await db.collection(Collections.statements).doc(after.statementId).update({ accessScope });
		await db
			.collection(Collections.accessScopeJobs)
			.doc(after.statementId)
			.set({
				rootId: after.statementId,
				topParentId:
					after.parentId === 'top' || !after.topParentId ? after.statementId : after.topParentId,
				status: 'pending',
				cursor: null,
				generation: now,
				updatedAt: now,
			});
		logger.info('accessScope: queued a subtree', { statementId: after.statementId, accessScope });
	} catch (error) {
		logError(error, {
			operation: 'accessScope.restampOnAccessChange',
			statementId: after.statementId,
		});
	}
}
