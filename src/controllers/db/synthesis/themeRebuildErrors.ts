import type { ThemeRebuildFailureReason } from '@freedi/shared-types';

/**
 * Refusals the `rebuildThemes` callable can return that the admin can act on.
 * Anything else is reported as a generic failure.
 */
export type ThemeRebuildErrorKind = 'in-progress' | 'expired' | 'no-atoms';

const ALREADY_EXISTS_CODE = 'functions/already-exists';
const FAILED_PRECONDITION_CODE = 'functions/failed-precondition';

const PRECONDITION_REASONS: Record<ThemeRebuildFailureReason, ThemeRebuildErrorKind> = {
	'no-atoms': 'no-atoms',
	'proposal-expired': 'expired',
	'proposal-not-found': 'expired',
};

function isFailureReason(value: unknown): value is ThemeRebuildFailureReason {
	return (
		typeof value === 'string' && Object.prototype.hasOwnProperty.call(PRECONDITION_REASONS, value)
	);
}

function readReason(details: unknown): ThemeRebuildFailureReason | undefined {
	if (typeof details !== 'object' || details === null) return undefined;
	const { reason } = details as { reason?: unknown };

	return isFailureReason(reason) ? reason : undefined;
}

export function classifyThemeRebuildError(error: unknown): ThemeRebuildErrorKind | undefined {
	if (typeof error !== 'object' || error === null) return undefined;
	const { code, details } = error as { code?: unknown; details?: unknown };
	if (code === ALREADY_EXISTS_CODE) return 'in-progress';
	if (code !== FAILED_PRECONDITION_CODE) return undefined;
	const reason = readReason(details);

	return reason ? PRECONDITION_REASONS[reason] : undefined;
}
