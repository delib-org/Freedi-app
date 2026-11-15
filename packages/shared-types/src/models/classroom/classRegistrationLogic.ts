import type { ClassRegistration, ClassTable, ReservedSeat } from './classroomModel';
import { DEFAULT_TABLE_SIZE } from './classroomModel';
import { tableSizeOf } from './classroomLogic';
import type { LessonSettingsHolder } from './classroomLogic';
import type { TableAssignment } from '../tableAssignment/tableAssignmentModel';

/**
 * Pure readers of the Tables-Class bridge (IA tables-class-bridge), shared by
 * the Class screens and the server so both count seats the same way.
 */

/** The lesson's connection to a registration, when it has one. */
export function classRegistrationOf(
	main: LessonSettingsHolder | null | undefined,
): ClassRegistration | undefined {
	return main?.statementSettings?.classRegistration ?? undefined;
}

/**
 * May this registration be connected to `lessonId`? Not ended, and not
 * connected to another lesson (one registration, one lesson). The host check
 * (same Google account) is the server's.
 */
export function isRegistrationConnectable(
	assignment: Pick<TableAssignment, 'status' | 'contextStatementId'>,
	lessonId: string,
): boolean {
	return (
		assignment.status !== 'ended' &&
		(!assignment.contextStatementId || assignment.contextStatementId === lessonId)
	);
}

/**
 * Seats per table of the lesson. Connected: the registration's number, as
 * copied (or, before copying, as the registration says now). Not connected:
 * the lesson's own setting.
 */
export function seatsPerTableOf(
	main: LessonSettingsHolder | null | undefined,
	registrationTableSize?: number,
): number {
	const registration = classRegistrationOf(main);
	if (!registration) return tableSizeOf(main);

	return registration.seatsPerTable ?? registrationTableSize ?? DEFAULT_TABLE_SIZE;
}

export function reservedSeatsOf(table: Pick<ClassTable, 'reservedSeats'>): ReservedSeat[] {
	return table.reservedSeats ?? [];
}

/** People sitting at the table now: members with a phone and people without one. */
export function presentCountOf(table: Pick<ClassTable, 'memberUids' | 'noDeviceMembers'>): number {
	return table.memberUids.length + (table.noDeviceMembers ?? []).length;
}

/** Seats taken: everyone present plus the reserved seats of people not here yet. */
export function takenSeatsOf(
	table: Pick<ClassTable, 'memberUids' | 'noDeviceMembers' | 'reservedSeats'>,
): number {
	return presentCountOf(table) + reservedSeatsOf(table).length;
}

/**
 * One person present at the table ("אדם אחד בשולחן"). A flag for the teacher
 * and the phone only: nothing ever merges a table by itself.
 */
export function isTableAlone(table: Pick<ClassTable, 'memberUids' | 'noDeviceMembers'>): boolean {
	return presentCountOf(table) === 1;
}
