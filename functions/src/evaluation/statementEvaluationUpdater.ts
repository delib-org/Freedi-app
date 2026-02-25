/**
 * Statement evaluation update logic.
 *
 * Handles the core business logic of updating a statement's evaluation
 * data in a Firestore transaction, including atomic increments for
 * race-condition safety.
 */

import { logger } from 'firebase-functions/v1';
import { FieldValue } from 'firebase-admin/firestore';
import { number, parse } from 'valibot';
import {
	Collections,
	Statement,
	StatementSchema,
	StatementType,
	StatementEvaluation,
} from '@freedi/shared-types';
import { db } from '../index';
import { calculateConsensusValid } from '../helpers/consensusValidCalculator';
import {
	ActionTypes,
	type UpdateStatementEvaluationProps,
	type StatementWithPopper,
} from './evaluationTypes';
import { calcDiffEvaluation, calcSquaredDiff, calculateEvaluation } from './agreementCalculation';

// ============================================================================
// CORE BUSINESS LOGIC
// ============================================================================

/**
 * Updates a statement's evaluation data based on an evaluation change.
 *
 * Calculates pro/con differences, squared evaluation diffs, and evaluator
 * count changes, then delegates to a Firestore transaction for atomic update.
 *
 * @param props - Evaluation update parameters
 * @returns The updated statement, or undefined on error
 */
