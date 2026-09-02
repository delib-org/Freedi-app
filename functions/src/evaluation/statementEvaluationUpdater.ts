/**
 * Statement evaluation update logic.
 *
 * Handles the core business logic of updating a statement's evaluation
 * data in a Firestore transaction, including atomic increments for
 * race-condition safety.
 */

import { logger } from 'firebase-functions/v1';
import { FieldValue, Timestamp, type Transaction } from 'firebase-admin/firestore';
import { number, parse } from 'valibot';
import {
	Collections,
	Statement,
	StatementSchema,
	StatementType,
	StatementEvaluation,
	calcConfidenceIndex,
	DEFAULT_SAMPLING_QUALITY,
	resolveStakeholderCount,
	resolveSamplingQuality,
	type StakeholderScope,
} from '@freedi/shared-types';
import { db } from '../index';
import { calculateConsensusValid } from '../helpers/consensusValidCalculator';
import {
	ActionTypes,
	buildProcessedEventKey,
	PROCESSED_EVALUATION_EVENTS_COLLECTION,
	PROCESSED_EVENT_TTL_MS,
	type UpdateStatementEvaluationProps,
	type UpdateStatementEvaluationResult,
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
): Promise<UpdateStatementEvaluationResult> {
	const { statementId, evaluationDiff, action, newEvaluation, oldEvaluation, eventId } = props;

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

		// Count every participant, including zero-value (neutral) evaluations
		let actualAddEvaluator = 0;
		if (action === ActionTypes.new) {
			actualAddEvaluator = 1;
		} else if (action === ActionTypes.delete) {
			actualAddEvaluator = -1;
		}

		// Update statement evaluation. The transaction skips the increment if this
		// event was already processed (durable, atomic idempotency).
		const { duplicate, repairParentId } = await updateStatementInTransaction(
			statementId,
			evaluationDiff,
			actualAddEvaluator,
			proConDiff,
			squaredEvaluationDiff,
			eventId ? buildProcessedEventKey(action, eventId) : undefined,
		);

		if (duplicate) {
			return { duplicate: true };
		}

		// The transaction has committed; only now may the siblings be repaired.
		if (repairParentId) {
			void ensureAverageEvaluationForAllOptions(repairParentId, statementId);
		}

		// Return updated statement
		const statementRef = db.collection(Collections.statements).doc(statementId);
		const updatedStatement = await statementRef.get();

		return { statement: updatedStatement.data() as Statement, duplicate: false };
	} catch (error) {
		logger.error('Error in updateStatementEvaluation:', error);

		return { duplicate: false };
	}
}

// ============================================================================
// STATEMENT UPDATE HELPERS
// ============================================================================

/**
 * Ensures all options under a parent have the averageEvaluation field set.
 * Used to fix legacy data that may be missing this field.
 *
 * Runs AFTER the transaction that noticed the gap has committed, never from
 * inside it, and every write is conditioned on the document not having moved
 * since it was read here. It used to be scheduled with `setImmediate` from
 * within the transaction callback — which fires before the commit — and read
 * the freshly rated option without its block, then wrote a zero block over
 * the increment the commit had just applied: the first rating on every new
 * option was lost whenever a sibling was rated in the same second. The
 * option the caller just updated is skipped outright; its block is the one
 * the transaction wrote.
 */
async function ensureAverageEvaluationForAllOptions(
	parentId: string,
	justUpdatedStatementId?: string,
): Promise<void> {
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

		const writes: Array<Promise<unknown>> = [];

		optionsSnapshot.docs.forEach((doc) => {
			if (doc.id === justUpdatedStatementId) return;
			const data = doc.data();

			// Check if evaluation exists and has averageEvaluation
			if (!data.evaluation || data.evaluation.averageEvaluation === undefined) {
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

				// Conditioned on the read: a rating that lands between this read and
				// this write makes the write fail instead of being overwritten.
				writes.push(
					doc.ref
						.update({ evaluation, lastUpdate: Date.now() }, { lastUpdateTime: doc.updateTime })
						.catch(() => undefined),
				);
			}
		});

		if (writes.length > 0) {
			await Promise.all(writes);
			logger.info(`Fixed averageEvaluation for ${writes.length} options under parent ${parentId}`);
		}
	} catch (error) {
		logger.error('Error fixing averageEvaluation for options:', error);
	}
}

interface StakeholderAncestors {
	parent?: StakeholderScope;
	top?: StakeholderScope;
}

/**
 * Fetch the parent question and top-level group, which are where a stakeholder
 * count is actually declared — an option never carries one of its own.
 *
 * Both reads are skipped when the id is missing or points back at the statement
 * itself, and the top read is skipped when it is the same document as the
 * parent: a question sitting directly under its group is the common shape and
 * does not deserve two reads of one doc. So the usual cost of inheritance is a
 * single extra read per evaluation, and zero when the statement is top-level.
 */
