import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import { DocumentData, FieldValue } from 'firebase-admin/firestore';
import { db } from './db';
import {
	Collections,
	StatementType,
	functionConfig,
	calcAgreement,
	calcAgreementIndex,
	calcLikeMindedness,
	calcConfidenceIndex,
	resolveStakeholderCount,
	resolveSamplingQuality,
	DEFAULT_SAMPLING_QUALITY,
	type StakeholderScope,
} from '@freedi/shared-types';
import { commitInBatches, type BatchedWrite } from './classroom/batchedWrites';
import { assertStatementAdmin } from './progress/assertStatementAdmin';
import { refreshChainVoters } from './progress/chainVoters';
import { calculateConsensusValid } from './helpers/consensusValidCalculator';
import { logError } from './utils/errorHandling';

/**
 * Batches commit one after another, so a question of several thousand options
 * can outlast the 60-second default. Same ceiling as the other per-question
 * bulk callables (fn_fullExport, fn_reconcileEvaluatorCount).
 */
const RECALCULATE_TIMEOUT_SECONDS = 300;

/**
 * Every score field the recalculation owns on an option, by Firestore path.
 * `undefined` means the field must not exist: it is deleted, never left stale.
 */
type OptionScores = Record<string, number | undefined>;

function readField(data: DocumentData, path: string): unknown {
	return path
		.split('.')
		.reduce<unknown>((value, key) => (value as DocumentData | undefined)?.[key], data);
}

function isSameScore(stored: unknown, next: number | undefined): boolean {
	return stored === next || (Number.isNaN(stored) && Number.isNaN(next));
}

/** True when writing `scores` would change nothing, a field due for deletion included. */
function areScoresCurrent(data: DocumentData, scores: OptionScores): boolean {
	return Object.entries(scores).every(([path, next]) => isSameScore(readField(data, path), next));
}

function toOptionUpdate(scores: OptionScores, now: number): Record<string, number | FieldValue> {
	const update: Record<string, number | FieldValue> = { lastUpdate: now };
	for (const [path, next] of Object.entries(scores)) {
		update[path] = next !== undefined ? next : FieldValue.delete();
	}

	return update;
}

interface RecalculateIndicesRequest {
	statementId: string; // Parent question statement ID
}

interface UpdatedOption {
	statementId: string;
	statementText: string;
	agreementIndex: number;
	confidenceIndex: number | undefined;
}

interface RecalculateIndicesResult {
	success: boolean;
	/** Options written by this call. */
	optionsUpdated: number;
	/** Options already holding these exact scores, so left untouched. */
	optionsUnchanged: number;
	targetPopulation: number | undefined;
	samplingQuality: number;
	updates: UpdatedOption[];
}

/**
 * Recalculates agreementIndex and confidenceIndex for all options under a question.
 *
 * Use this when an admin changes targetPopulation or samplingQuality after
 * evaluations have already been submitted — existing options won't have the
 * updated confidenceIndex until the next evaluation triggers a recalculation.
 * This function forces an immediate recalculation for all options.
 *
 * Options whose scores would not change are not written, so pressing again costs
 * reads but no writes and fires no triggers. Writes go out in several batches:
 * each option is written whole, but a failure part way leaves the question with
 * some options on the new scores. Calling again repairs that, because the options
 * already done are skipped and only the rest are written.
 *
 * Who may call it is decided by assertStatementAdmin, the same check the other
 * question-admin callables use: the question's creator, an admin of the question
 * or of its top statement, or an owner/admin of the organization that holds it.
 * It does not know about MC survey co-admins, who are recorded in `surveyAdmins`
 * and hold no statement subscription.
 */
export const recalculateIndices = onCall<RecalculateIndicesRequest>(
	{ region: functionConfig.region, timeoutSeconds: RECALCULATE_TIMEOUT_SECONDS },
	async (request): Promise<RecalculateIndicesResult> => {
		if (!request.auth) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const { statementId } = request.data;

		if (!statementId || typeof statementId !== 'string') {
			throw new HttpsError('invalid-argument', 'statementId is required');
		}

		const { statement } = await assertStatementAdmin(
			request.auth.uid,
			statementId,
			'recalculateIndices',
		);

		try {
			return await recalculateIndicesForQuestion(statementId, statement);
		} catch (error) {
			logError(error, {
				operation: 'recalculateIndices',
				userId: request.auth.uid,
				statementId,
			});
			throw new HttpsError('internal', 'Could not finish recalculating. It is safe to try again.');
		}
	},
);

/**
 * The recalculation itself, with no auth or transport concerns, so migrations
 * and one-off repair scripts run exactly what the button runs rather than a
 * copy of it that drifts.
 */
