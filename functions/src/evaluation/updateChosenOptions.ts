/**
 * Chosen options logic for parent statements.
 *
 * Handles determining which child options are "chosen" based on
 * evaluation results and the parent's resultsSettings configuration.
 * Also manages parent total evaluator counts.
 */

import { Change, logger } from 'firebase-functions/v1';
import { DocumentSnapshot, FieldValue, getFirestore } from 'firebase-admin/firestore';
import type { FirestoreEvent } from 'firebase-functions/v2/firestore';
import {
	Collections,
	Evaluation,
	Statement,
	StatementEvaluation,
	StatementType,
	statementToSimpleStatement,
	ResultsSettings,
	ResultsBy,
	CutoffBy,
	defaultResultsSettings,
} from '@freedi/shared-types';
import { db } from '../index';
import { logError } from '../utils/errorHandling';

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

/**
 * Updates a parent statement's chosen options and total evaluator count
 * based on its child options' evaluations.
 *
 * Called after any evaluation change to refresh the parent's results.
 *
 * @param parentId - The parent statement ID to update
 */
export async function updateParentStatementWithChosenOptions(
	parentId: string | undefined,
): Promise<void> {
	if (!parentId) {
		logger.warn('updateParentStatementWithChosenOptions: parentId is undefined');

		return;
	}

	try {
		logger.info(`updateParentStatementWithChosenOptions: Starting for parent ${parentId}`);

		const parentStatement = await getParentStatement(parentId);
		logger.info(
			`updateParentStatementWithChosenOptions: Parent statement found, resultsSettings: ${JSON.stringify(parentStatement.resultsSettings)}`,
		);

		// Use defaultResultsSettings if parent has no resultsSettings configured
		const resultsSettings = parentStatement.resultsSettings || defaultResultsSettings;
		logger.info(
			`updateParentStatementWithChosenOptions: Using resultsSettings: ${JSON.stringify(resultsSettings)}`,
		);

		const chosenOptions = await choseTopOptions(parentId, resultsSettings);
		logger.info(
			`updateParentStatementWithChosenOptions: Found ${chosenOptions.length} chosen options`,
		);

		if (chosenOptions.length > 0) {
			logger.info(
				`updateParentStatementWithChosenOptions: Updating parent with ${chosenOptions.length} results`,
			);
			await updateParentWithResults(parentId, chosenOptions);
			logger.info(`updateParentStatementWithChosenOptions: Parent updated successfully`);
		} else {
			logger.info(`updateParentStatementWithChosenOptions: No chosen options, clearing results`);
			await updateParentWithResults(parentId, []);
		}

		// Update parent's total evaluator count
		await updateParentTotalEvaluators(parentId);
	} catch (error) {
		logger.error('Error updating parent statement:', error);
	}
}

// ============================================================================
// PARENT EVALUATOR TRACKING
// ============================================================================

/**
 * Counts unique evaluators across all child options and updates
 * the parent statement's total evaluator count.
 */
export async function updateParentTotalEvaluators(parentId: string): Promise<void> {
	try {
		// Get all evaluations for child options
		const evaluationsSnapshot = await db
			.collection(Collections.evaluations)
			.where('parentId', '==', parentId)
			.get();

		// Count unique evaluators (users who have evaluated at least one option)
		const uniqueEvaluators = new Set<string>();
		evaluationsSnapshot.forEach((doc) => {
			const evaluation = doc.data() as Evaluation;
			// Only count evaluators with non-zero evaluations
			if (evaluation.evaluator?.uid && evaluation.evaluation !== 0) {
				uniqueEvaluators.add(evaluation.evaluator.uid);
			}
		});

		const totalUniqueEvaluators = uniqueEvaluators.size;

		// Update parent statement with the total count
		const parentRef = db.collection(Collections.statements).doc(parentId);
		const parentDoc = await parentRef.get();

		if (!parentDoc.exists) {
			logger.warn(`Parent statement ${parentId} not found`);

			return;
		}

		const parentData = parentDoc.data() as Statement;
		const parentEvaluation: StatementEvaluation = parentData.evaluation || {
			agreement: 0,
			sumEvaluations: 0,
			numberOfEvaluators: 0,
			sumPro: 0,
			sumCon: 0,
			numberOfProEvaluators: 0,
			numberOfConEvaluators: 0,
			sumSquaredEvaluations: 0,
			averageEvaluation: 0,
			evaluationRandomNumber: Math.random(),
			viewed: 0,
		};

		// Update asParentTotalEvaluators field
		parentEvaluation.asParentTotalEvaluators = totalUniqueEvaluators;

		await parentRef.update({
			evaluation: parentEvaluation,
			totalEvaluators: totalUniqueEvaluators, // Also update the legacy field for compatibility
			lastUpdate: Date.now(),
		});

		logger.info(`Updated parent ${parentId} with ${totalUniqueEvaluators} total unique evaluators`);
	} catch (error) {
		logger.error('Error updating parent total evaluators:', error);
	}
}