async function readStakeholderAncestors(
	transaction: Transaction,
	statementId: string,
	parentId?: string,
	topParentId?: string,
): Promise<StakeholderAncestors> {
	const scopeFor = async (id?: string): Promise<StakeholderScope | undefined> => {
		if (!id || id === statementId) return undefined;
		const snapshot = await transaction.get(db.collection(Collections.statements).doc(id));

		return snapshot.exists ? (snapshot.data() as StakeholderScope) : undefined;
	};

	const parent = await scopeFor(parentId);
	const top = topParentId && topParentId !== parentId ? await scopeFor(topParentId) : parent;

	return { parent, top };
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
	processedEventKey?: string,
): Promise<{ duplicate: boolean; repairParentId?: string }> {
	return db.runTransaction(async (transaction) => {
		let repairParentId: string | undefined;
		const statementRef = db.collection(Collections.statements).doc(statementId);

		// Idempotency guard: read the processed-event marker BEFORE any write
		// (Firestore requires all reads to precede writes in a transaction).
		const markerRef = processedEventKey
			? db.collection(PROCESSED_EVALUATION_EVENTS_COLLECTION).doc(processedEventKey)
			: null;
		if (markerRef) {
			const markerDoc = await transaction.get(markerRef);
			if (markerDoc.exists) {
				logger.info('Skipping duplicate evaluation event (durable guard)', {
					statementId,
					processedEventKey,
				});

				return { duplicate: true };
			}
		}

		const statementDoc = await transaction.get(statementRef);
		const statementData = statementDoc.data();

		if (!statementData) {
			throw new Error('Statement not found');
		}

		// Clusters are managed exclusively by the condensation aggregator
		// (`onEvaluationChangeRecomputeCondensationClusters` -> `recomputeClusterEvaluation`).
		// That trigger recomputes the cluster's full aggregated evaluation from
		// all member evaluations (with per-user dedup) on every evaluation write.
		// If this updater also writes to the cluster via FieldValue.increment +
		// absolute consensus, the two writes race and leave the cluster doc in
		// an inconsistent state (e.g. numberOfEvaluators from aggregator but
		// consensus from increment-based partial calc). Skip clusters here;
		// the aggregator is the single source of truth.
		if (statementData.isCluster === true) {
			logger.info('statementEvaluationUpdater skipping cluster (aggregator handles it)', {
				statementId,
			});

			// Not a duplicate — the aggregator still needs to run, so the caller
			// must continue with its remaining (idempotent) side-effects.
			return { duplicate: false };
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

			// The fix runs after the transaction has COMMITTED (see the caller) —
			// scheduling it from in here ran it against the pre-commit state.
			repairParentId = statementData.parentId;

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

		// Read the ancestors that may declare the stakeholder count. This must
		// happen HERE: Firestore requires every read in a transaction to
		// precede every write, so it cannot be done lazily at the point of use
		// further down.
		const ancestors = await readStakeholderAncestors(
			transaction,
			statementId,
			statementData.parentId,
			statementData.topParentId,
		);

		const statement = parse(StatementSchema, statementData) as StatementWithPopper;

		// The stakeholder count is declared on the group or the question and
		// inherited downward — never on the option being voted on. This used to
		// read `statementData.evaluationSettings?.targetPopulation`, i.e. off
		// the option itself, while the settings UI only ever offered the field
		// on questions. The two never met, so the confidence index was in
		// practice only ever written by the manual recalculation callable.
		const { count: stakeholderCount } = resolveStakeholderCount(
			statementData as StakeholderScope,
			ancestors.parent,
			ancestors.top,
		);
		const samplingQuality =
			resolveSamplingQuality(statementData as StakeholderScope, ancestors.parent, ancestors.top) ??
			DEFAULT_SAMPLING_QUALITY;

		const { agreement, evaluation } = calculateEvaluation(
			statement,
			proConDiff,
			evaluationDiff,
			addEvaluator,
			squaredEvaluationDiff,
			stakeholderCount,
		);

		let confidenceIndex: number | undefined;
		if (stakeholderCount !== undefined) {
			confidenceIndex = calcConfidenceIndex(
				evaluation.numberOfEvaluators,
				stakeholderCount,
				samplingQuality,
			);
		}

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
			'evaluation.agreementIndex': evaluation.agreementIndex,
			...(confidenceIndex !== undefined && {
				'evaluation.confidenceIndex': confidenceIndex,
			}),
			// Travels with the score it produced, so every surface can publish
			// "50 of 500" without walking the tree. Explicitly DELETED when no
			// population resolves: a stale count left behind after an admin
			// clears the setting would keep claiming a coverage the current
			// score was never computed against.
			'evaluation.stakeholderCount':
				stakeholderCount !== undefined ? stakeholderCount : FieldValue.delete(),
			'evaluation.evaluationRandomNumber': evaluation.evaluationRandomNumber,
			'evaluation.viewed': evaluation.viewed,
			proSum: FieldValue.increment(proConDiff.proDiff),
			conSum: FieldValue.increment(proConDiff.conDiff),
			// Delta listeners (lastUpdate > watermark) must see evaluation changes.
			// Safe: fn_statement_updates strips lastUpdate before change detection.
			lastUpdate: Date.now(),
		});

		// Record the processed-event marker atomically with the increment so a
		// re-delivery of this same event is detected and skipped above.
		// `expireAt` is a Firestore Timestamp (not millis) because native TTL
		// policies require a Timestamp field; enable a TTL policy on the
		// `processedEvaluationEvents` collection's `expireAt` field to auto-purge.
		if (markerRef) {
			transaction.set(markerRef, {
				statementId,
				processedAt: Date.now(),
				expireAt: Timestamp.fromMillis(Date.now() + PROCESSED_EVENT_TTL_MS),
			});
		}

		return { duplicate: false, repairParentId };
	});
}
