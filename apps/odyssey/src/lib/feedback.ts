import {
	ODYSSEY_FEEDBACK_DEFAULT_RECIPIENTS,
	ODYSSEY_FEEDBACK_MESSAGE_MAX,
	ODYSSEY_FEEDBACK_MESSAGE_MIN,
	type OdysseyFeedbackContext,
	type OdysseyFeedbackResponse,
} from '@freedi/shared-types';
import { auth } from './firebase';
import { signInAnonymous } from './user';
import { submitOdysseyFeedback } from './callables';
import { currentGameId } from '../state/GameContext';

/**
 * The client half of "מכתב לבוני הספינה".
 *
 * Everything here is deliberately outside the React components: the components
 * have no test environment in this app (vitest runs without jsdom), so the parts
 * that can be wrong on their own live here, where they can be tested.
 */

/** The escape hatch shown in the panel. Same constant the server mails to, so
 *  the two can never drift. */
export const FEEDBACK_MAILTO = `mailto:${ODYSSEY_FEEDBACK_DEFAULT_RECIPIENTS.join(',')}`;

export { ODYSSEY_FEEDBACK_MESSAGE_MAX, ODYSSEY_FEEDBACK_MESSAGE_MIN };

/**
 * Good enough to catch a typo, deliberately not an RFC parser. The server
 * validates too; this exists so the player is told before the round trip.
 */
export function isPlausibleEmail(value: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

const MAX_USER_AGENT = 300;

/**
 * The technical details that ride along with a letter.
 *
 * Never throws. A feedback form that crashes while gathering diagnostics is
 * strictly worse than one that sends no diagnostics, so every failure here
 * degrades to an empty context and the letter still goes.
 */
export function buildFeedbackContext(): OdysseyFeedbackContext {
	try {
		const context: OdysseyFeedbackContext = {};

		if (typeof window !== 'undefined') {
			context.route = `${window.location.pathname}${window.location.search}`;
			context.viewport = `${window.innerWidth}x${window.innerHeight}`;
		}
		if (typeof navigator !== 'undefined') {
			context.userAgent = navigator.userAgent?.slice(0, MAX_USER_AGENT);
			context.language = navigator.language;
		}
		context.gameId = currentGameId();
		// Truthiness, not `??`: env-loader writes `VITE_APP_VERSION=` when
		// APP_VERSION is unset, so the var exists as an empty string and `??`
		// would let it through into the letter.
		context.appVersion = import.meta.env.VITE_APP_VERSION || 'unknown';

		return context;
	} catch {
		return {};
	}
}

export type FeedbackFailure = 'tooShort' | 'tooLong' | 'badEmail' | 'limited' | 'failed';

/**
 * Firebase error codes → the one Hebrew line the panel shows.
 *
 * Keyed on the CODE, never on the server's message text: the server sends a
 * field path, not prose, precisely so the wording lives here.
 */
export function toFeedbackFailure(error: unknown): FeedbackFailure {
	const code = (error as { code?: string } | null)?.code ?? '';

	if (code.includes('resource-exhausted')) return 'limited';
	if (code.includes('invalid-argument')) {
		const message = (error as { message?: string } | null)?.message ?? '';

		return message.includes('email') ? 'badEmail' : 'tooShort';
	}

	return 'failed';
}

export const FEEDBACK_FAILURE_TEXT: Record<FeedbackFailure, string> = {
	tooShort: 'ההודעה קצרה מדי — כתבו לנו עוד מעט.',
	tooLong: 'ההודעה ארוכה מדי — קצרו מעט ונסו שוב.',
	badEmail: 'הכתובת לא נראית תקינה. תקנו אותה, או מחקו אותה כדי לשלוח בלי מענה.',
	limited: 'כמה מכתבים בזה אחר זה — כולם הגיעו ונקרא את כולם. אפשר לכתוב שוב בעוד שעה.',
	failed: 'המכתב לא יצא — נסו שוב בעוד רגע. מה שכתבתם נשאר כאן.',
};

/**
 * Send the letter.
 *
 * Signs in anonymously first when nobody is signed in — the dock appears on the
 * intro and privacy screens, before anyone has boarded, and the callable
 * requires a caller. This is the same call the intro's "כניסה ללא חשבון" makes,
 * so it mints an ordinary anonymous voyage uid and nothing more.
 */
export async function submitFeedback(input: {
	message: string;
	email?: string;
}): Promise<OdysseyFeedbackResponse> {
	if (!auth.currentUser) await signInAnonymous();

	const email = input.email?.trim();

	return submitOdysseyFeedback({
		message: input.message.trim(),
		...(email ? { email } : {}),
		context: buildFeedbackContext(),
	});
}
