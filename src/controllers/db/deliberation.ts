import { httpsCallable } from 'firebase/functions';
import { DeliberationStatus, DELIBERATION_LIMITS } from '@freedi/shared-types';
import { functions } from './config';

export const DELIBERATION_POLL_MS = DELIBERATION_LIMITS.pollMs;
const GENERATION_TIMEOUT_MS = DELIBERATION_LIMITS.generationTimeoutMs;
export const requestDeliberation = httpsCallable<Record<string, unknown>, DeliberationStatus>(
	functions,
	'deliberation',
	{ timeout: GENERATION_TIMEOUT_MS },
);
export const createAgreementHandoff = httpsCallable<{ documentId: string }, { code: string }>(
	functions,
	'createAgreementHandoff',
);
