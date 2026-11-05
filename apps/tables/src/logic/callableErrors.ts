/**
 * Map a callable failure to the i18n key of the message the user sees.
 * Firebase function errors carry `code` as `functions/<code>`.
 */

export type CallableErrorKind =
	| 'unauthenticated'
	| 'permissionDenied'
	| 'notFound'
	| 'failedPrecondition'
	| 'invalidArgument'
	| 'network'
	| 'unknown';

export function errorCode(error: unknown): string {
	if (typeof error === 'object' && error !== null && 'code' in error) {
		const code = (error as { code: unknown }).code;

		if (typeof code === 'string') return code.replace(/^functions\//, '');
	}

	return '';
}

export function classifyError(error: unknown): CallableErrorKind {
	switch (errorCode(error)) {
		case 'unauthenticated':
			return 'unauthenticated';
		case 'permission-denied':
			return 'permissionDenied';
		case 'not-found':
			return 'notFound';
		case 'failed-precondition':
		case 'aborted':
			return 'failedPrecondition';
		case 'invalid-argument':
		case 'out-of-range':
			return 'invalidArgument';
		case 'unavailable':
		case 'deadline-exceeded':
		case 'internal':
			return 'network';
		default:
			return 'unknown';
	}
}

/** The message key for a failed action; `failedPrecondition` has its own per-action key. */
export function errorMessageKey(error: unknown, preconditionKey: string): string {
	switch (classifyError(error)) {
		case 'unauthenticated':
		case 'permissionDenied':
			return 'tableAssignment.error.noPermission';
		case 'notFound':
			return 'tableAssignment.error.notFound';
		case 'failedPrecondition':
			return preconditionKey;
		case 'invalidArgument':
			return 'tableAssignment.error.invalid';
		case 'network':
			return 'tableAssignment.error.network';
		default:
			return 'tableAssignment.error.generic';
	}
}
