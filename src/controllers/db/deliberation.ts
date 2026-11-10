import { httpsCallable } from 'firebase/functions';
import { DeliberationStatus, DELIBERATION_LIMITS } from '@freedi/shared-types';
import { functions } from './config';

export const DELIBERATION_POLL_MS = DELIBERATION_LIMITS.pollMs;
const PERMISSION_DENIED_CODE = 'functions/permission-denied';
/** Sent by questionFor in functions; its other denials (banned, waiting) are real errors. */
const NOT_YET_JOINED_MESSAGE = 'Join the question before participating.';

/** True while the auto-subscribe of a first-time visitor has not finished. */
export function isNotYetJoinedError(error: unknown): boolean {
	const { code, message } = (error ?? {}) as { code?: string; message?: string };

	// The SDK appends the HTTP status to the server's text: "... participating. [403]".
	return code === PERMISSION_DENIED_CODE && !!message?.startsWith(NOT_YET_JOINED_MESSAGE);
}
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
