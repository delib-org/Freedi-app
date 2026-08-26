/**
 * Helpers for errors thrown by `httpsCallable` (Firebase `FunctionsError`:
 * `code` is `functions/<status>`) — kept dependency-free so they are trivial
 * to unit test.
 */
export function getErrorCode(error: unknown): string | undefined {
	if (typeof error === 'object' && error !== null && 'code' in error) {
		const code = (error as { code: unknown }).code;

		return typeof code === 'string' ? code : undefined;
	}

	return undefined;
}

export function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;

	return '';
}

export type InviteErrorKind = 'expired' | 'wrongEmail' | 'generic';

/** Map an `acceptOrgInvite` failure to the message the user should see. */
export function classifyInviteError(error: unknown): InviteErrorKind {
	const code = getErrorCode(error) ?? '';
	const message = getErrorMessage(error).toLowerCase();

	if (
		code.endsWith('failed-precondition') ||
		code.endsWith('deadline-exceeded') ||
		message.includes('expired')
	) {
		return 'expired';
	}
	if (code.endsWith('permission-denied')) return 'wrongEmail';

	return 'generic';
}