// ============================================================================
// OPTION SELECTION LOGIC
// ============================================================================

async function choseTopOptions(
	parentId: string,
	resultsSettings: ResultsSettings,
): Promise<Statement[]> {
	try {
		await clearPreviousChosenOptions(parentId);

		const chosenOptions = await getOptionsUsingMethod(parentId, resultsSettings);
		if (!chosenOptions?.length) {
			// No options found is a valid state, not an error
			logger.info(`No options found for parent ${parentId}`);

			return [];
		}

		const sortedOptions = getSortedOptions(chosenOptions, resultsSettings);
		await markOptionsAsChosen(sortedOptions);

		return sortedOptions;
	} catch (error) {
		logger.error('Error choosing top options:', error);

		return [];
	}
}

async function clearPreviousChosenOptions(parentId: string | undefined): Promise<void> {
	try {
		if (!parentId) throw new Error('Parent ID is required');

		const statementsRef = db.collection(Collections.statements);
		const previousChosenDocs = await statementsRef
			.where('parentId', '==', parentId)
			.where('isChosen', '==', true)
			.get();

		const batch = db.batch();
		previousChosenDocs.forEach((doc) => {
			batch.update(statementsRef.doc(doc.id), { isChosen: false });
		});

		await batch.commit();
	} catch (error) {
		logError(error, {
			operation: 'evaluation.clearPreviousChosenOptions',
			metadata: { parentId },
		});
	}
}

async function markOptionsAsChosen(statements: Statement[]): Promise<void> {
	const statementsRef = db.collection(Collections.statements);
	const batch = db.batch();

	statements.forEach((statement) => {
		batch.update(statementsRef.doc(statement.statementId), { isChosen: true });
	});

	await batch.commit();
}

function getSortedOptions(statements: Statement[], resultsSettings: ResultsSettings): Statement[] {
	const { resultsBy } = resultsSettings;

	const sortComparisons = {
		[ResultsBy.consensus]: (a: Statement, b: Statement) =>
			(b.evaluation?.agreement ?? b.consensus ?? 0) - (a.evaluation?.agreement ?? a.consensus ?? 0),
		[ResultsBy.mostLiked]: (a: Statement, b: Statement) =>
			(b.evaluation?.sumPro ?? 0) - (a.evaluation?.sumPro ?? 0),
		[ResultsBy.averageLikesDislikes]: (a: Statement, b: Statement) =>
			(b.evaluation?.sumEvaluations ?? 0) - (a.evaluation?.sumEvaluations ?? 0),
		[ResultsBy.topOptions]: (a: Statement, b: Statement) =>
			(b.evaluation?.agreement ?? b.consensus ?? 0) - (a.evaluation?.agreement ?? a.consensus ?? 0),
	};

	return statements.sort(sortComparisons[resultsBy] || sortComparisons[ResultsBy.consensus]);
}

