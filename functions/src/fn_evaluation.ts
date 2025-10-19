import { Change, logger } from 'firebase-functions/v1';
import { db } from './index';
import {
	DocumentSnapshot,
	FieldValue,
	getFirestore,
} from 'firebase-admin/firestore';
import { FirestoreEvent } from 'firebase-functions/firestore';
import {
	Evaluation,
	Statement,
	StatementSchema,
	Collections,
	StatementType,
	statementToSimpleStatement,
	ResultsSettings,
	ResultsBy,
	CutoffBy
} from 'delib-npm';

import { number, parse } from 'valibot';
import { updateUserDemographicEvaluation } from './fn_polarizationIndex';

// import { getRandomColor } from './helpers';
// import { user } from 'firebase-functions/v1/auth';

// ============================================================================
// TYPES & ENUMS
// ============================================================================

enum ActionTypes {
	new = 'new',
	update = 'update',
	delete = 'delete',
}

interface UpdateStatementEvaluationProps {
	statementId: string;
	evaluationDiff: number;
	addEvaluator?: number;
	action: ActionTypes;
	newEvaluation: number;
	oldEvaluation: number;
	userId?: string;
	parentId: string;
}

interface CalcDiff {
	proDiff: number;
	conDiff: number;
}

// ============================================================================
// MAIN EVENT HANDLERS
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function newEvaluation(event: any): Promise<void> {
	try {

		const evaluation = event.data.data() as Evaluation;
		const { statementId, parentId } = evaluation;
		const userId = evaluation.evaluator?.uid;

		if (!statementId) {
			throw new Error('statementId is required');
		}

		if (!userId) {
			throw new Error('User ID is required');
		}

		// Note: The evaluator count is now properly tracked in updateStatementEvaluation
		// which handles the logic for when to actually increment the evaluator count
		const statement = await updateStatementEvaluation({
			statementId,
			evaluationDiff: evaluation.evaluation,
			addEvaluator: 0, // Will be calculated in updateStatementEvaluation
			action: ActionTypes.new,
			newEvaluation: evaluation.evaluation,
			oldEvaluation: 0,
			userId,
			parentId
		});

		if (!statement) {
			throw new Error('Failed to update statement');
		}

		await updateParentStatementWithChosenOptions(statement.parentId);

		//update demographic evaluation (it will check if demographic question exists later on)
		const userEvalData = {
			userId,
			evaluation: evaluation.evaluation || 0,
		}
		updateUserDemographicEvaluation(statement, userEvalData)

	} catch (error) {
		logger.error('Error in newEvaluation:', error);
	}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteEvaluation(event: any): Promise<void> {
	try {
		const evaluation = event.data.data() as Evaluation;
		const { statementId, evaluation: evaluationValue } = evaluation;
		const userId = evaluation.evaluator?.uid;

		if (!statementId) {
			throw new Error('statementId is required');
		}

		const statement = await updateStatementEvaluation({
			statementId,
			evaluationDiff: -1 * evaluationValue,
			addEvaluator: 0, // Will be calculated in updateStatementEvaluation
			action: ActionTypes.delete,
			newEvaluation: 0,
			oldEvaluation: evaluationValue,
			userId,
			parentId: evaluation.parentId,
		});

		if (!statement) {
			throw new Error('Failed to update statement');
		}

		await updateParentStatementWithChosenOptions(statement.parentId);

	} catch (error) {
		logger.error('Error in deleteEvaluation:', error);
	}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateEvaluation(event: any): Promise<void> {
	try {
		const before = event.data.before.data() as Evaluation;
		const after = event.data.after.data() as Evaluation;

		const evaluationDiff = after.evaluation - before.evaluation;
		const userId = after.evaluator?.uid;

		if (!userId) {
			throw new Error('User ID is required');
		}

		if (!after.statementId) {
			throw new Error('statementId is required');
		}

		const statement = await updateStatementEvaluation({
			statementId: after.statementId,
			evaluationDiff,
			action: ActionTypes.update,
			newEvaluation: after.evaluation,
			oldEvaluation: before.evaluation,
			userId,
			parentId: after.parentId,
		});

		if (!statement) {
			throw new Error('Failed to update statement');
		}

		await updateParentStatementWithChosenOptions(statement.parentId);

		//update demographic evaluation (it will check if demographic question exists later on)
		const userEvalData = {
			userId,
			evaluation: after.evaluation || 0,
		}
		updateUserDemographicEvaluation(statement, userEvalData)

	} catch (error) {
		logger.error('Error in updateEvaluation:', error);
	}
}

// ============================================================================
// CORE BUSINESS LOGIC
// ============================================================================

async function updateStatementEvaluation(props: UpdateStatementEvaluationProps): Promise<Statement | undefined> {
	const { statementId, evaluationDiff, action, newEvaluation, oldEvaluation } = props;

	try {
		if (!statementId) {
			throw new Error('statementId is required');
		}

		parse(number(), evaluationDiff);

		// Calculate pro/con differences
		const proConDiff = calcDiffEvaluation({ newEvaluation, oldEvaluation, action });

		// Determine if we should actually add an evaluator
		// Only count as a new evaluator if:
		// 1. It's a truly new evaluation (action = new AND newEvaluation is not 0)
		// 2. It's transitioning from no evaluation (0) to having an evaluation
		let actualAddEvaluator = 0;
		if (action === ActionTypes.new && newEvaluation !== 0) {
			actualAddEvaluator = 1;
		} else if (action === ActionTypes.update && oldEvaluation === 0 && newEvaluation !== 0) {
			actualAddEvaluator = 1;
		} else if (action === ActionTypes.update && oldEvaluation !== 0 && newEvaluation === 0) {
			actualAddEvaluator = -1;
		} else if (action === ActionTypes.delete && oldEvaluation !== 0) {
			actualAddEvaluator = -1;
		}

		// Update statement evaluation
		await updateStatementInTransaction(statementId, evaluationDiff, actualAddEvaluator, proConDiff);

		// Return updated statement
		const statementRef = db.collection(Collections.statements).doc(statementId);
		const updatedStatement = await statementRef.get();

		return updatedStatement.data() as Statement;

	} catch (error) {
		logger.error('Error in updateStatementEvaluation:', error);

		return undefined;
	}
}

// ============================================================================
// STATEMENT UPDATE HELPERS
// ============================================================================

async function ensureAverageEvaluationForAllOptions(parentId: string): Promise<void> {
	try {
		// Get all options under this parent
		const optionsSnapshot = await db.collection(Collections.statements)
			.where('parentId', '==', parentId)
			.where('statementType', '==', StatementType.option)
			.get();

		if (optionsSnapshot.empty) {
			return;
		}

		const batch = db.batch();
		let needsUpdate = false;

		optionsSnapshot.docs.forEach(doc => {
			const data = doc.data();

			// Check if evaluation exists and has averageEvaluation
			if (!data.evaluation || data.evaluation.averageEvaluation === undefined) {
				needsUpdate = true;

				// Calculate the average if we have the data
				const evaluation = data.evaluation || {
					sumEvaluations: 0,
					numberOfEvaluators: 0,
					agreement: 0,
					sumPro: 0,
					sumCon: 0,
					evaluationRandomNumber: Math.random(),
					viewed: 0,
				};

				// Ensure averageEvaluation is calculated
				evaluation.averageEvaluation = evaluation.numberOfEvaluators > 0
					? evaluation.sumEvaluations / evaluation.numberOfEvaluators
					: 0;

				batch.update(doc.ref, {
					evaluation,
					lastUpdate: Date.now()
				});
			}
		});

		if (needsUpdate) {
			await batch.commit();
			logger.info(`Fixed averageEvaluation for ${optionsSnapshot.size} options under parent ${parentId}`);
		}
	} catch (error) {
		logger.error('Error fixing averageEvaluation for options:', error);
	}
}

async function updateStatementInTransaction(
	statementId: string,
	evaluationDiff: number,
	addEvaluator: number,
	proConDiff: CalcDiff
): Promise<void> {
	await db.runTransaction(async (transaction) => {
		const statementRef = db.collection(Collections.statements).doc(statementId);
		const statementDoc = await transaction.get(statementRef);
		const statementData = statementDoc.data();

		if (!statementData) {
			throw new Error('Statement not found');
		}

		// Check if this statement is missing averageEvaluation
		if (statementData.statementType === StatementType.option &&
			(!statementData.evaluation || statementData.evaluation.averageEvaluation === undefined)) {

			// Log that we detected a missing field
			logger.info(`Detected missing averageEvaluation for option ${statementId}, will fix all siblings under parent ${statementData.parentId}`);

			// Schedule the fix after transaction completes to avoid conflicts
			setImmediate(() => {
				ensureAverageEvaluationForAllOptions(statementData.parentId);
			});

			// For now, ensure this statement has the field to prevent immediate error
			if (!statementData.evaluation) {
				statementData.evaluation = {
					sumEvaluations: 0,
					numberOfEvaluators: 0,
					agreement: 0,
					sumPro: 0,
					sumCon: 0,
					averageEvaluation: 0,
					evaluationRandomNumber: Math.random(),
					viewed: 0,
				};
			} else {
				// Calculate based on existing data
				statementData.evaluation.averageEvaluation = statementData.evaluation.numberOfEvaluators > 0
					? statementData.evaluation.sumEvaluations / statementData.evaluation.numberOfEvaluators
					: 0;
			}
		}

		const statement = parse(StatementSchema, statementData);

		const { agreement, evaluation } = calculateEvaluation(statement, proConDiff, evaluationDiff, addEvaluator);

		transaction.update(statementRef, {
			totalEvaluators: FieldValue.increment(addEvaluator),
			consensus: agreement,
			evaluation,
			proSum: FieldValue.increment(proConDiff.proDiff),
			conSum: FieldValue.increment(proConDiff.conDiff),
		});
	});
}

function calculateEvaluation(statement: Statement, proConDiff: CalcDiff, evaluationDiff: number, addEvaluator: number) {
	const evaluation = statement.evaluation || {
		agreement: statement.consensus || 0,
		sumEvaluations: 0,
		numberOfEvaluators: statement.totalEvaluators || 0,
		sumPro: 0,
		sumCon: 0,
		averageEvaluation: 0,
		evaluationRandomNumber: Math.random(),
		viewed: 0,
	};

	if (statement.evaluation) {
		evaluation.sumEvaluations += evaluationDiff;
		evaluation.numberOfEvaluators += addEvaluator;
		evaluation.sumPro = (evaluation.sumPro || 0) + proConDiff.proDiff;
		evaluation.sumCon = (evaluation.sumCon || 0) + proConDiff.conDiff;
		// Ensure averageEvaluation exists even for old data
		evaluation.averageEvaluation = evaluation.averageEvaluation ?? 0;
	} else {
		// For new evaluations, apply the diffs and evaluator count
		evaluation.sumEvaluations = evaluationDiff;
		evaluation.numberOfEvaluators = addEvaluator;
		evaluation.sumPro = proConDiff.proDiff;
		evaluation.sumCon = proConDiff.conDiff;
	}

	// Calculate average evaluation
	evaluation.averageEvaluation = evaluation.numberOfEvaluators > 0
		? evaluation.sumEvaluations / evaluation.numberOfEvaluators
		: 0;

	const agreement = calcAgreement(evaluation.sumEvaluations, evaluation.numberOfEvaluators);
	evaluation.agreement = agreement;

	return { agreement, evaluation };
}

// ============================================================================
// AGREEMENT CALCULATION LOGIC
// ============================================================================

function calcAgreement(sumEvaluations: number, numberOfEvaluators: number): number {
	try {
		parse(number(), sumEvaluations);
		parse(number(), numberOfEvaluators);

		if (numberOfEvaluators === 0) numberOfEvaluators = 1;

		const averageEvaluation = sumEvaluations / numberOfEvaluators;

		return averageEvaluation * Math.sqrt(numberOfEvaluators);
	} catch (error) {
		logger.error('Error calculating agreement:', error);

		return 0;
	}
}

function calcDiffEvaluation({ action, newEvaluation, oldEvaluation }: {
	action: ActionTypes;
	newEvaluation: number;
	oldEvaluation: number;
}): CalcDiff {
	try {
		const positiveDiff = Math.max(newEvaluation, 0) - Math.max(oldEvaluation, 0);
		const negativeDiff = Math.min(newEvaluation, 0) - Math.min(oldEvaluation, 0);

		switch (action) {
			case ActionTypes.new:
				return {
					proDiff: Math.max(newEvaluation, 0),
					conDiff: Math.max(-newEvaluation, 0),
				};
			case ActionTypes.delete:
				return {
					proDiff: Math.min(-oldEvaluation, 0),
					conDiff: Math.max(oldEvaluation, 0),
				};
			case ActionTypes.update:
				return {
					proDiff: positiveDiff,
					conDiff: -negativeDiff
				};
			default:
				throw new Error('Invalid action type');
		}
	} catch (error) {
		logger.error('Error calculating evaluation diff:', error);

		return { proDiff: 0, conDiff: 0 };
	}
}

// ============================================================================
// PARENT STATEMENT UPDATE LOGIC
// ============================================================================

export async function updateChosenOptions(event: FirestoreEvent<Change<DocumentSnapshot> | DocumentSnapshot | undefined>): Promise<void> {
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

function getSnapshotFromEvent(event: FirestoreEvent<Change<DocumentSnapshot> | DocumentSnapshot | undefined>): DocumentSnapshot | undefined {
	if (!event.data) return undefined;

	if ('after' in event.data) {
		return event.data.after;
	}

	return event.data;
}

// Note: Removed updateParentStatementWithTotalEvaluators function
// The evaluator counting logic is now handled properly through the
// addEvaluator parameter in updateStatementEvaluation which tracks
// actual new evaluations vs updates to existing evaluations

async function updateParentStatementWithChosenOptions(parentId: string | undefined): Promise<void> {
	if (!parentId) return;

	try {
		const parentStatement = await getParentStatement(parentId);

		if (!parentStatement.resultsSettings) {
			logger.warn('No results settings found for parent statement');

			return;
		}

		const chosenOptions = await choseTopOptions(parentId, parentStatement.resultsSettings);

		if (chosenOptions) {
			await updateParentWithResults(parentId, chosenOptions);
		}

		// Update parent's total evaluator count
		await updateParentTotalEvaluators(parentId);
	} catch (error) {
		logger.error('Error updating parent statement:', error);
	}
}

async function updateParentTotalEvaluators(parentId: string): Promise<void> {
	try {
		// Get all evaluations for child options
		const evaluationsSnapshot = await db
			.collection(Collections.evaluations)
			.where('parentId', '==', parentId)
			.get();

		// Count unique evaluators (users who have evaluated at least one option)
		const uniqueEvaluators = new Set<string>();
		evaluationsSnapshot.forEach(doc => {
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
		const parentEvaluation = parentData.evaluation || {
			agreement: 0,
			sumEvaluations: 0,
			numberOfEvaluators: 0,
			sumPro: 0,
			sumCon: 0,
			averageEvaluation: 0,
			evaluationRandomNumber: Math.random(),
			viewed: 0,
		};

		// Update asParentTotalEvaluators field
		parentEvaluation.asParentTotalEvaluators = totalUniqueEvaluators;

		await parentRef.update({
			evaluation: parentEvaluation,
			totalEvaluators: totalUniqueEvaluators, // Also update the legacy field for compatibility
			lastUpdate: Date.now()
		});

		logger.info(`Updated parent ${parentId} with ${totalUniqueEvaluators} total unique evaluators`);
	} catch (error) {
		logger.error('Error updating parent total evaluators:', error);
	}
}

async function getParentStatement(parentId: string): Promise<Statement> {
	const parentDoc = await db.collection(Collections.statements).doc(parentId).get();
	const parentStatement = parentDoc.data() as Statement;

	if (!parentStatement) {
		throw new Error('Parent statement not found');
	}

	if (!parentStatement.resultsSettings) {
		throw new Error('Results settings not found');
	}

	return parentStatement;
}

async function updateParentWithResults(parentId: string, chosenOptions: Statement[]): Promise<void> {
	const childStatementsSimple = chosenOptions.map(statementToSimpleStatement);

	await db.collection(Collections.statements).doc(parentId).update({
		totalResults: childStatementsSimple.length,
		results: childStatementsSimple,
	});
}

// ============================================================================
// OPTION SELECTION LOGIC
// ============================================================================

async function choseTopOptions(parentId: string, resultsSettings: ResultsSettings): Promise<Statement[] | undefined> {
	try {
		await clearPreviousChosenOptions(parentId);

		const chosenOptions = await getOptionsUsingMethod(parentId, resultsSettings);
		if (!chosenOptions?.length) {
			throw new Error("No top options found");
		}

		const sortedOptions = getSortedOptions(chosenOptions, resultsSettings);
		await markOptionsAsChosen(sortedOptions);

		return sortedOptions;
	} catch (error) {
		logger.error('Error choosing top options:', error);

		return undefined;
	}
}

async function clearPreviousChosenOptions(parentId: string | undefined): Promise<void> {
	try {
		if (!parentId) throw new Error('Parent ID is required');

		const statementsRef = db.collection(Collections.statements);
		const previousChosenDocs = await statementsRef.where('parentId', '==', parentId).where('isChosen', '==', true).get();

		const batch = db.batch();
		previousChosenDocs.forEach((doc) => {
			batch.update(statementsRef.doc(doc.id), { isChosen: false });
		});

		await batch.commit();
	} catch (error) {
		console.error('Error clearing previous chosen options:', error);
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
		[ResultsBy.consensus]: (a: Statement, b: Statement) => b.consensus - a.consensus,
		[ResultsBy.mostLiked]: (a: Statement, b: Statement) => (b.evaluation?.sumPro ?? 0) - (a.evaluation?.sumPro ?? 0),
		[ResultsBy.averageLikesDislikes]: (a: Statement, b: Statement) => (b.evaluation?.sumEvaluations ?? 0) - (a.evaluation?.sumEvaluations ?? 0),
		[ResultsBy.topOptions]: (a: Statement, b: Statement) => b.consensus - a.consensus,
	};

	return statements.sort(sortComparisons[resultsBy] || sortComparisons[ResultsBy.consensus]);
}

async function getOptionsUsingMethod(parentId: string, resultsSettings: ResultsSettings): Promise<Statement[] | undefined> {
	const { numberOfResults, resultsBy, cutoffBy, cutoffNumber } = resultsSettings;
	const evaluationField = getEvaluationField(resultsBy);

	const baseQuery = db
		.collection(Collections.statements)
		.where('parentId', '==', parentId)
		.where('statementType', '==', StatementType.option);

	if (cutoffBy === CutoffBy.topOptions) {
		const snapshot = await baseQuery
			.orderBy(evaluationField, 'desc')
			.limit(Math.ceil(Number(numberOfResults)))
			.get();

		return snapshot.docs.map(doc => doc.data() as Statement);
	}

	if (cutoffBy === CutoffBy.aboveThreshold) {
		const snapshot = await baseQuery
			.where(evaluationField, '>', cutoffNumber)
			.get();

		return snapshot.docs.map(doc => doc.data() as Statement);
	}

	return undefined;
}

function getEvaluationField(resultsBy: ResultsBy): string {
	const fieldMap = {
		[ResultsBy.consensus]: 'consensus',
		[ResultsBy.mostLiked]: 'evaluation.sumPro',
		[ResultsBy.averageLikesDislikes]: 'evaluation.sumEvaluations',
		[ResultsBy.topOptions]: 'consensus',
	};

	return fieldMap[resultsBy] || 'consensus';
}