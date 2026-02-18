import { Change, logger } from 'firebase-functions/v1';
import { db } from './index';
import { DocumentSnapshot, FieldValue, getFirestore } from 'firebase-admin/firestore';
import type { FirestoreEvent } from 'firebase-functions/v2/firestore';
import {
	Evaluation,
	Statement,
	StatementSchema,
	StatementEvaluation,
	Collections,
	StatementType,
	statementToSimpleStatement,
	ResultsSettings,
	ResultsBy,
	CutoffBy,
	defaultResultsSettings,
} from '@freedi/shared-types';
import type { PopperHebbianScore } from '@freedi/shared-types';

// Extend Statement type to include popperHebbianScore (it exists but TypeScript doesn't see it during compilation)
type StatementWithPopper = Statement & { popperHebbianScore?: PopperHebbianScore };

import { number, parse } from 'valibot';
import { updateUserDemographicEvaluation } from './fn_polarizationIndex';
import { calculateConsensusValid } from './helpers/consensusValidCalculator';
import { logError } from './utils/errorHandling';

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
	proEvaluatorsDiff: number; // change in count of pro evaluators
	conEvaluatorsDiff: number; // change in count of con evaluators
}

// ============================================================================
// IDEMPOTENCY TRACKING
// ============================================================================

// In-memory cache to track recently processed events (helps with immediate retries)
// This is per-instance, so it's not perfect but catches most duplicates
const processedEvents = new Map<string, number>();
const EVENT_CACHE_TTL_MS = 60000; // 1 minute

function isEventAlreadyProcessed(eventId: string): boolean {
	const processedAt = processedEvents.get(eventId);
	if (processedAt) {
		// Check if it's still within TTL
		if (Date.now() - processedAt < EVENT_CACHE_TTL_MS) {
			return true;
		}
		// Clean up expired entry
		processedEvents.delete(eventId);
	}

	return false;
}

function markEventAsProcessed(eventId: string): void {
	processedEvents.set(eventId, Date.now());

	// Periodic cleanup of old entries (every 100 entries)
	if (processedEvents.size > 100) {
		const now = Date.now();
		for (const [key, timestamp] of processedEvents.entries()) {
			if (now - timestamp > EVENT_CACHE_TTL_MS) {
				processedEvents.delete(key);
			}
		}
	}
}

// ============================================================================
// MAIN EVENT HANDLERS
// ============================================================================

export async function newEvaluation(event: FirestoreEvent<DocumentSnapshot>): Promise<void> {
	try {
		const eventId = event.id;

		// Check for duplicate event processing
		if (isEventAlreadyProcessed(eventId)) {
			logger.info(`Skipping duplicate event ${eventId} for evaluation ${event.data.id}`);

			return;
		}
		markEventAsProcessed(eventId);

		const evaluation = event.data.data() as Evaluation & { migratedAt?: number; source?: string };
		const { statementId, parentId } = evaluation;
		const userId = evaluation.evaluator?.uid;

		// Skip processing for migrated evaluations - the migration function handles the statement update
		if (evaluation.migratedAt) {
			logger.info(`Skipping trigger for migrated evaluation ${event.data.id}`);

			return;
		}

		// Skip processing for Sign app evaluations - the Sign API route handles consensus updates directly
		if (evaluation.source === 'sign') {
			logger.info(`Skipping trigger for Sign app evaluation ${event.data.id}`);

			return;
		}

		if (!statementId) {
			throw new Error('statementId is required');
		}

		if (!userId) {
			// Log detailed info to help debug missing evaluator data
			logger.error('Missing userId in evaluation', {
				evaluationId: event.data.id,
				statementId,
				parentId,
				hasEvaluator: !!evaluation.evaluator,
				evaluatorKeys: evaluation.evaluator ? Object.keys(evaluation.evaluator) : [],
			});
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
			parentId,
		});

		if (!statement) {
			throw new Error('Failed to update statement');
		}

		await updateParentStatementWithChosenOptions(statement.parentId);

		//update demographic evaluation (it will check if demographic question exists later on)
		const userEvalData = {
			userId,
			evaluation: evaluation.evaluation || 0,
		};
		updateUserDemographicEvaluation(statement, userEvalData);
	} catch (error) {
		logger.error('Error in newEvaluation:', error);
	}
}

