import { AGORA_ACCESS } from '@freedi/shared-types';
import type { AccessStatusRow, AgoraAccessRole } from '@freedi/shared-types';

/**
 * The pure half of the teacher access request: what the form may send, what a
 * refusal means, and which of four states the teacher is in. No network, no
 * DOM — lib/access.ts holds the calls and the cache.
 * IA spec: docs/ia/studio-teacher-approval.md.
 */

/** The `details.reason` the gated callables put on a `permission-denied` */
export const NOT_APPROVED_REASON = 'agora-not-approved';

/** Whether a callable refused because this teacher has not been approved */
export function isNotApprovedError(error: unknown): boolean {
	const failure = error as { code?: unknown; details?: unknown } | null;
	const code = failure?.code;
	if (typeof code !== 'string' || code.replace(/^functions\//, '') !== 'permission-denied') {
		return false;
	}
	const details = failure?.details as { reason?: unknown } | null | undefined;

	return details?.reason === NOT_APPROVED_REASON;
}

/** Where the person stands. `approved` wins over everything, admins count as approved. */
export type AccessState = 'approved' | 'pending' | 'declined' | 'none';

export function accessStateOf(
	approved: boolean,
	isAdmin: boolean,
	requests: readonly AccessStatusRow[],
): AccessState {
	if (approved || isAdmin) return 'approved';
	if (requests.some((row) => row.status === 'pending')) return 'pending';
	// Rows arrive newest first: a declined request is the answer only while
	// nothing newer replaced it. A withdrawn one is no answer at all.
	if (requests[0]?.status === 'declined') return 'declined';

	return 'none';
}

/** The request the panel talks about: the pending one, else the newest */
export function currentRequestOf(requests: readonly AccessStatusRow[]): AccessStatusRow | null {
	return requests.find((row) => row.status === 'pending') ?? requests[0] ?? null;
}

export interface AccessFormValue {
	role: AgoraAccessRole;
	fullName: string;
	/** From the sign-up link; absent when the teacher names the school */
	schoolId?: string;
	schoolNameText: string;
	city: string;
	note: string;
}

export type AccessFormErrorKey =
	| 'access.err_name'
	| 'access.err_school'
	| 'access.err_city'
	| 'access.err_too_long';

export type AccessFormField = 'fullName' | 'schoolNameText' | 'city' | 'note';

/**
 * What is wrong with the form, field by field. A teacher request with no
 * sign-up link needs the school's name and city (the server holds the same
 * line); a coordinator request may leave them blank.
 */
export function validateAccessForm(
	value: AccessFormValue,
): Partial<Record<AccessFormField, AccessFormErrorKey>> {
	const errors: Partial<Record<AccessFormField, AccessFormErrorKey>> = {};
	const fullName = value.fullName.trim();
	const school = value.schoolNameText.trim();
	const city = value.city.trim();

	if (fullName.length === 0) errors.fullName = 'access.err_name';
	else if (fullName.length > AGORA_ACCESS.MAX_NAME_LENGTH) errors.fullName = 'access.err_too_long';

	const needsSchool = value.role === 'teacher' && !value.schoolId;
	if (needsSchool && school.length === 0) errors.schoolNameText = 'access.err_school';
	else if (school.length > AGORA_ACCESS.MAX_SCHOOL_TEXT_LENGTH) {
		errors.schoolNameText = 'access.err_too_long';
	}
	if (needsSchool && city.length === 0) errors.city = 'access.err_city';
	else if (city.length > AGORA_ACCESS.MAX_CITY_LENGTH) errors.city = 'access.err_too_long';

	if (value.note.trim().length > AGORA_ACCESS.MAX_NOTE_LENGTH) errors.note = 'access.err_too_long';

	return errors;
}

/** The submit payload: only what applies, trimmed, nothing empty */
export function buildSubmitRequest(value: AccessFormValue): {
	action: 'submit';
	role: AgoraAccessRole;
	fullName: string;
	schoolId?: string;
	schoolNameText?: string;
	city?: string;
	note?: string;
} {
	const school = value.schoolNameText.trim();
	const city = value.city.trim();
	const note = value.note.trim();

	return {
		action: 'submit',
		role: value.role,
		fullName: value.fullName.trim(),
		...(value.schoolId
			? { schoolId: value.schoolId }
			: {
					...(school ? { schoolNameText: school } : {}),
					...(city ? { city } : {}),
				}),
		...(note ? { note } : {}),
	};
}

/** What the teacher reads when the server said no: one sentence per code, never the raw message */
export type SubmitOutcome =
	| { kind: 'message'; key: string }
	/** Approved already, or the same request is already pending: the status says it all */
	| { kind: 'status' };

export function submitOutcomeOf(error: unknown): SubmitOutcome {
	const code = (error as { code?: unknown } | null)?.code;
	const bare = typeof code === 'string' ? code.replace(/^functions\//, '') : '';

	switch (bare) {
		case 'not-found':
			return { kind: 'message', key: 'access.err_unknown_school' };
		case 'resource-exhausted':
			return { kind: 'message', key: 'access.err_limit' };
		case 'already-exists':
		case 'failed-precondition':
			return { kind: 'status' };
		default:
			return { kind: 'message', key: 'access.err_generic' };
	}
}
