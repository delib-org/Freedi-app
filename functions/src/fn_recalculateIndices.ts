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
import { refreshChainVoters } from './progress/chainVoters';
import { calculateConsensusValid } from './helpers/consensusValidCalculator';

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
	optionsUpdated: number;
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
 */
export const recalculateIndices = onCall<RecalculateIndicesRequest>(
	{ region: functionConfig.region },
	async (request): Promise<RecalculateIndicesResult> => {
		const { statementId } = request.data;

		if (!statementId) {
			throw new HttpsError('invalid-argument', 'statementId is required');
		}

		if (!request.auth) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		// Read the parent question statement to get evaluationSettings
		const parentRef = db.collection(Collections.statements).doc(statementId);
		const parentDoc = await parentRef.get();

		if (!parentDoc.exists) {
			throw new HttpsError('not-found', 'Statement not found');
		}

		const parentData = parentDoc.data();
		if (!parentData) {
			throw new HttpsError('not-found', 'Statement data is empty');
		}

		// Verify the caller is the creator or has admin access
		const userId = request.auth.uid;
		if (parentData.creatorId !== userId) {
			throw new HttpsError(
				'permission-denied',
				'Only the statement creator can recalculate indices',
			);
		}

		return recalculateIndicesForQuestion(statementId, parentData);
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
		// Bring the question's electorate up to date before reading it: this
		// callable exists precisely for the case where the inputs to N changed
		// after the votes came in, and the voter count is one of those inputs.
		await refreshChainVoters(statementId);

		const topParentId = (parentData.topParentId as string | undefined) ?? statementId;
		const topData =
			topParentId && topParentId !== statementId
				? (await db.collection(Collections.statements).doc(topParentId).get()).data()
				: parentData;

		// Same walk the evaluation trigger does, so a recalculation can never
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
				targetPopulation,
				samplingQuality,
				updates: [],
			};
		}

		const batch = db.batch();
		const updates: UpdatedOption[] = [];

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

			const updateData: Record<string, number | FieldValue> = {
				consensus: agreement,
				consensusValid: calculateConsensusValid(agreement, data.popperHebbianScore),
				'evaluation.agreement': agreement,
				'evaluation.agreementIndex': agreementIndex,
				'evaluation.likeMindedness': likeMindedness,
				// Kept in lockstep with the score it produced. Deleted rather
				// than left stale when no population resolves any more.
				'evaluation.stakeholderCount':
					stakeholderCount !== undefined ? stakeholderCount : FieldValue.delete(),
				lastUpdate: Date.now(),
			};
			if (confidenceIndex !== undefined) {
				updateData['evaluation.confidenceIndex'] = confidenceIndex;
			}

			batch.update(doc.ref, updateData);

			updates.push({
				statementId: doc.id,
				statementText: (data.statement || '').substring(0, 50),
				agreementIndex,
				confidenceIndex,
			});
		}

		await batch.commit();

		logger.info(`Recalculated indices for ${updates.length} options under ${statementId}`, {
			targetPopulation,
			samplingQuality,
			optionsUpdated: updates.length,
		});

		return {
			success: true,
			optionsUpdated: updates.length,
			targetPopulation,
			samplingQuality,
			updates,
		};
	}
}