export async function deleteEvaluation(event: FirestoreEvent<DocumentSnapshot>): Promise<void> {
	try {
		const eventId = event.id;

		// Check for duplicate event processing
		if (isEventAlreadyProcessed(eventId)) {
			logger.info(`Skipping duplicate delete event ${eventId}`);

			return;
		}
		markEventAsProcessed(eventId);

		const evaluation = event.data.data() as Evaluation & { source?: string };
		const { statementId, evaluation: evaluationValue } = evaluation;
		const userId = evaluation.evaluator?.uid;

		// Skip processing for Sign app evaluations - the Sign API route handles consensus updates directly
		if (evaluation.source === 'sign') {
			logger.info(`Skipping delete trigger for Sign app evaluation ${event.data.id}`);

			return;
		}

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

export async function updateEvaluation(
	event: FirestoreEvent<Change<DocumentSnapshot>>,
): Promise<void> {
	try {
		const eventId = event.id;

		// Check for duplicate event processing
		if (isEventAlreadyProcessed(eventId)) {
			logger.info(`Skipping duplicate update event ${eventId}`);

			return;
		}
		markEventAsProcessed(eventId);

		const before = event.data.before.data() as Evaluation;
		const after = event.data.after.data() as Evaluation & { source?: string };

		// Skip processing for Sign app evaluations - the Sign API route handles consensus updates directly
		if (after.source === 'sign') {
			logger.info(`Skipping update trigger for Sign app evaluation ${event.data.after.id}`);

			return;
		}

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
		};
		updateUserDemographicEvaluation(statement, userEvalData);
	} catch (error) {
		logger.error('Error in updateEvaluation:', error);
	}
}

// ============================================================================
// CORE BUSINESS LOGIC
// ============================================================================

async function updateStatementEvaluation(
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
		// This is the difference in x² values: new² - old²
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

async function updateStatementInTransaction(
	statementId: string,
	evaluationDiff: number,
	addEvaluator: number,
	proConDiff: CalcDiff,
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

/**
 * Calculates the squared difference for sum of squares tracking
 * This is used to efficiently track Σxi² for standard deviation calculation
 */
function calcSquaredDiff(newEvaluation: number, oldEvaluation: number): number {
	return newEvaluation * newEvaluation - oldEvaluation * oldEvaluation;
}

function calculateEvaluation(
	statement: Statement,
	proConDiff: CalcDiff,
	evaluationDiff: number,
	addEvaluator: number,
	squaredEvaluationDiff: number,
) {
	const evaluation: StatementEvaluation = statement.evaluation || {
		agreement: statement.consensus || 0,
		sumEvaluations: 0,
		numberOfEvaluators: statement.totalEvaluators || 0,
		sumPro: 0,
		sumCon: 0,
		numberOfProEvaluators: 0,
		numberOfConEvaluators: 0,
		averageEvaluation: 0,
		sumSquaredEvaluations: 0,
		evaluationRandomNumber: Math.random(),
		viewed: 0,
	};

	if (statement.evaluation) {
		evaluation.sumEvaluations += evaluationDiff;
		evaluation.numberOfEvaluators += addEvaluator;
		evaluation.sumPro = (evaluation.sumPro || 0) + proConDiff.proDiff;
		evaluation.sumCon = (evaluation.sumCon || 0) + proConDiff.conDiff;
		// Track pro/con evaluator counts
		evaluation.numberOfProEvaluators =
			(evaluation.numberOfProEvaluators || 0) + proConDiff.proEvaluatorsDiff;
		evaluation.numberOfConEvaluators =
			(evaluation.numberOfConEvaluators || 0) + proConDiff.conEvaluatorsDiff;
		// Track sum of squared evaluations for standard deviation calculation
		evaluation.sumSquaredEvaluations =
			(evaluation.sumSquaredEvaluations || 0) + squaredEvaluationDiff;
		// Ensure averageEvaluation exists even for old data
		evaluation.averageEvaluation = evaluation.averageEvaluation ?? 0;
	} else {
		// For new evaluations, apply the diffs and evaluator count
		evaluation.sumEvaluations = evaluationDiff;
		evaluation.numberOfEvaluators = addEvaluator;
		evaluation.sumPro = proConDiff.proDiff;
		evaluation.sumCon = proConDiff.conDiff;
		evaluation.numberOfProEvaluators = proConDiff.proEvaluatorsDiff;
		evaluation.numberOfConEvaluators = proConDiff.conEvaluatorsDiff;
		evaluation.sumSquaredEvaluations = squaredEvaluationDiff;
	}

	// Ensure sumSquaredEvaluations is never negative (guard against data inconsistencies)
	evaluation.sumSquaredEvaluations = Math.max(0, evaluation.sumSquaredEvaluations || 0);
	// Ensure pro/con evaluator counts are never negative
	evaluation.numberOfProEvaluators = Math.max(0, evaluation.numberOfProEvaluators || 0);
	evaluation.numberOfConEvaluators = Math.max(0, evaluation.numberOfConEvaluators || 0);

	// Calculate average evaluation
	evaluation.averageEvaluation =
		evaluation.numberOfEvaluators > 0
			? evaluation.sumEvaluations / evaluation.numberOfEvaluators
			: 0;

	// Calculate consensus using new Mean - SEM formula
	const agreement = calcAgreement(
		evaluation.sumEvaluations,
		evaluation.sumSquaredEvaluations || 0,
		evaluation.numberOfEvaluators,
	);
	evaluation.agreement = agreement;

	return { agreement, evaluation };
}

// ============================================================================
// AGREEMENT CALCULATION LOGIC
// ============================================================================

/**
 * ============================================================================
 * ALGORITHM: Mean − SEM (with Uncertainty Floor)
 * ============================================================================
 *
 * Title: Confidence-Adjusted Score with Minimum Variance Assumption
 * Status: Implemented
 *
 * ----------------------------------------------------------------------------
 * 1. THE PROBLEM (Why this is needed)
 * ----------------------------------------------------------------------------
 * The standard Mean − SEM formula suffers from a "Zero Variance Loophole."
 * If a very small group (e.g., n=2 or n=3) has perfect agreement (all ratings
 * are identical), the sample standard deviation (s) becomes 0. Consequently,
 * the Standard Error of the Mean (SEM) becomes 0, resulting in a perfect
 * score (Score = Mean).
 *
 * This creates a logic error where a tiny group with 3 votes of 1.0 (Score = 1.0)
 * mathematically defeats a large group of 100 people with a mean of 0.99
 * (Score < 0.99 due to natural variance). A sample size of 3 is insufficient
 * to statistically prove "zero variance" in a larger population.
 *
 * ----------------------------------------------------------------------------
 * 2. THE SOLUTION: The Uncertainty Floor
 * ----------------------------------------------------------------------------
 * To correct this, we introduce a Minimum Standard Deviation (s_min).
 * We assume that no controversial topic has zero variance in the general
 * population. If a small sample shows perfect agreement, we treat it as an
 * artifact of the small sample size and impose a "floor" on the variance
 * calculation.
 *
 * This ensures that uncertainty (SEM) can only approach zero as n increases,
 * not just because the sample happens to be uniform.
 *
 * ----------------------------------------------------------------------------
 * 3. THE FORMULA
 * ----------------------------------------------------------------------------
 *
 *   Score = Mean - (s_adj / √n)
 *
 * Where:
 *   - n       = Number of evaluators
 *   - s       = Observed Sample Standard Deviation
 *   - s_min   = The Uncertainty Floor constant (0.5)
 *   - s_adj   = Adjusted Standard Deviation = max(s, s_min)
 *
 * ----------------------------------------------------------------------------
 * 4. LOGICAL FLOW (Pseudocode)
 * ----------------------------------------------------------------------------
 *
 *   CONSTANTS:
 *     FLOOR_STD_DEV = 0.5  // Represents a "moderate disagreement" baseline
 *
 *   INPUTS:
 *     ratings = [list of scores from -1 to 1]
 *
 *   CALCULATION:
 *     n = length(ratings)
 *     mean = average(ratings)
 *     std_dev = standard_deviation(ratings)
 *
 *     // Apply the Uncertainty Floor
 *     // If the sample is too uniform (or n is too small to show variance),
 *     // we force the math to assume at least moderate disagreement exists.
 *     effective_std_dev = MAX(std_dev, FLOOR_STD_DEV)
 *
 *     // Calculate SEM using the effective standard deviation
 *     sem = effective_std_dev / SQRT(n)
 *
 *     // Final Score
 *     final_score = mean - sem
 *
 * ----------------------------------------------------------------------------
 * 5. COMPARISON OF BEHAVIOR
 * ----------------------------------------------------------------------------
 *
 * Scenario A (The Flaw): 3 people vote 1.0
 *   - Old Formula: s=0 → SEM=0 → Score = 1.0
 *   - New Formula: s_adj=0.5 → SEM = 0.5/√3 ≈ 0.29 → Score = 0.71
 *
 * Scenario B (The Goal): 100 people vote 0.95 (with normal variance)
 *   - Old Formula: Score ≈ 0.94
 *   - New Formula: Score ≈ 0.94 (The floor usually doesn't trigger for
 *                  large, noisy groups)
 *
 * Result: The large group (0.94) now correctly defeats the small group (0.71).
 *
 * ============================================================================
 */

/**
 * The Uncertainty Floor constant.
 *
 * This represents a "moderate disagreement" baseline assumption.
 * When sample variance is lower than this floor, we assume it's due to
 * insufficient sample size rather than true population consensus.
 *
 * Value of 0.5 chosen because:
 * - On a scale of -1 to 1, 0.5 represents moderate disagreement
 * - It provides meaningful penalty for small unanimous samples
 * - Large samples with genuine consensus will exceed this floor naturally
 */
const FLOOR_STD_DEV = 0.5;

/**
 * Calculates the standard error of the mean (SEM) for evaluation data
 * with an Uncertainty Floor to prevent the Zero Variance Loophole.
 *
 * The Uncertainty Floor ensures that small samples with artificially low
 * variance cannot achieve unrealistically high scores. This is critical
 * because a sample of 3 unanimous votes should not mathematically defeat
 * a large sample of 100 evaluators with natural variance.
 *
 * @param sumEvaluations - Sum of all evaluation values
 * @param sumSquaredEvaluations - Sum of squared evaluation values (Σxi²)
 * @param numberOfEvaluators - Number of evaluators
 * @returns Standard Error of the Mean (SEM = s_adj / √n) where s_adj = max(s, FLOOR_STD_DEV)
 */
function calcStandardError(
	sumEvaluations: number,
	sumSquaredEvaluations: number,
	numberOfEvaluators: number,
): number {
	if (numberOfEvaluators <= 1) return FLOOR_STD_DEV; // Return floor for n=1 to ensure penalty

	// Calculate mean (μ)
	const mean = sumEvaluations / numberOfEvaluators;

	// Calculate variance using: Var = (Σxi² / n) - μ²
	const variance = sumSquaredEvaluations / numberOfEvaluators - mean * mean;

	// Ensure variance is non-negative (floating point errors can cause small negative values)
	const safeVariance = Math.max(0, variance);

	// Calculate observed standard deviation: s = √Var
	const observedStdDev = Math.sqrt(safeVariance);

	// Apply the Uncertainty Floor: s_adj = max(s, s_min)
	// This prevents the Zero Variance Loophole where small unanimous
	// samples achieve unrealistically perfect scores
	const adjustedStdDev = Math.max(observedStdDev, FLOOR_STD_DEV);

	// Calculate SEM: SEM = s_adj / √n
	const sem = adjustedStdDev / Math.sqrt(numberOfEvaluators);

	return sem;
}

/**
 * Calculates consensus score using Mean - SEM approach with Uncertainty Floor.
 *
 * This replaces the old heuristic formula (√n × Mean) with a statistically
 * grounded approach that accounts for both the level of support and the
 * confidence in that measurement.
 *
 * Formula: Score = Mean - (s_adj / √n)
 *
 * Where:
 * - Mean   = average evaluation score
 * - n      = number of evaluators
 * - s      = observed sample standard deviation
 * - s_min  = Uncertainty Floor constant (0.5)
 * - s_adj  = max(s, s_min) - prevents Zero Variance Loophole
 *
 * The Uncertainty Floor prevents small unanimous groups from achieving
 * artificially perfect scores. A sample of 3 votes of 1.0 now scores ~0.71
 * instead of 1.0, correctly losing to a larger sample of 100 voters at 0.94.
 *
 * @see calcStandardError for the SEM calculation with Uncertainty Floor
 * @param sumEvaluations - Sum of all evaluation values
 * @param sumSquaredEvaluations - Sum of squared evaluation values (Σxi²)
 * @param numberOfEvaluators - Number of evaluators
 * @returns Consensus score (confidence-adjusted agreement with uncertainty floor)
 */
function calcAgreement(
	sumEvaluations: number,
	sumSquaredEvaluations: number,
	numberOfEvaluators: number,
): number {
	try {
		parse(number(), sumEvaluations);
		parse(number(), sumSquaredEvaluations);
		parse(number(), numberOfEvaluators);

		// Handle edge case: no evaluators
		if (numberOfEvaluators === 0) return 0;

		// Calculate mean evaluation
		const mean = sumEvaluations / numberOfEvaluators;

		// Calculate Standard Error of the Mean (SEM)
		const sem = calcStandardError(sumEvaluations, sumSquaredEvaluations, numberOfEvaluators);

		// Return confidence-adjusted score using proportional penalty
		// The penalty is bounded by the available range to -1, ensuring
		// the result naturally stays within [-1, 1]
		const availableRange = mean + 1; // Distance from mean to -1
		const penalty = Math.min(sem, availableRange);
		const agreement = mean - penalty;

		return agreement;
	} catch (error) {
		logger.error('Error calculating agreement:', error);

		return 0;
	}
}

function calcDiffEvaluation({
	action,
	newEvaluation,
	oldEvaluation,
}: {
	action: ActionTypes;
	newEvaluation: number;
	oldEvaluation: number;
}): CalcDiff {
	try {
		const positiveDiff = Math.max(newEvaluation, 0) - Math.max(oldEvaluation, 0);
		const negativeDiff = Math.min(newEvaluation, 0) - Math.min(oldEvaluation, 0);

		// Calculate evaluator count changes
		const wasPositive = oldEvaluation > 0;
		const wasNegative = oldEvaluation < 0;
		const isPositive = newEvaluation > 0;
		const isNegative = newEvaluation < 0;

		switch (action) {
			case ActionTypes.new:
				return {
					proDiff: Math.max(newEvaluation, 0),
					conDiff: Math.max(-newEvaluation, 0),
					proEvaluatorsDiff: isPositive ? 1 : 0,
					conEvaluatorsDiff: isNegative ? 1 : 0,
				};
			case ActionTypes.delete:
				return {
					proDiff: Math.min(-oldEvaluation, 0),
					conDiff: Math.max(oldEvaluation, 0),
					proEvaluatorsDiff: wasPositive ? -1 : 0,
					conEvaluatorsDiff: wasNegative ? -1 : 0,
				};
			case ActionTypes.update: {
				// Calculate evaluator count changes for updates
				let proEvaluatorsDiff = 0;
				let conEvaluatorsDiff = 0;

				// Handle transitions between positive/negative/zero
				if (wasPositive && !isPositive) proEvaluatorsDiff -= 1;
				if (!wasPositive && isPositive) proEvaluatorsDiff += 1;
				if (wasNegative && !isNegative) conEvaluatorsDiff -= 1;
				if (!wasNegative && isNegative) conEvaluatorsDiff += 1;

				return {
					proDiff: positiveDiff,
					conDiff: -negativeDiff,
					proEvaluatorsDiff,
					conEvaluatorsDiff,
				};
			}
			default:
				throw new Error('Invalid action type');
		}
	} catch (error) {
		logger.error('Error calculating evaluation diff:', error);

		return { proDiff: 0, conDiff: 0, proEvaluatorsDiff: 0, conEvaluatorsDiff: 0 };
	}
}

// ============================================================================
// PARENT STATEMENT UPDATE LOGIC
// ============================================================================

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

function getSnapshotFromEvent(
	event: FirestoreEvent<Change<DocumentSnapshot> | DocumentSnapshot | undefined>,
): DocumentSnapshot | undefined {
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

async function updateParentTotalEvaluators(parentId: string): Promise<void> {
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

// ============================================================================
// EVALUATION MIGRATION FOR INTEGRATION FEATURE
// ============================================================================

// Note: FLOOR_STD_DEV is already defined earlier in this file

interface MigrationResult {
	migratedCount: number;
	newEvaluationMetrics: {
		sumEvaluations: number;
		numberOfEvaluators: number;
		sumPro: number;
		sumCon: number;
		numberOfProEvaluators: number;
		numberOfConEvaluators: number;
		sumSquaredEvaluations: number;
		averageEvaluation: number;
		agreement: number;
	};
}

/**
 * Migrate evaluations from multiple source statements to a new target statement.
 * When a user has evaluated multiple source statements, use their highest absolute value.
 * This ensures users don't get "double counted" while preserving their strongest opinion.
 *
 * @param sourceStatementIds - IDs of statements being integrated
 * @param targetStatementId - ID of the new integrated statement
 * @param parentId - Parent statement ID
 * @returns Migration result with count and new metrics
 */
export async function migrateEvaluationsToNewStatement(
	sourceStatementIds: string[],
	targetStatementId: string,
	parentId: string,
): Promise<MigrationResult> {
	const result: MigrationResult = {
		migratedCount: 0,
		newEvaluationMetrics: {
			sumEvaluations: 0,
			numberOfEvaluators: 0,
			sumPro: 0,
			sumCon: 0,
			numberOfProEvaluators: 0,
			numberOfConEvaluators: 0,
			sumSquaredEvaluations: 0,
			averageEvaluation: 0,
			agreement: 0,
		},
	};

	if (sourceStatementIds.length === 0) {
		return result;
	}

	try {
		// 1. Fetch all evaluations from source statements
		// Track all evaluations per user so we can average them
		const evaluationsByUser = new Map<
			string,
			{ evaluations: number[]; evaluator: Evaluation['evaluator'] }
		>();

		for (const sourceId of sourceStatementIds) {
			const evaluationsSnapshot = await db
				.collection(Collections.evaluations)
				.where('statementId', '==', sourceId)
				.get();

			evaluationsSnapshot.forEach((doc) => {
				const evaluation = doc.data() as Evaluation;
				const userId = evaluation.evaluator?.uid;

				if (!userId || evaluation.evaluation === 0) return;

				const existing = evaluationsByUser.get(userId);

				if (existing) {
					// User already evaluated another source statement - add to their evaluations array
					existing.evaluations.push(evaluation.evaluation);
				} else {
					// First evaluation from this user
					evaluationsByUser.set(userId, {
						evaluations: [evaluation.evaluation],
						evaluator: evaluation.evaluator,
					});
				}
			});
		}

		logger.info(
			`Found ${evaluationsByUser.size} unique evaluators across ${sourceStatementIds.length} statements`,
		);

		// 2. Create new evaluations for the target statement
		const batch = db.batch();
		const now = Date.now();

		// Track metrics
		let sumEvaluations = 0;
		let sumSquaredEvaluations = 0;
		let sumPro = 0;
		let sumCon = 0;
		let numberOfProEvaluators = 0;
		let numberOfConEvaluators = 0;
		let numberOfEvaluators = 0;

		for (const [userId, data] of evaluationsByUser) {
			// Calculate average of user's evaluations across source statements
			const avgEvaluation =
				data.evaluations.reduce((sum, val) => sum + val, 0) / data.evaluations.length;

			const newEvaluationId = `${userId}--${targetStatementId}`;
			const evaluationRef = db.collection(Collections.evaluations).doc(newEvaluationId);

			const newEvaluation: Evaluation & { migratedAt?: number } = {
				evaluationId: newEvaluationId,
				statementId: targetStatementId,
				parentId: parentId,
				evaluatorId: userId,
				evaluator: data.evaluator,
				evaluation: avgEvaluation,
				updatedAt: now,
				migratedAt: now, // Flag to indicate this was created by migration - triggers should skip
			};

			batch.set(evaluationRef, newEvaluation);

			// Update metrics using the averaged evaluation
			sumEvaluations += avgEvaluation;
			sumSquaredEvaluations += avgEvaluation * avgEvaluation;
			if (avgEvaluation > 0) {
				sumPro += avgEvaluation;
				numberOfProEvaluators++;
			} else if (avgEvaluation < 0) {
				sumCon += Math.abs(avgEvaluation);
				numberOfConEvaluators++;
			}
			numberOfEvaluators++;
			result.migratedCount++;

			// Log if user had multiple evaluations that were averaged
			if (data.evaluations.length > 1) {
				logger.info(
					`User ${userId} had ${data.evaluations.length} evaluations [${data.evaluations.join(', ')}], averaged to ${avgEvaluation.toFixed(3)}`,
				);
			}
		}

		// 3. Commit the batch
		await batch.commit();
		logger.info(
			`Created ${result.migratedCount} new evaluations for target statement ${targetStatementId}`,
		);

		// 4. Calculate agreement (consensus) using Mean - SEM with floor
		const averageEvaluation = numberOfEvaluators > 0 ? sumEvaluations / numberOfEvaluators : 0;
		const agreement = calcMigrationAgreement(
			sumEvaluations,
			sumSquaredEvaluations,
			numberOfEvaluators,
		);

		result.newEvaluationMetrics = {
			sumEvaluations,
			numberOfEvaluators,
			sumPro,
			sumCon,
			numberOfProEvaluators,
			numberOfConEvaluators,
			sumSquaredEvaluations,
			averageEvaluation,
			agreement,
		};

		// 5. Update the target statement with the new metrics
		const targetRef = db.collection(Collections.statements).doc(targetStatementId);
		await targetRef.update({
			'evaluation.sumEvaluations': sumEvaluations,
			'evaluation.numberOfEvaluators': numberOfEvaluators,
			'evaluation.sumPro': sumPro,
			'evaluation.sumCon': sumCon,
			'evaluation.numberOfProEvaluators': numberOfProEvaluators,
			'evaluation.numberOfConEvaluators': numberOfConEvaluators,
			'evaluation.sumSquaredEvaluations': sumSquaredEvaluations,
			'evaluation.averageEvaluation': averageEvaluation,
			'evaluation.agreement': agreement,
			consensus: agreement,
			totalEvaluators: numberOfEvaluators,
			lastUpdate: now,
		});

		logger.info(
			`Updated target statement ${targetStatementId} with consensus: ${agreement.toFixed(3)}, evaluators: ${numberOfEvaluators}`,
		);

		// Update parent's total evaluator count to reflect the changes
		await updateParentTotalEvaluators(parentId);

		return result;
	} catch (error) {
		logger.error('Error migrating evaluations:', error);
		throw error;
	}
}

/**
 * Calculate consensus score for migration using Mean - SEM with uncertainty floor
 */
function calcMigrationAgreement(
	sumEvaluations: number,
	sumSquaredEvaluations: number,
	numberOfEvaluators: number,
): number {
	if (numberOfEvaluators === 0) return 0;

	const mean = sumEvaluations / numberOfEvaluators;
	const sem = calcMigrationStandardError(sumEvaluations, sumSquaredEvaluations, numberOfEvaluators);

	// Proportional penalty bounded by available range to -1
	const availableRange = mean + 1;
	const penalty = Math.min(sem, availableRange);
	const agreement = mean - penalty;

	return agreement;
}

/**
 * Calculate Standard Error of the Mean with uncertainty floor for migration
 */
function calcMigrationStandardError(
	sumEvaluations: number,
	sumSquaredEvaluations: number,
	numberOfEvaluators: number,
): number {
	if (numberOfEvaluators <= 1) return FLOOR_STD_DEV;

	const mean = sumEvaluations / numberOfEvaluators;
	const variance = sumSquaredEvaluations / numberOfEvaluators - mean * mean;
	const safeVariance = Math.max(0, variance);
	const observedStdDev = Math.sqrt(safeVariance);
	const adjustedStdDev = Math.max(observedStdDev, FLOOR_STD_DEV);

	return adjustedStdDev / Math.sqrt(numberOfEvaluators);
}
