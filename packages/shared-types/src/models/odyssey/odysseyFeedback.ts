import {
	object,
	string,
	boolean,
	number,
	optional,
	pipe,
	trim,
	minLength,
	maxLength,
	email,
	type InferOutput,
} from 'valibot';

/**
 * Wire contract and stored shape of "מכתב לבוני הספינה" — a player's letter to
 * the people who built the game.
 *
 * Declared once and imported by both the Odyssey client
 * (`apps/odyssey/src/lib/feedback.ts`) and the function
 * (`functions/src/odyssey/fn_odysseyFeedbackSubmit.ts`), so a drift between the
 * two sides is a compile error rather than a runtime surprise.
 *
 * Field names are the wire format. Do not rename them.
 */

/**
 * Both developers, hardcoded so the feature works with zero configuration.
 *
 * `ODYSSEY_FEEDBACK_RECIPIENTS` can override this, but the fallback is the path
 * that actually runs in production — the sibling `FEEDBACK_EMAIL` in
 * fn_feedback.ts has never once taken effect because nobody added it to
 * env/env-loader.js. The client also builds its mailto: escape hatch from this
 * same constant, so the two can never drift apart.
 */
export const ODYSSEY_FEEDBACK_DEFAULT_RECIPIENTS = [
	'tal.yaron@gmail.com',
	'uriel@tauex.tau.ac.il',
] as const;

export const ODYSSEY_FEEDBACK_MESSAGE_MIN = 5;
export const ODYSSEY_FEEDBACK_MESSAGE_MAX = 4000;
export const ODYSSEY_FEEDBACK_EMAIL_MAX = 254;
export const ODYSSEY_FEEDBACK_CONTEXT_FIELD_MAX = 300;
export const ODYSSEY_FEEDBACK_CONTEXT_SHORT_MAX = 64;

/** Letters one uid may send per rolling hour. */
export const ODYSSEY_FEEDBACK_PER_HOUR = 5;
/** Letters the whole game may send per rolling day — anonymous uids are free. */
export const ODYSSEY_FEEDBACK_GLOBAL_PER_DAY = 300;

/** The doc id that holds the global counter. Firebase uids are 28 alphanumeric
 *  characters, so a leading underscore can never collide with a real one. */
export const ODYSSEY_FEEDBACK_GLOBAL_KEY = '_global';

/**
 * The silent technical context. Every field here is client-supplied and must be
 * treated as hostile — hence the length caps, which keep a 2 MB "user agent" out
 * of Firestore and out of the developers' mail client.
 */
export const OdysseyFeedbackContextSchema = object({
	route: optional(pipe(string(), maxLength(ODYSSEY_FEEDBACK_CONTEXT_FIELD_MAX))),
	gameId: optional(pipe(string(), maxLength(ODYSSEY_FEEDBACK_CONTEXT_FIELD_MAX))),
	userAgent: optional(pipe(string(), maxLength(ODYSSEY_FEEDBACK_CONTEXT_FIELD_MAX))),
	viewport: optional(pipe(string(), maxLength(ODYSSEY_FEEDBACK_CONTEXT_SHORT_MAX))),
	appVersion: optional(pipe(string(), maxLength(ODYSSEY_FEEDBACK_CONTEXT_SHORT_MAX))),
	language: optional(pipe(string(), maxLength(ODYSSEY_FEEDBACK_CONTEXT_SHORT_MAX))),
});

/**
 * What the client sends.
 *
 * Deliberately has NO `uid` field: identity is read from the verified auth token
 * on the server and nowhere else, so the wire format cannot carry an identity
 * claim for an attacker to forge.
 */
export const OdysseyFeedbackRequestSchema = object({
	message: pipe(
		string(),
		trim(),
		minLength(ODYSSEY_FEEDBACK_MESSAGE_MIN),
		maxLength(ODYSSEY_FEEDBACK_MESSAGE_MAX),
	),
	email: optional(pipe(string(), trim(), email(), maxLength(ODYSSEY_FEEDBACK_EMAIL_MAX))),
	context: optional(OdysseyFeedbackContextSchema),
});

/**
 * The stored document. `uid`, `isAnonymous` and `createdAt` are server-derived —
 * never copied from the payload.
 */
export const OdysseyFeedbackSchema = object({
	feedbackId: string(),
	message: string(),
	email: optional(string()),
	uid: string(),
	isAnonymous: boolean(),
	displayName: optional(string()),
	context: OdysseyFeedbackContextSchema,
	createdAt: number(),
	emailed: boolean(),
	emailedAt: optional(number()),
});

export type OdysseyFeedbackContext = InferOutput<typeof OdysseyFeedbackContextSchema>;
export type OdysseyFeedbackRequest = InferOutput<typeof OdysseyFeedbackRequestSchema>;
export type OdysseyFeedback = InferOutput<typeof OdysseyFeedbackSchema>;

export interface OdysseyFeedbackResponse {
	feedbackId: string;
	/**
	 * `false` means stored but not emailed — no transporter configured, or the
	 * send failed. The player is still told it worked, because it did: the letter
	 * is safely on disk and an operator can find it by querying `emailed == false`.
	 */
	emailed: boolean;
}
