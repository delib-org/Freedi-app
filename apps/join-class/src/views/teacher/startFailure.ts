/**
 * Why "+ שיעור עם כיתה" failed, from the callable's error (docs/ia/join-class-lesson-plan.md 5):
 *  - 'not_approved': the class path needs an approved Agora teacher; the server answers
 *    permission-denied with `details.reason` naming the missing approval. The message offers
 *    "בלי כיתה", which stays available.
 *  - 'not_yours': any other permission-denied (a game or class that is not the caller's).
 *  - 'failed': everything else (the form keeps its id, so a retry reuses the lesson).
 */
export type StartFailure = 'failed' | 'not_yours' | 'not_approved';

interface CallableErrorLike {
	code?: unknown;
	details?: unknown;
}

function reasonOf(details: unknown): string {
	if (typeof details === 'object' && details !== null) {
		const reason = (details as { reason?: unknown }).reason;

		return typeof reason === 'string' ? reason : '';
	}

	return '';
}

export function startFailureOf(error: unknown): StartFailure {
	const { code, details } = (
		typeof error === 'object' && error !== null ? error : {}
	) as CallableErrorLike;
	if (code !== 'functions/permission-denied') return 'failed';

	return reasonOf(details).includes('not-approved') ? 'not_approved' : 'not_yours';
}
