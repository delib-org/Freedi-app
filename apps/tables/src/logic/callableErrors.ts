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

/** The server's machine-readable cause (HttpsError details.reason), if any. */
export function errorReason(error: unknown): string {
	if (typeof error === 'object' && error !== null && 'details' in error) {
		const details = (error as { details: unknown }).details;

		if (typeof details === 'object' && details !== null && 'reason' in details) {
			const reason = (details as { reason: unknown }).reason;

			if (typeof reason === 'string') return reason;
		}
	}

	return '';
}

const REASON_KEYS: Readonly<Record<string, string>> = {
	'table-full': 'tableAssignment.error.tableFull',
	'stale-run': 'tableAssignment.error.publishStale',
	'registration-closed': 'tableAssignment.error.registrationClosed',
	'claimed-by-name': 'tableAssignment.cancel.claimed',
	'seated-in-published-run': 'tableAssignment.remove.seated',
	'registration-full': 'tableAssignment.error.registrationFull',
	'name-locked': 'tableAssignment.error.nameLocked',
	'too-few-registrants': 'tableAssignment.error.tooFewRegistrants',
	'preview-limit': 'tableAssignment.error.previewLimit',
};

/** On the name screen, a registration continued by name cannot be renamed (not "cancelled"). */
export const NAME_SCREEN_REASON_KEYS: Readonly<Record<string, string>> = {
	'claimed-by-name': 'tableAssignment.error.nameClaimed',
};

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
export function errorMessageKey(
	error: unknown,
	preconditionKey: string,
	overrides: Readonly<Record<string, string>> = {},
): string {
	switch (classifyError(error)) {
		case 'unauthenticated':
		case 'permissionDenied':
			return 'tableAssignment.error.noPermission';
		case 'notFound':
			return 'tableAssignment.error.notFound';
		case 'failedPrecondition': {
			const reason = errorReason(error);

			return overrides[reason] ?? REASON_KEYS[reason] ?? preconditionKey;
		}
		case 'invalidArgument':
			return 'tableAssignment.error.invalid';
		case 'network':
			return 'tableAssignment.error.network';
		default:
			return 'tableAssignment.error.generic';
	}
}
