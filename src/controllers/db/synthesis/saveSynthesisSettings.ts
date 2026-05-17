import { httpsCallable } from 'firebase/functions';
import { functions } from '../config';
import { logError } from '@/utils/errorHandling';
import { logger } from '@/services/logger';
import type { SynthesisSettings } from './types';

interface SaveRequest {
	questionId: string;
	settings: Partial<SynthesisSettings>;
}

interface SaveResponse {
	saved: SynthesisSettings;
}

export async function saveSynthesisSettings(
	questionId: string,
	settings: Partial<SynthesisSettings>,
): Promise<SynthesisSettings> {
	try {
		const call = httpsCallable<SaveRequest, SaveResponse>(functions, 'saveSynthesisSettings');
		const result = await call({ questionId, settings });
		logger.info('Synthesis settings saved', { questionId });

		return result.data.saved;
	} catch (error) {
		logError(error, {
			operation: 'synthesis.saveSynthesisSettings',
			statementId: questionId,
		});
		throw error;
	}
}
