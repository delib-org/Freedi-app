/**
 * Firestore onDelete trigger handler for statements.
 *
 * A question's `results` (its cached top answers) are recomputed only by the
 * evaluation triggers. Deleting an option cascades into deleting its
 * evaluations, but by then the option doc is gone, so `deleteEvaluation` fails
 * to load it and never recomputes — the deleted option stayed on the question
 * card as a "top answer". This handler closes that gap.
 */

import { logger } from 'firebase-functions/v1';
import { DocumentSnapshot } from 'firebase-admin/firestore';
import type { FirestoreEvent } from 'firebase-functions/v2/firestore';
import { Collections, Statement, StatementType } from '@freedi/shared-types';
import { db } from '../index';
import { updateParentStatementWithChosenOptions } from './updateChosenOptions';

export async function recomputeResultsOnOptionDeleted(
	event: FirestoreEvent<DocumentSnapshot | undefined>,
): Promise<void> {
	const deleted = event.data?.data() as Statement | undefined;
	if (!deleted || deleted.statementType !== StatementType.option) return;

	const { parentId, statementId } = deleted;
	if (!parentId) return;

	const parentDoc = await db.collection(Collections.statements).doc(parentId).get();
	if (!parentDoc.exists) return; // whole branch deleted

	// Only a deleted top answer makes the cached results stale.
	const parent = parentDoc.data() as Statement;
	const wasTopAnswer =
		deleted.isChosen === true ||
		(parent.results ?? []).some((result) => result.statementId === statementId);
	if (!wasTopAnswer) return;

	logger.info(`Top answer ${statementId} deleted; recomputing results of ${parentId}`);
	await updateParentStatementWithChosenOptions(parentId);
}