export async function updateStatementEvaluation(
	props: UpdateStatementEvaluationProps,
): Promise<Statement | undefined> {
	const { statementId, evaluationDiff, action, newEvaluation, oldEvaluation } = props;

	try {
		if (!statementId) {
			throw new Error('statementId is required');
		}

		parse(number(), evaluationDiff);

		// Calculate pro/con differences
		const proConDiff = calcDiffEvaluation({ newEvaluation, oldEvaluation, action });

		// Calculate squared evaluation difference for standard deviation tracking
		// This is the difference in x^2 values: new^2 - old^2
		const squaredEvaluationDiff = calcSquaredDiff(newEvaluation, oldEvaluation);

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
		await updateStatementInTransaction(
			statementId,
			evaluationDiff,
			actualAddEvaluator,
			proConDiff,
			squaredEvaluationDiff,
		);

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

/**
 * Ensures all options under a parent have the averageEvaluation field set.
 * Used to fix legacy data that may be missing this field.
 */
async function ensureAverageEvaluationForAllOptions(parentId: string): Promise<void> {
	try {
		// Get all options under this parent
		const optionsSnapshot = await db
			.collection(Collections.statements)
			.where('parentId', '==', parentId)
			.where('statementType', '==', StatementType.option)
			.get();

		if (optionsSnapshot.empty) {
			return;
		}

		const batch = db.batch();
		let needsUpdate = false;

		optionsSnapshot.docs.forEach((doc) => {
			const data = doc.data();

			// Check if evaluation exists and has averageEvaluation
			if (!data.evaluation || data.evaluation.averageEvaluation === undefined) {
				needsUpdate = true;

				// Calculate the average if we have the data
				const evaluation: StatementEvaluation = data.evaluation || {
					sumEvaluations: 0,
					numberOfEvaluators: 0,
					agreement: 0,
					sumPro: 0,
					sumCon: 0,
					numberOfProEvaluators: 0,
					numberOfConEvaluators: 0,
					sumSquaredEvaluations: 0,
					averageEvaluation: 0,
					evaluationRandomNumber: Math.random(),
					viewed: 0,
				};

				// Ensure averageEvaluation is calculated
				evaluation.averageEvaluation =
					evaluation.numberOfEvaluators > 0
						? evaluation.sumEvaluations / evaluation.numberOfEvaluators
						: 0;

				batch.update(doc.ref, {
					evaluation,
					lastUpdate: Date.now(),
				});
			}
		});

		if (needsUpdate) {
			await batch.commit();
			logger.info(
				`Fixed averageEvaluation for ${optionsSnapshot.size} options under parent ${parentId}`,
			);
		}
	} catch (error) {
		logger.error('Error fixing averageEvaluation for options:', error);
	}
}

/**
 * Performs an atomic Firestore transaction to update a statement's evaluation fields.
 *
 * Uses FieldValue.increment for counting fields to prevent race conditions
 * when Firebase triggers fire multiple times for the same event.
 */
async function updateStatementInTransaction(
	statementId: string,
	evaluationDiff: number,
	addEvaluator: number,
	proConDiff: {
		proDiff: number;
		conDiff: number;
		proEvaluatorsDiff: number;
		conEvaluatorsDiff: number;
	},
	squaredEvaluationDiff: number,
): Promise<void> {
	await db.runTransaction(async (transaction) => {
		const statementRef = db.collection(Collections.statements).doc(statementId);
		const statementDoc = await transaction.get(statementRef);
		const statementData = statementDoc.data();

		if (!statementData) {
			throw new Error('Statement not found');
		}

		// Check if this statement is missing averageEvaluation
		if (
			statementData.statementType === StatementType.option &&
			(!statementData.evaluation || statementData.evaluation.averageEvaluation === undefined)
		) {
			// Log that we detected a missing field
			logger.info(
				`Detected missing averageEvaluation for option ${statementId}, will fix all siblings under parent ${statementData.parentId}`,
			);

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
					numberOfProEvaluators: 0,
					numberOfConEvaluators: 0,
					sumSquaredEvaluations: 0,
					averageEvaluation: 0,
					evaluationRandomNumber: Math.random(),
					viewed: 0,
				} as StatementEvaluation;
			} else {
				// Calculate based on existing data
				statementData.evaluation.averageEvaluation =
					statementData.evaluation.numberOfEvaluators > 0
						? statementData.evaluation.sumEvaluations / statementData.evaluation.numberOfEvaluators
						: 0;
			}
		}

		// Ensure topParentId exists for legacy data that may not have it
		if (!statementData.topParentId) {
			statementData.topParentId = statementData.parentId || statementId;
		}

		const statement = parse(StatementSchema, statementData) as StatementWithPopper;

		const { agreement, evaluation } = calculateEvaluation(
			statement,
			proConDiff,
			evaluationDiff,
			addEvaluator,
			squaredEvaluationDiff,
		);

		// Calculate consensusValid by combining consensus with corroborationLevel
		const consensusValid = calculateConsensusValid(
			agreement,
			statement.popperHebbianScore ?? undefined,
		);

		// Use atomic increments for ALL counting fields to prevent race conditions
		// when Firebase triggers fire multiple times for the same event
		transaction.update(statementRef, {
			totalEvaluators: FieldValue.increment(addEvaluator),
			consensus: agreement,
			consensusValid,
			// Use dot notation with FieldValue.increment for atomic updates
			'evaluation.sumEvaluations': FieldValue.increment(evaluationDiff),
			'evaluation.numberOfEvaluators': FieldValue.increment(addEvaluator),
			'evaluation.sumPro': FieldValue.increment(proConDiff.proDiff),
			'evaluation.sumCon': FieldValue.increment(proConDiff.conDiff),
			'evaluation.numberOfProEvaluators': FieldValue.increment(proConDiff.proEvaluatorsDiff),
			'evaluation.numberOfConEvaluators': FieldValue.increment(proConDiff.conEvaluatorsDiff),
			'evaluation.sumSquaredEvaluations': FieldValue.increment(squaredEvaluationDiff),
			// Derived values (calculated from sums) - these are fine to overwrite
			'evaluation.averageEvaluation': evaluation.averageEvaluation,
			'evaluation.agreement': agreement,
			'evaluation.evaluationRandomNumber': evaluation.evaluationRandomNumber,
			'evaluation.viewed': evaluation.viewed,
			proSum: FieldValue.increment(proConDiff.proDiff),
			conSum: FieldValue.increment(proConDiff.conDiff),
		});
	});
}
