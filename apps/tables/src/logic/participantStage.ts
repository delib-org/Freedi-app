import type { TableAssignmentMode, TableAssignmentStatus } from '@freedi/shared-types';

/**
 * What the assignment link shows (IA section 7):
 *  - notOpen: registration has not opened yet;
 *  - name: step 1, the person types a full name;
 *  - waiting / waitingClosed: registered, tables not published yet, before and after closing;
 *  - cancelled: this browser's registration is gone, cancelled or continued elsewhere;
 *  - closedNotRegistered: registration is over and the person never registered;
 *  - myTable: tables are published, or in free mode the person already sits at one;
 *  - ended: the assignment is over.
 */
export type ParticipantStage =
	| 'notOpen'
	| 'name'
	| 'waiting'
	| 'waitingClosed'
	| 'cancelled'
	| 'closedNotRegistered'
	| 'myTable'
	| 'ended';

export interface StageInput {
	status: TableAssignmentStatus;
	mode: TableAssignmentMode;
	registered: boolean;
	/** Direct mode: the person already sits at a table. */
	hasChosenTable: boolean;
	/** This browser held a registration that no longer exists. */
	cancelled: boolean;
}

function stageWithoutRegistration(status: TableAssignmentStatus, cancelled: boolean) {
	if (cancelled) return 'cancelled';

	return status === 'registrationOpen' ? 'name' : 'closedNotRegistered';
}

export function participantStage({
	status,
	mode,
	registered,
	hasChosenTable,
	cancelled,
}: StageInput): ParticipantStage {
	if (status === 'draft') return 'notOpen';
	if (status === 'ended') return 'ended';
	if (!registered) return stageWithoutRegistration(status, cancelled);
	if (status === 'published' || (mode === 'direct' && hasChosenTable)) return 'myTable';

	return status === 'registrationOpen' ? 'waiting' : 'waitingClosed';
}
