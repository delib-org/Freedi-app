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

		const [statement] = await Promise.all([
			updateStatementEvaluation({
				statementId,
				evaluationDiff: evaluation.evaluation,
				addEvaluator: 1,
				action: ActionTypes.new,
				newEvaluation: evaluation.evaluation,
				oldEvaluation: 0,
				userId,
				parentId
			}),
			//calculate the number of total evaluators (N)
			updateParentStatementWithTotalEvaluators(evaluation)
		]);

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
			addEvaluator: -1,
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
	const { statementId, evaluationDiff, addEvaluator = 0, action, newEvaluation, oldEvaluation } = props;

	try {
		if (!statementId) {
			throw new Error('statementId is required');
		}

		parse(number(), evaluationDiff);

		// Calculate pro/con differences
		const proConDiff = calcDiffEvaluation({ newEvaluation, oldEvaluation, action });
		// const userEvaluationValue = proConDiff.proDiff - proConDiff.conDiff;

		// Update statement evaluation
		await updateStatementInTransaction(statementId, evaluationDiff, addEvaluator, proConDiff);

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
		sumEvaluations: evaluationDiff,
		numberOfEvaluators: statement.totalEvaluators || 1,
		sumPro: proConDiff.proDiff,
		sumCon: proConDiff.conDiff,
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

async function updateParentStatementWithTotalEvaluators(evaluation:Evaluation): Promise<void> {
	try {

		//check if this is the first time the user has evaluted in this parent Id
		const isFirstEvaluation = await checkFirstEvaluation(evaluation);
		
		if (isFirstEvaluation) {
			//update the parent statement with the new total evaluators
			await updateParentWithNewEvaluatorCount(evaluation);
		}
	} catch (error) {
		logger.error('Error updating parent statement total evaluators:', error);
	}

	async function checkFirstEvaluation(evaluation: Evaluation): Promise<boolean> {
		try {
			const userEvaluationsDB = await db.collection(Collections.evaluations).where("parentId", "==", evaluation.parentId).where("evaluatorId", "==", evaluation.evaluatorId).get();
			if (userEvaluationsDB.size === 1) {
				return true;
			}

			return false;
		} catch (error) {
			logger.error('Error checking first evaluation:', error);

			return false;
		}
	}

	async function updateParentWithNewEvaluatorCount(evaluation: Evaluation): Promise<void> {
		try {
			if (!evaluation.parentId) {
				throw new Error('Parent ID is required');
			}

			const parentRef = db.collection(Collections.statements).doc(evaluation.parentId);
			await parentRef.update({
				'evaluation.asParentTotalEvaluators': FieldValue.increment(1),
			});
		} catch (error) {
			logger.error('Error updating parent statement with new evaluator count:', error);
		}
	}
}

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
	} catch (error) {
		logger.error('Error updating parent statement:', error);
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