export async function recalculateIndicesForQuestion(
	statementId: string,
	parentData: DocumentData,
): Promise<RecalculateIndicesResult> {
	{
		// Keep the question's participation stat (distinct voters along the
		// chain) fresh while we are here. It does NOT feed N: N is only ever
		// the number an admin declared (resolveStakeholderCount below).
		await refreshChainVoters(statementId);

		const topParentId = (parentData.topParentId as string | undefined) ?? statementId;
		const topData =
			topParentId && topParentId !== statementId
				? (await db.collection(Collections.statements).doc(topParentId).get()).data()
				: parentData;

		// Same walk the evaluation trigger does (declared N only, else none), so a recalculation can never
		// disagree with the number a fresh vote would have produced.
		const parentScope = { ...parentData, evaluation: { ...parentData.evaluation } };
		const { count: targetPopulation } = resolveStakeholderCount(
			undefined,
			parentScope as StakeholderScope,
			(topData ?? parentData) as StakeholderScope,
		);
		const samplingQuality =
			resolveSamplingQuality(
				undefined,
				parentScope as StakeholderScope,
				(topData ?? parentData) as StakeholderScope,
			) ?? DEFAULT_SAMPLING_QUALITY;

		// Get all option statements under this parent
		const optionsSnapshot = await db
			.collection(Collections.statements)
			.where('parentId', '==', statementId)
			.where('statementType', '==', StatementType.option)
			.get();

		if (optionsSnapshot.empty) {
			return {
				success: true,
				optionsUpdated: 0,
				optionsUnchanged: 0,
				targetPopulation,
				samplingQuality,
				updates: [],
			};
		}

		const now = Date.now();
		const writes: BatchedWrite[] = [];
		const updates: UpdatedOption[] = [];
		let optionsUnchanged = 0;

		for (const doc of optionsSnapshot.docs) {
			const data = doc.data();
			const evaluation = data.evaluation;

			if (!evaluation) continue;

			const { sumEvaluations, sumSquaredEvaluations, numberOfEvaluators } = evaluation;

			if (numberOfEvaluators === undefined || numberOfEvaluators <= 0) continue;

			// Every option in the question shares its electorate, floored by the
			// people who evaluated this particular option — see the same guard
			// in statementEvaluationUpdater.
			const stakeholderCount =
				targetPopulation !== undefined ? Math.max(targetPopulation, numberOfEvaluators) : undefined;

			// N is an input to the score, not a label on it: the
			// finite-population correction shrinks the confidence penalty as
			// more of the stakeholders weigh in. Recording a new N beside a
			// consensus computed against the old one would be exactly the
			// mismatch `evaluation.stakeholderCount` exists to rule out, so the
			// score is recomputed here rather than left for the next vote.
			const agreement = calcAgreement(
				sumEvaluations || 0,
				sumSquaredEvaluations || 0,
				numberOfEvaluators,
				stakeholderCount,
			);

			// Recalculate Agreement Index (confidence-adjusted)
			const agreementIndex = calcAgreementIndex(
				sumEvaluations || 0,
				sumSquaredEvaluations || 0,
				numberOfEvaluators,
				stakeholderCount,
			);

			// Like-mindedness takes no population, deliberately: it measures how
			// divided the group is, which must not move with how many we heard.
			const likeMindedness = calcLikeMindedness(
				sumEvaluations || 0,
				sumSquaredEvaluations || 0,
				numberOfEvaluators,
			);

			// Recalculate Confidence Index (only if a population resolved)
			let confidenceIndex: number | undefined;
			if (stakeholderCount !== undefined) {
				confidenceIndex = calcConfidenceIndex(
					numberOfEvaluators,
					stakeholderCount,
					samplingQuality,
				);
			}

			const scores: OptionScores = {
				consensus: agreement,
				consensusValid: calculateConsensusValid(agreement, data.popperHebbianScore),
				'evaluation.agreement': agreement,
				'evaluation.agreementIndex': agreementIndex,
				'evaluation.likeMindedness': likeMindedness,
				// These two are kept in lockstep with the score they produced, and
				// are deleted rather than left stale when no population resolves.
				'evaluation.stakeholderCount': stakeholderCount,
				'evaluation.confidenceIndex': confidenceIndex,
			};

			if (areScoresCurrent(data, scores)) {
				optionsUnchanged++;
				continue;
			}

			writes.push({ kind: 'update', ref: doc.ref, data: toOptionUpdate(scores, now) });

			updates.push({
				statementId: doc.id,
				statementText: (data.statement || '').substring(0, 50),
				agreementIndex,
				confidenceIndex,
			});
		}

		await commitInBatches(db, writes);

		logger.info(`Recalculated indices for ${updates.length} options under ${statementId}`, {
			targetPopulation,
			samplingQuality,
			optionsUpdated: updates.length,
			optionsUnchanged,
		});

		return {
			success: true,
			optionsUpdated: updates.length,
			optionsUnchanged,
			targetPopulation,
			samplingQuality,
			updates,
		};
	}
}
