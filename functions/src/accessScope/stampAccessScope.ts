import { logger } from 'firebase-functions';
import {
	Collections,
	type Statement,
	isOpenAccessValue,
	isAnswerTypeLevel,
} from '@freedi/shared-types';
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

export interface RestampPlan {
	queue: boolean;
	/** The private setting the level dropped: copies of it on answers must go. */
	clearCopiesOf?: string;
}

/**
 * Whether a level's change needs its tree re-stamped. A whole-tree job is costly,
 * so only when the level's scope moved, or when it dropped a private setting its
 * answers may carry copies of. Not when a copy on an answer is cleared (the job
 * does that itself, once per answer), nor between two open values.
 */
export function restampPlan(before: Statement, after: Statement, accessScope: string): RestampPlan {
	const previousAccess = before.membership?.access;
	const nextAccess = after.membership?.access;
	const dropsPrivateSetting =
		Boolean(previousAccess) &&
		previousAccess !== nextAccess &&
		!isOpenAccessValue(previousAccess as string);
	const isClearedCopy = !nextAccess && isAnswerTypeLevel(after);
	const clearCopiesOf = dropsPrivateSetting && !isClearedCopy ? previousAccess : undefined;
	const scopeMoved = accessScope !== after.accessScope;

	return { queue: scopeMoved || Boolean(clearCopiesOf), clearCopiesOf };
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
		const plan = restampPlan(before, after, accessScope);
		if (!plan.queue) return;

		const now = Date.now();
		if (accessScope !== after.accessScope) {
			await db.collection(Collections.statements).doc(after.statementId).update({ accessScope });
		}
		await db
			.collection(Collections.accessScopeJobs)
			.doc(after.statementId)
			.set({
				rootId: after.statementId,
				topParentId:
					after.parentId === 'top' || !after.topParentId ? after.statementId : after.topParentId,
				// Answers may carry a copy of the old setting; a private one must go.
				...(plan.clearCopiesOf ? { clearCopiesOf: plan.clearCopiesOf } : {}),
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
