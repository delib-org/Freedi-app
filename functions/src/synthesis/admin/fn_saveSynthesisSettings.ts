import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections, functionConfig } from '@freedi/shared-types';
import { ALLOWED_ORIGINS } from '../../config/cors';
import {
	DEFAULT_SYNTHESIS_SETTINGS,
	type SynthesisSettings,
	validateSynthesisSettings,
} from '../pipeline/types';
import { assertSynthesisAdmin } from './assertSynthesisAdmin';

/**
 * Callable for the admin UI to persist `statementSettings.synthesis`.
 *
 * Validates on the server (the UI also validates client-side for UX, but
 * we trust nothing from the client). Stores the merged-with-defaults block
 * on the Statement doc so readers always see a complete object.
 */

interface SaveRequest {
	questionId: string;
	settings: Partial<SynthesisSettings>;
}

interface SaveResponse {
	saved: SynthesisSettings;
}

export const saveSynthesisSettings = onCall<SaveRequest>(
	{
		timeoutSeconds: 30,
		memory: '256MiB',
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS],
	},
	async (request): Promise<SaveResponse> => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'User must be authenticated');
		const { questionId, settings } = request.data;
		if (!questionId) throw new HttpsError('invalid-argument', 'questionId is required');
		if (!settings || typeof settings !== 'object') {
			throw new HttpsError('invalid-argument', 'settings must be an object');
		}

		await assertSynthesisAdmin(questionId, uid);

		const validation = validateSynthesisSettings(settings);
		if (!validation.valid) {
			throw new HttpsError('invalid-argument', `settings invalid: ${validation.errors.join('; ')}`);
		}

		// Merge supplied partial with defaults so the persisted block is always
		// complete (readers don't have to re-merge).
		const merged: SynthesisSettings = {
			enabled: settings.enabled ?? DEFAULT_SYNTHESIS_SETTINGS.enabled,
			minEvaluators: settings.minEvaluators ?? DEFAULT_SYNTHESIS_SETTINGS.minEvaluators,
			minConsensus: settings.minConsensus ?? DEFAULT_SYNTHESIS_SETTINGS.minConsensus,
			attachThreshold: settings.attachThreshold ?? DEFAULT_SYNTHESIS_SETTINGS.attachThreshold,
			synthLowerBound: settings.synthLowerBound ?? DEFAULT_SYNTHESIS_SETTINGS.synthLowerBound,
			clusterThreshold: settings.clusterThreshold ?? DEFAULT_SYNTHESIS_SETTINGS.clusterThreshold,
			reviewLowerBound: settings.reviewLowerBound ?? DEFAULT_SYNTHESIS_SETTINGS.reviewLowerBound,
			claimRegistryEnabled:
				settings.claimRegistryEnabled ?? DEFAULT_SYNTHESIS_SETTINGS.claimRegistryEnabled,
		};

		await getFirestore()
			.collection(Collections.statements)
			.doc(questionId)
			.set(
				{
					statementSettings: {
						synthesis: merged,
					},
					lastUpdate: Date.now(),
				},
				{ merge: true },
			);

		logger.info('saveSynthesisSettings', { questionId, uid, settings: merged });

		return { saved: merged };
	},
);
