import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import { db } from './index';
import {
	Collections,
	StatementType,
	functionConfig,
	calcAgreementIndex,
	calcConfidenceIndex,
	DEFAULT_SAMPLING_QUALITY,
} from '@freedi/shared-types';

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
			throw new HttpsError('permission-denied', 'Only the statement creator can recalculate indices');
		}

		const targetPopulation = parentData.evaluationSettings?.targetPopulation as number | undefined;
		const samplingQuality = (parentData.evaluationSettings?.samplingQuality as number) ?? DEFAULT_SAMPLING_QUALITY;

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

			// Recalculate Agreement Index
			const agreementIndex = calcAgreementIndex(
				sumEvaluations || 0,
				sumSquaredEvaluations || 0,
				numberOfEvaluators,
			);

			// Recalculate Confidence Index (only if targetPopulation is set)
			let confidenceIndex: number | undefined;
			if (targetPopulation && targetPopulation > 0) {
				confidenceIndex = calcConfidenceIndex(
					numberOfEvaluators,
					targetPopulation,
					samplingQuality,
				);
			}

			const updateData: Record<string, number> = {
				'evaluation.agreementIndex': agreementIndex,
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
	},
);
