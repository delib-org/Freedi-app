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
	CutoffBy,
	PolarizationMetrics,
	PolarizationAxis,
	UserQuestion,
	PolarizationGroup,
} from 'delib-npm';

import { number, parse } from 'valibot';
import { getRandomColor } from './helpers';

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

interface MADResult {
	newMAD: number;
	newMean: number;
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

		const statement = await updateStatementEvaluation({
			statementId,
			evaluationDiff: evaluation.evaluation,
			addEvaluator: 1,
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

	} catch (error) {
		logger.error('Error in updateEvaluation:', error);
	}
}

// ============================================================================
// CORE BUSINESS LOGIC
// ============================================================================

async function updateStatementEvaluation(props: UpdateStatementEvaluationProps): Promise<Statement | undefined> {
	const { statementId, evaluationDiff, addEvaluator = 0, action, newEvaluation, oldEvaluation, userId, parentId } = props;

	try {
		if (!statementId) {
			throw new Error('statementId is required');
		}

		parse(number(), evaluationDiff);

		// Calculate pro/con differences
		const proConDiff = calcDiffEvaluation({ newEvaluation, oldEvaluation, action });
		const userEvaluationValue = proConDiff.proDiff - proConDiff.conDiff;

		// Update statement evaluation
		await updateStatementInTransaction(statementId, evaluationDiff, addEvaluator, proConDiff);

		// Update polarization index (if user data exists)
		if (userId) {
			await updatePolarizationIndex(statementId, parentId, userId, userEvaluationValue, addEvaluator);
		}

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

async function updateStatementInTransaction(
	statementId: string,
	evaluationDiff: number,
	addEvaluator: number,
	proConDiff: CalcDiff
): Promise<void> {
	await db.runTransaction(async (transaction) => {
		const statementRef = db.collection(Collections.statements).doc(statementId);
		const statementDoc = await transaction.get(statementRef);
		const statement = parse(StatementSchema, statementDoc.data());

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
	};

	if (statement.evaluation) {
		evaluation.sumEvaluations += evaluationDiff;
		evaluation.numberOfEvaluators += addEvaluator;
		evaluation.sumPro = (evaluation.sumPro || 0) + proConDiff.proDiff;
		evaluation.sumCon = (evaluation.sumCon || 0) + proConDiff.conDiff;
	}

	const agreement = calcAgreement(evaluation.sumEvaluations, evaluation.numberOfEvaluators);
	evaluation.agreement = agreement;

	return { agreement, evaluation };
}

// ============================================================================
// POLARIZATION INDEX HELPERS
// ============================================================================

async function updatePolarizationIndex(
	statementId: string,
	parentId: string,
	userId: string,
	userEvaluationValue: number,
	addEvaluator: number
): Promise<void> {
	try {
		const userAnswers = await getUserDemographicData(userId, parentId);

		if (userAnswers.length === 0) {
			logger.info(`No demographic data for user ${userId} on statement ${parentId} - skipping polarization index`);

			return;
		}

		// Get user demographic data
		const polarizationRef = db.collection(Collections.polarizationIndex).doc(statementId);
		const polarizationDB = await polarizationRef.get();

		if (!polarizationDB.exists) {
			// Create new polarization index
			const newIndex = await createInitialPolarizationIndex(statementId, userAnswers, userEvaluationValue, addEvaluator);

			polarizationRef.set(newIndex);
			logger.info(`Created new polarization index for statement ${statementId}`);
		} else {
			// Update existing polarization index
			const polarizationIndex = polarizationDB.data() as PolarizationMetrics;
			logger.info(`Updating existing polarization index for statement ${statementId}`);
			const newPolarizationIndex = updateExistingPolarizationIndex(polarizationIndex, userAnswers, userEvaluationValue, addEvaluator);

			if (newPolarizationIndex) {

				polarizationRef.update(newPolarizationIndex);
			}
		}

	} catch (error) {
		logger.error('Error updating polarization index:', error);
		// Don't throw - polarization is optional functionality
	}
}

async function getUserDemographicData(userId: string, parentId: string): Promise<UserQuestion[]> {
	const userDataRef = db.collection(Collections.usersData);
	const userDataSnapshot = await userDataRef
		.where('userId', '==', userId)
		.where('statementId', '==', parentId)
		.get();

	if (userDataSnapshot.empty) {
		return [];
	}

	return userDataSnapshot.docs
		.map(doc => doc.data() as UserQuestion)
		.filter(answer => answer.userQuestionId && answer.options && answer.options.length > 0);
}

async function createInitialPolarizationIndex(
	statementId: string,
	userAnswers: UserQuestion[],
	userEvaluationValue: number,
	addEvaluator: number
): Promise<PolarizationMetrics> {
	const axes: PolarizationAxis[] = userAnswers.map((userAnswer) => {
		const groups: PolarizationGroup[] = userAnswer.options!.map((option) => ({
			groupId: option,
			groupName: option,
			average: userEvaluationValue,
			color: getRandomColor(),
			mad: 0, // First user, no deviation
			numberOfMembers: addEvaluator
		}));

		return {
			groupingQuestionId: userAnswer.userQuestionId!,
			groupingQuestionText: userAnswer.question,
			axisAverageAgreement: userEvaluationValue,
			axisMAD: 0, // First user, no deviation
			groups
		};
	});

	const statementRef = db.collection(Collections.statements).doc(statementId);
	const statementDoc = await statementRef.get();
	if (!statementDoc.exists) {
		throw new Error(`Statement with ID ${statementId} does not exist`);
	}
	const statementData = statementDoc.data() as Statement;

	return {
		statementId,
		parentId: statementData.parentId,
		statement: statementData.statement,
		overallMAD: 0, // First user, no deviation
		totalEvaluators: addEvaluator,
		averageAgreement: userEvaluationValue,
		lastUpdated: new Date().getTime(),
		axes,
	};
}

function updateExistingPolarizationIndex(
	polarizationIndex: PolarizationMetrics,
	userAnswers: UserQuestion[],
	userEvaluationValue: number,
	addEvaluator: number
): PolarizationMetrics | undefined {
	try {

		// Update overall metrics
		const overallResult = calculateMADWithNewValue(
			polarizationIndex.overallMAD,
			polarizationIndex.averageAgreement,
			polarizationIndex.totalEvaluators,
			userEvaluationValue
		);

		polarizationIndex.overallMAD = overallResult.newMAD;
		polarizationIndex.totalEvaluators += addEvaluator;
		polarizationIndex.averageAgreement = overallResult.newMean;
		polarizationIndex.lastUpdated = new Date().getTime();

		// Update each axis
		polarizationIndex.axes.forEach((axis) => {
			const userAnswer = userAnswers.find(ua => ua.userQuestionId === axis.groupingQuestionId);

			if (userAnswer?.options) {
				updateAxisWithNewUser(axis, userAnswer, userEvaluationValue, addEvaluator);
			}
		});

		return polarizationIndex;

	} catch (error) {
		logger.error('Error updating existing polarization index:', error);

		return undefined; // Skip update if error occurs

	}
}

function updateAxisWithNewUser(
	axis: PolarizationAxis,
	userAnswer: UserQuestion,
	userEvaluationValue: number,
	addEvaluator: number
): void {
	// Calculate axis-level updates
	const oldAxisCount = axis.groups.reduce((sum, group) => sum + group.numberOfMembers, 0);
	const axisResult = calculateMADWithNewValue(
		axis.axisMAD,
		axis.axisAverageAgreement,
		oldAxisCount,
		userEvaluationValue
	);

	axis.axisAverageAgreement = axisResult.newMean;
	axis.axisMAD = axisResult.newMAD;

	// Update groups the user belongs to
	userAnswer.options!.forEach((groupId) => {
		const group = axis.groups.find(g => g.groupId === groupId);
		if (group) {
			const groupResult = calculateMADWithNewValue(
				group.mad,
				group.average,
				group.numberOfMembers,
				userEvaluationValue
			);

			group.average = groupResult.newMean;
			group.mad = groupResult.newMAD;
			group.numberOfMembers += addEvaluator;
		}
	});

	// Adjust other groups for axis mean change
	axis.groups.forEach((group) => {
		if (!userAnswer.options!.includes(group.groupId) && group.numberOfMembers > 0) {
			const meanDifference = Math.abs(group.average - axisResult.newMean);
			group.mad = Math.min(group.mad + meanDifference * 0.1, 1.0);
		}
	});
}

// ============================================================================
// MATH UTILITIES
// ============================================================================

function calculateMADWithNewValue(oldMAD: number, oldMean: number, oldCount: number, newValue: number): MADResult {
	if (oldCount === 0) {
		return { newMAD: 0, newMean: newValue };
	}

	const newCount = oldCount + 1;
	const newMean = (oldMean * oldCount + newValue) / newCount;

	if (newCount === 1) {
		return { newMAD: 0, newMean };
	}

	// Calculate new MAD incrementally
	const oldSumAbsDev = oldMAD * oldCount;
	const newValueAbsDev = Math.abs(newValue - newMean);
	const meanShift = newMean - oldMean;
	const adjustedOldSumAbsDev = oldSumAbsDev + Math.abs(meanShift) * oldCount * 0.5;
	const newMAD = (adjustedOldSumAbsDev + newValueAbsDev) / newCount;

	return { newMAD, newMean };
}

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
		await clearPreviousChosenOptions();

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

async function clearPreviousChosenOptions(): Promise<void> {
	const statementsRef = db.collection(Collections.statements);
	const previousChosenDocs = await statementsRef.where('isChosen', '==', true).get();

	const batch = db.batch();
	previousChosenDocs.forEach((doc) => {
		batch.update(statementsRef.doc(doc.id), { isChosen: false });
	});

	await batch.commit();
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
	};

	return fieldMap[resultsBy] || 'consensus';
}