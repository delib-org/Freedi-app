import type { TableAssignmentMode, TableAssignmentStatus } from '@freedi/shared-types';

/**
 * What the participant home shows (IA section 7, "בית המשתתף"):
 *  - notOpen: registration has not opened yet;
 *  - register: registration is open and the person is not registered;
 *  - closedNotRegistered: registration is over and the person never registered;
 *  - act: registered, registration open: rank topics or choose a table;
 *  - waiting: registered, registration closed, assignment not published;
 *  - myTable: the assignment is published (or, in direct mode, seats are live);
 *  - ended: the assignment is over.
 */
export type ParticipantStage =
	| 'notOpen'
	| 'register'
	| 'closedNotRegistered'
	| 'act'
	| 'waiting'
	| 'myTable'
	| 'ended';

export interface StageInput {
	status: TableAssignmentStatus;
	mode: TableAssignmentMode;
	registered: boolean;
	/** Direct mode: the person already sits at a table. */
	hasChosenTable: boolean;
}

export function participantStage({
	status,
	mode,
	registered,
	hasChosenTable,
}: StageInput): ParticipantStage {
	if (status === 'draft') return 'notOpen';
	if (status === 'ended') return 'ended';
	if (!registered) return status === 'registrationOpen' ? 'register' : 'closedNotRegistered';
	if (status === 'registrationOpen') return 'act';
	if (status === 'published') return 'myTable';

	// registrationClosed: direct mode already has its seat, ranked mode waits for publication.
	return mode === 'direct' && hasChosenTable ? 'myTable' : 'waiting';
}
