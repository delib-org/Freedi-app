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
import type { Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';
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
import {
	candidateStatus,
	diffChosen,
	planCandidates,
	resultsUnchanged,
	selectChosenOptions,
} from './chosenOptionsSelection';
import type { CandidatePlan } from './chosenOptionsSelection';
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

/** Options read per page of the consensus query: enough for the usual top 5 and its ties. */
const CANDIDATE_PAGE_MULTIPLIER = 2;
const MIN_CANDIDATE_PAGE = 10;
const THRESHOLD_CANDIDATE_PAGE = 50;

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

		const options = await loadCandidates(parentId, planCandidates(resultsSettings));
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

function optionsOf(parentId: string): Query {
	return db
		.collection(Collections.statements)
		.where('parentId', '==', parentId)
		.where('statementType', '==', StatementType.option);
}

function byDocumentId(a: Statement, b: Statement): number {
	return a.statementId < b.statementId ? -1 : 1;
}

/**
 * The options the selection can pick, read from the
 * (parentId, statementType, consensus DESC) index one page at a time, so a
 * rating reads a handful of documents however many answers the question has.
 * Sorted by document id at the end: the selection is a stable sort, and that is
 * the order a read of every option returns, so ties resolve as they always did.
 */
async function loadCandidates(
	parentId: string,
	plan: CandidatePlan | undefined,
): Promise<Statement[]> {
	if (!plan) return loadAllOptions(parentId);

	const pageSize =
		'top' in plan
			? Math.max(plan.top * CANDIDATE_PAGE_MULTIPLIER, MIN_CANDIDATE_PAGE)
			: THRESHOLD_CANDIDATE_PAGE;
	const fetched: Statement[] = [];
	let cursor: QueryDocumentSnapshot | undefined;

	for (;;) {
		let page = optionsOf(parentId).orderBy('consensus', 'desc').limit(pageSize);
		if (cursor) page = page.startAfter(cursor);
		const snapshot = await page.get();

		fetched.push(...snapshot.docs.map((doc) => doc.data() as Statement));
		const status = candidateStatus(fetched, plan, snapshot.size < pageSize);
		if (status === 'complete') return fetched.sort(byDocumentId);
		if (status === 'readAll') return loadAllOptions(parentId);

		cursor = snapshot.docs[snapshot.docs.length - 1];
	}
}

async function loadAllOptions(parentId: string): Promise<Statement[]> {
	const snapshot = await optionsOf(parentId).get();

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
