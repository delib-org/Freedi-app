import { classRegistrationOf, isRegistrationConnectable } from '@freedi/shared-types';
import type {
	ClassRegistrationErrorReason,
	ClassTable,
	LessonSettingsHolder,
	LessonStepKey,
	TableAssignment,
	TableAssignmentStatus,
} from '@freedi/shared-types';

/**
 * Pure rules of the Tables-Class bridge on the Class screens (IA
 * tables-class-bridge): which registrations the teacher may connect, what the
 * Tables step offers in a connected lesson, who has no table. No Firebase here.
 */

/** Where the host manages a registration (Tables stays the one place for that). */
export const TABLES_HOST_URL = 'https://tables.wizcol.com/host';

/** Link to the new-registration screen of Tables. */
export const TABLES_NEW_REGISTRATION_URL = `${TABLES_HOST_URL}/new`;

/** Link to one registration in Tables. */
export function tablesRegistrationUrl(tableAssignmentId: string): string {
	return `${TABLES_HOST_URL}/sessions/${encodeURIComponent(tableAssignmentId)}`;
}

/** Does this lesson use a registration? */
export function isConnectedLesson(main: LessonSettingsHolder | null | undefined): boolean {
	return classRegistrationOf(main) !== undefined;
}

/** The seating was copied: the lesson's tables own the seating from now on. */
export function isSeatingCopied(main: LessonSettingsHolder | null | undefined): boolean {
	return classRegistrationOf(main)?.seatingCopiedAt !== undefined;
}

/** The machine-readable cause a bridge callable attached to its refusal. */
export function registrationReasonOf(error: unknown): ClassRegistrationErrorReason | undefined {
	const reason = (error as { details?: { reason?: unknown } } | null)?.details?.reason;

	return typeof reason === 'string' ? (reason as ClassRegistrationErrorReason) : undefined;
}

/** Open registrations first, the rest after, newest first inside each group (IA 8). */
const STATUS_ORDER: Record<TableAssignmentStatus, number> = {
	registrationOpen: 0,
	draft: 1,
	registrationClosed: 2,
	published: 3,
	ended: 4,
};

/**
 * The registrations the teacher may connect to `lessonId`: hers (the query
 * already asked for her Google account), not ended, not connected to another
 * lesson. Ordered for the chooser.
 */
export function connectableRegistrations(
	assignments: readonly TableAssignment[],
	lessonId: string,
): TableAssignment[] {
	return assignments
		.filter((assignment) => isRegistrationConnectable(assignment, lessonId))
		.sort(
			(a, b) =>
				STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
				b.createdAt - a.createdAt ||
				a.tableAssignmentId.localeCompare(b.tableAssignmentId),
		);
}

/** i18n key of a registration's status chip. */
export function registrationStatusKey(status: TableAssignmentStatus | undefined): string {
	return `console.register_ahead.status.${status ?? 'draft'}`;
}

/** The registration still takes sign-ups, so "close registration" is offered. */
export function canCloseRegistration(status: TableAssignmentStatus | undefined): boolean {
	return status === 'registrationOpen';
}

/** What the Tables step of a connected lesson offers (IA 5.3). */
export type CopyOffer =
	/** Not connected, or past the Tables step: the ordinary split button stays (or nothing). */
	| { kind: 'ordinary' }
	/** The registration has no published seating yet: say what is missing. */
	| { kind: 'not-ready'; reasonKey: string }
	/** First copy. */
	| { kind: 'copy' }
	/** Copied before: "עדכון מההרשמה", asked first, only while the room is at the Tables step. */
	| { kind: 'again' };

export interface CopyOfferInput {
	connected: boolean;
	copied: boolean;
	/** The registration's status; undefined while it loads. */
	status: TableAssignmentStatus | undefined;
	/** The registration seats people into topics ("sit where you like"). */
	splitByTopic: boolean;
	/** The room's current step. */
	stepKey: LessonStepKey;
}

export function copyOfferOf(input: CopyOfferInput): CopyOffer {
	if (!input.connected) return { kind: 'ordinary' };
	if (input.copied) return input.stepKey === 'tables' ? { kind: 'again' } : { kind: 'ordinary' };
	if (input.status === 'published') return { kind: 'copy' };

	return {
		kind: 'not-ready',
		reasonKey: input.splitByTopic
			? 'console.copy_seating.not_ready.direct'
			: 'console.copy_seating.not_ready.ranked',
	};
}

/** Plain-words line (i18n key) for a refused bridge call, or null for a cause the screens do not name. */
export function refusalKeyOf(reason: ClassRegistrationErrorReason | undefined): string | null {
	switch (reason) {
		case 'registration-not-published':
			return 'console.copy_seating.not_ready.ranked';
		case 'not-tables-step':
			return 'console.copy_seating.not_tables_step';
		case 'seating-copied':
			return 'console.copy_seating.copied_already';
		case 'not-connected':
			return 'console.register_ahead.err.not_connected';
		case 'connected-elsewhere':
			return 'console.register_ahead.err.connected_elsewhere';
		case 'not-registration-host':
			return 'console.register_ahead.err.not_host';
		case 'registration-ended':
			return 'console.register_ahead.err.ended';
		case 'seat-taken':
			return 'console.no_device.seat_taken';
		default:
			return null;
	}
}

/** "N בלי שולחן": the students of the roster who sit at no table. */
export function withoutTableCount(
	studentUids: readonly string[],
	tables: readonly Pick<ClassTable, 'memberUids'>[],
): number {
	const seated = new Set(tables.flatMap((table) => table.memberUids));

	return studentUids.filter((uid) => !seated.has(uid)).length;
}

/**
 * The Side step marks the roster from the step on. A lesson whose registration
 * asked a position has no Side step at all, so nothing is marked there.
 */
export function sidesShownAt(steps: readonly LessonStepKey[], stepIndex: number): boolean {
	const sideIndex = steps.indexOf('side');

	return sideIndex >= 0 && stepIndex >= sideIndex;
}

/** The registration asked a position: the lesson skips "בחירת צד" and the Summary reads the poles. */
export function registrationAskedPosition(main: LessonSettingsHolder | null | undefined): boolean {
	return classRegistrationOf(main)?.sideStepRemoved === true;
}