async function getOptionsUsingMethod(
	parentId: string,
	resultsSettings: ResultsSettings,
): Promise<Statement[] | undefined> {
	const { numberOfResults, resultsBy, cutoffBy, cutoffNumber } = resultsSettings;

	logger.info(
		`getOptionsUsingMethod: parentId=${parentId}, numberOfResults=${numberOfResults}, resultsBy=${resultsBy}, cutoffBy=${cutoffBy}, cutoffNumber=${cutoffNumber}`,
	);

	// cutoffNumber serves as the minimum threshold (default to 0, meaning no minimum)
	const effectiveCutoffNumber = cutoffNumber ?? 0;

	const baseQuery = db
		.collection(Collections.statements)
		.where('parentId', '==', parentId)
		.where('statementType', '==', StatementType.option);

	// Default to topOptions if cutoffBy is not specified
	const effectiveCutoffBy = cutoffBy || CutoffBy.topOptions;

	logger.info(
		`getOptionsUsingMethod: effectiveCutoffBy=${effectiveCutoffBy}, effectiveCutoffNumber=${effectiveCutoffNumber}`,
	);

	if (effectiveCutoffBy === CutoffBy.topOptions) {
		const effectiveNumberOfResults = numberOfResults || 5; // Default to 5 results

		// topOptions mode: Get top N results sorted by the chosen metric
		// NO cutoffNumber filtering - just return top N regardless of their values
		const snapshot = await baseQuery.get();

		logger.info(`getOptionsUsingMethod (topOptions): Query returned ${snapshot.size} documents`);

		if (snapshot.empty) {
			logger.info(`getOptionsUsingMethod: No options found for parent ${parentId}`);

			return [];
		}

		const options = snapshot.docs
			.map((doc) => {
				const data = doc.data() as Statement;
				logger.info(
					`getOptionsUsingMethod: Option ${doc.id}, statementType=${data.statementType}, consensus=${data.consensus}, hide=${data.hide}`,
				);

				return data;
			})
			// Filter out hidden statements (e.g., merged source statements)
			.filter((opt) => !opt.hide);

		// Sort by the appropriate field, treating undefined as lowest priority
		const sortedOptions = sortOptionsByResultsBy(options, resultsBy);

		// Return top N results (no cutoff filtering in topOptions mode)
		const result = sortedOptions.slice(0, Math.ceil(Number(effectiveNumberOfResults)));
		logger.info(
			`getOptionsUsingMethod (topOptions): Returning top ${result.length} options (limit: ${effectiveNumberOfResults})`,
		);

		return result;
	}

	if (effectiveCutoffBy === CutoffBy.aboveThreshold) {
		// Get all options and filter in memory to handle undefined fields
		const snapshot = await baseQuery.get();

		logger.info(
			`getOptionsUsingMethod (aboveThreshold): Query returned ${snapshot.size} documents`,
		);

		if (snapshot.empty) {
			return [];
		}

		const options = snapshot.docs.map((doc) => doc.data() as Statement);

		// Filter options above the threshold
		const filtered = options.filter(
			(opt) => getEvaluationValue(opt, resultsBy) > effectiveCutoffNumber,
		);
		logger.info(
			`getOptionsUsingMethod (aboveThreshold): After filtering, ${filtered.length} options remain`,
		);

		return filtered;
	}

	logger.warn(`getOptionsUsingMethod: Unknown cutoffBy value: ${effectiveCutoffBy}`);

	return undefined;
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

async function getParentStatement(parentId: string): Promise<Statement> {
	const parentDoc = await db.collection(Collections.statements).doc(parentId).get();
	const parentStatement = parentDoc.data() as Statement;

	if (!parentStatement) {
		throw new Error('Parent statement not found');
	}

	// Note: resultsSettings may be undefined - caller should use defaultResultsSettings as fallback
	return parentStatement;
}

async function updateParentWithResults(
	parentId: string,
	chosenOptions: Statement[],
): Promise<void> {
	logger.info(
		`updateParentWithResults: Starting update for parent ${parentId} with ${chosenOptions.length} options`,
	);

	const childStatementsSimple = chosenOptions.map(statementToSimpleStatement);

	logger.info(
		`updateParentWithResults: Converted to ${childStatementsSimple.length} simple statements`,
	);
	logger.info(
		`updateParentWithResults: Results data: ${JSON.stringify(childStatementsSimple.map((s) => ({ id: s.statementId, statement: s.statement?.substring(0, 30) })))}`,
	);

	try {
		await db.collection(Collections.statements).doc(parentId).update({
			totalResults: childStatementsSimple.length,
			results: childStatementsSimple,
		});
		logger.info(`updateParentWithResults: Successfully updated parent ${parentId} with results`);
	} catch (error) {
		logger.error(`updateParentWithResults: Failed to update parent ${parentId}:`, error);
		throw error;
	}
}

function getEvaluationValue(statement: Statement, resultsBy: ResultsBy): number {
	switch (resultsBy) {
		case ResultsBy.consensus:
		case ResultsBy.topOptions:
			return statement.evaluation?.agreement ?? statement.consensus ?? 0;
		case ResultsBy.mostLiked:
			return statement.evaluation?.sumPro ?? 0;
		case ResultsBy.averageLikesDislikes:
			return statement.evaluation?.sumEvaluations ?? 0;
		default:
			return statement.evaluation?.agreement ?? statement.consensus ?? 0;
	}
}

function sortOptionsByResultsBy(options: Statement[], resultsBy: ResultsBy): Statement[] {
	return [...options].sort((a, b) => {
		const aValue = getEvaluationValue(a, resultsBy);
		const bValue = getEvaluationValue(b, resultsBy);

		return bValue - aValue; // Descending order
	});
}
