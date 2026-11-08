/**
 * Keeps a question's cached top answers (`results`) in step with its options.
 *
 * `results` holds copies of the top options and is recomputed only by the
 * evaluation triggers. Three option changes used to leave it stale:
 * - **delete** — the evaluation-delete cascade fails to load the already-gone
 *   option, so it never recomputes and the deleted option stays a top answer;
 * - **hide** — hidden options are excluded from results, but hiding rates nothing;
 * - **text edit** — the cached copy keeps the old wording.
 *
 * Called from the statement triggers in `fn_statement_updates.ts`.
 */

import { logger } from 'firebase-functions/v1';
import {
	Collections,
	Statement,
	StatementType,
	statementToSimpleStatement,
} from '@freedi/shared-types';
import { db } from '../index';
import { updateParentStatementWithChosenOptions } from './updateChosenOptions';

function isCachedIn(parent: Statement, statementId: string): boolean {
	return (parent.results ?? []).some((result) => result.statementId === statementId);
}

async function getParent(parentId: string): Promise<Statement | undefined> {
	const parentDoc = await db.collection(Collections.statements).doc(parentId).get();

	return parentDoc.exists ? (parentDoc.data() as Statement) : undefined;
}

/** A deleted top answer must leave its question's results. */
export async function syncTopAnswersOnOptionDeleted(deleted: Statement): Promise<void> {
	if (deleted.statementType !== StatementType.option || !deleted.parentId) return;

	const parent = await getParent(deleted.parentId);
	if (!parent) return; // whole branch deleted

	if (deleted.isChosen !== true && !isCachedIn(parent, deleted.statementId)) return;

	logger.info(`Top answer ${deleted.statementId} deleted; recomputing ${deleted.parentId}`);
	await updateParentStatementWithChosenOptions(deleted.parentId);
}

/**
 * An option that was hidden/unhidden may enter or leave the results; an edited
 * top answer's cached copy must carry the new text.
 */
export async function syncTopAnswersOnOptionUpdated(
	before: Statement,
	after: Statement,
): Promise<void> {
	if (after.statementType !== StatementType.option || !after.parentId) return;

	const hideChanged = Boolean(before.hide) !== Boolean(after.hide);
	const textChanged = before.statement !== after.statement;
	if (!hideChanged && !textChanged) return;

	const parent = await getParent(after.parentId);
	if (!parent) return;

	if (hideChanged) {
		// Unhiding can promote the option, so recompute regardless of the cache.
		logger.info(`Option ${after.statementId} hide changed; recomputing ${after.parentId}`);
		await updateParentStatementWithChosenOptions(after.parentId);

		return;
	}

	if (!isCachedIn(parent, after.statementId)) return;

	const parentRef = db.collection(Collections.statements).doc(after.parentId);
	await db.runTransaction(async (transaction) => {
		const fresh = await transaction.get(parentRef);
		const results = (fresh.data() as Statement | undefined)?.results ?? [];
		const index = results.findIndex((result) => result.statementId === after.statementId);
		if (index === -1) return;

		const updated = [...results];
		updated[index] = statementToSimpleStatement(after);
		transaction.update(parentRef, { results: updated });
	});
	logger.info(`Refreshed cached text of top answer ${after.statementId} in ${after.parentId}`);
}
