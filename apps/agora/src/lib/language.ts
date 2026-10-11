import type { CheckLanguageRequest, CheckLanguageResponse } from '@freedi/shared-types';
import { functions, httpsCallable } from './firebase';
import { emit } from './events';
import { t } from './i18n';

/**
 * The language gate, client side.
 *
 * Every student text — the note, a question-stage answer, a thread message,
 * an improvement idea — is shown to `agoraCheckLanguage` BEFORE the Firestore
 * write, and the write happens only on a clean verdict. A refusal has already
 * been charged and filed by the server (strike on the participant doc, the
 * words on the private teacher thread); here it becomes a typed rejection the
 * views recognise, so the draft stays in the box and the screen says why
 * instead of "saving failed".
 *
 * The gate fails OPEN: if the callable itself cannot be reached (offline,
 * cold start timed out, function missing in an emulator), the text goes
 * through as before. A moderation outage must never lock a class out of
 * writing — and the teacher's take-down remains behind it.
 */
export class LanguageFlaggedError extends Error {
	readonly strikes: number;
	readonly deducted: number;
	readonly pointsTotal: number;

	constructor(verdict: { strikes: number; deducted: number; pointsTotal: number }) {
		super('language-flagged');
		this.name = 'LanguageFlaggedError';
		this.strikes = verdict.strikes;
		this.deducted = verdict.deducted;
		this.pointsTotal = verdict.pointsTotal;
	}
}

export function isLanguageFlagged(error: unknown): error is LanguageFlaggedError {
	return error instanceof LanguageFlaggedError;
}

/** The sentence the box shows under a refused draft, in the student's language */
export function flaggedNotice(error: LanguageFlaggedError): string {
	return error.deducted > 0
		? t('language.flagged', { n: String(error.deducted) })
		: t('language.flagged_no_coins');
}

export type LanguageCheck = (request: CheckLanguageRequest) => Promise<CheckLanguageResponse>;

async function callCheck(request: CheckLanguageRequest): Promise<CheckLanguageResponse> {
	const call = httpsCallable<CheckLanguageRequest, CheckLanguageResponse>(
		functions,
		'agoraCheckLanguage',
	);
	const result = await call(request);

	return result.data;
}

/**
 * Resolve when the text may be written; throw `LanguageFlaggedError` when it
 * may not. `check` is injectable so the flow is tested without a network.
 */
export async function assertCleanLanguage(
	request: CheckLanguageRequest,
	check: LanguageCheck = callCheck,
): Promise<void> {
	if (!request.text.trim()) return;

	let verdict: CheckLanguageResponse;
	try {
		verdict = await check(request);
	} catch (error) {
		console.error('[Language] Check unavailable — letting the text through:', error);

		return;
	}
	if (verdict.ok) return;

	emit('language:flagged', {
		sessionId: request.sessionId,
		strikes: verdict.strikes,
		deducted: verdict.deducted,
	});
	throw new LanguageFlaggedError(verdict);
}
