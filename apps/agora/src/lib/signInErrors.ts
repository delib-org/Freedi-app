/**
 * What to do about a Google sign-in that threw.
 *
 * Kept apart from user.ts — and free of every Firebase import — so the
 * decision can be read and tested without a browser, a popup or a network.
 * Each branch is a teacher who was left standing on the sign-in screen, so
 * the mapping is worth being able to check.
 */
export type SignInRecovery =
	/** The failure handed back the very identity we asked for — sign in with it */
	| 'recover-credential'
	/** The teacher closed the popup, or pressed the button twice. Nothing is wrong */
	| 'ignore'
	/** No window ever opened; only the teacher can lift that */
	| 'popup-blocked'
	/** Anything else */
	| 'failed';

export function classifySignInFailure(code: string | undefined): SignInRecovery {
	switch (code) {
		// The teacher's Google identity is already an account of its own, so it
		// cannot be grafted onto today's anonymous visit. This is the ORDINARY
		// case for a returning teacher, not an edge one.
		case 'auth/credential-already-in-use':
		case 'auth/email-already-in-use':
			return 'recover-credential';
		case 'auth/popup-closed-by-user':
		case 'auth/cancelled-popup-request':
			return 'ignore';
		case 'auth/popup-blocked':
			return 'popup-blocked';
		default:
			return 'failed';
	}
}
