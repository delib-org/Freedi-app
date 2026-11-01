/**
 * Chosen options logic for parent statements.
 *
 * Handles determining which child options are "chosen" based on
 * evaluation results and the parent's resultsSettings configuration.
 * The selection rules live in chosenOptionsSelection.ts; the per-question
 * evaluator count lives in evaluatorParticipation.ts.
 */

import { Change, logger } from 'firebase-functions/v1';
import { DocumentSnapshot, FieldValue, getFirestore } from 'firebase-admin/firestore';
import type { FirestoreEvent } from 'firebase-functions/v2/firestore';
import {
	Collections,
	Statement,
	StatementType,
	statementToSimpleStatement,
	defaultResultsSettings,
} from '@freedi/shared-types';
import { db } from '../index';
import { logError } from '../utils/errorHandling';
import { diffChosen, resultsUnchanged, selectChosenOptions } from './chosenOptionsSelection';
import type { ChosenDiff } from './chosenOptionsSelection';

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Firestore trigger handler for the choseBy collection.
 * Updates chosen options on a parent when its settings change.
 */
export async function updateChosenOptions(
	event: FirestoreEvent<Change<DocumentSnapshot> | DocumentSnapshot | undefined>,
): Promise<void> {
	try {
		const snapshot = getSnapshotFromEvent(event);
		if (!snapshot?.exists) return;

		const statement = snapshot.data();
		if (!statement || statement.statementType !== StatementType.option) return;

		const parentId = statement.parentStatementId;
		if (!parentId) return;

		const parentRef = getFirestore().collection(Collections.statements).doc(parentId);
		await parentRef.update({
			chosenOptions: FieldValue.arrayUnion(snapshot.id),
		});
	} catch (error) {
		logger.error('Error updating chosen options:', error);
	}
}

/** Max writes in one Firestore batch. */
const BATCH_WRITE_LIMIT = 500;

/**
 * Refreshes a question's chosen options (`isChosen` flags on its options and
 * `results` / `totalResults` on the question) after its options changed.
 *
 * Writes only the difference: an option's `isChosen` is touched only when it
 * enters or leaves the selection, and the question is written only when the
 * ordered results (or a field copied into them) actually changed. An
 * unchanged selection costs reads only, and no write means no downstream
 * trigger fan-out.
 *
 * The question's evaluator count is NOT handled here any more - see
 * evaluatorParticipation.ts.
 *
 * @param parentId - The question whose results to refresh
 */
export async function updateParentStatementWithChosenOptions(
	parentId: string | undefined,
): Promise<void> {
	if (!parentId) {
		logger.warn('updateParentStatementWithChosenOptions: parentId is undefined');

		return;
	}

	try {
		const parentStatement = await getParentStatement(parentId);

		// Use defaultResultsSettings if parent has no resultsSettings configured
		const resultsSettings = parentStatement.resultsSettings || defaultResultsSettings;

		const options = await loadOptions(parentId);
		const chosen = selectChosenOptions(options, resultsSettings);
		const currentlyChosenIds = await loadCurrentlyChosenIds(parentId);

		await applyChosenDiff(diffChosen(currentlyChosenIds, chosen));

		const nextResults = chosen.map(statementToSimpleStatement);
		if (resultsUnchanged(parentStatement, nextResults)) return;

		// lastUpdate moves with a real results change so delta listeners deliver it.
		await db.collection(Collections.statements).doc(parentId).update({
			totalResults: nextResults.length,
			results: nextResults,
			lastUpdate: Date.now(),
		});
	} catch (error) {
		logError(error, {
			operation: 'evaluation.updateParentStatementWithChosenOptions',
			metadata: { parentId },
		});
	}
}

async function loadOptions(parentId: string): Promise<Statement[]> {
	const snapshot = await db
		.collection(Collections.statements)
		.where('parentId', '==', parentId)
		.where('statementType', '==', StatementType.option)
		.get();

	return snapshot.docs.map((doc) => doc.data() as Statement);
}

/** Every child currently flagged isChosen (any type, so stale flags are cleaned too). */
async function loadCurrentlyChosenIds(parentId: string): Promise<string[]> {
	const snapshot = await db
		.collection(Collections.statements)
		.where('parentId', '==', parentId)
		.where('isChosen', '==', true)
		.get();

	return snapshot.docs.map((doc) => doc.id);
}

async function applyChosenDiff({ toUnchoose, toChoose }: ChosenDiff): Promise<void> {
	const statementsRef = db.collection(Collections.statements);
	const lastUpdate = Date.now();
	const writes: Array<{ id: string; isChosen: boolean }> = [
		...toUnchoose.map((id) => ({ id, isChosen: false })),
		...toChoose.map((id) => ({ id, isChosen: true })),
	];

	for (let start = 0; start < writes.length; start += BATCH_WRITE_LIMIT) {
		const batch = db.batch();
		writes.slice(start, start + BATCH_WRITE_LIMIT).forEach(({ id, isChosen }) => {
			batch.update(statementsRef.doc(id), { isChosen, lastUpdate });
		});
		await batch.commit();
	}
}

async function getParentStatement(parentId: string): Promise<Statement> {
	const parentDoc = await db.collection(Collections.statements).doc(parentId).get();
	const parentStatement = parentDoc.data() as Statement;

	if (!parentStatement) {
		throw new Error('Parent statement not found');
	}

	// Note: resultsSettings may be undefined - caller should use defaultResultsSettings as fallback
	return parentStatement;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function getSnapshotFromEvent(
	event: FirestoreEvent<Change<DocumentSnapshot> | DocumentSnapshot | undefined>,
): DocumentSnapshot | undefined {
	if (!event.data) return undefined;

	if ('after' in event.data) {
		return event.data.after;
	}

	return event.data;
}
