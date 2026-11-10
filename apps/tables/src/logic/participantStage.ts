import type { TableAssignmentMode, TableAssignmentStatus } from '@freedi/shared-types';
import type { RegistrationLoss } from '@/logic/localDraft';

/**
 * What the assignment link shows (IA section 7):
 *  - notOpen: registration has not opened yet;
 *  - name: step 1, the person types a full name;
 *  - waiting / waitingClosed: registered, tables not published yet, before and after closing;
 *  - cancelled: this browser cancelled its registration;
 *  - removed: this browser's registration is gone and it did not cancel it (the host
 *    removed it, or the person continued by full name on another device);
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
	| 'removed'
	| 'closedNotRegistered'
	| 'myTable'
	| 'ended';

export interface StageInput {
	status: TableAssignmentStatus;
	mode: TableAssignmentMode;
	registered: boolean;
	/** Direct mode: the person already sits at a table. */
	hasChosenTable: boolean;
	/** Why a registration this browser held no longer exists; null when none is missing. */
	lost: RegistrationLoss | null;
}

function stageWithoutRegistration(
	status: TableAssignmentStatus,
	lost: RegistrationLoss | null,
): ParticipantStage {
	if (lost) return lost;

	return status === 'registrationOpen' ? 'name' : 'closedNotRegistered';
}

export function participantStage({
	status,
	mode,
	registered,
	hasChosenTable,
	lost,
}: StageInput): ParticipantStage {
	if (status === 'draft') return 'notOpen';
	if (status === 'ended') return 'ended';
	if (!registered) return stageWithoutRegistration(status, lost);
	if (status === 'published' || (mode === 'direct' && hasChosenTable)) return 'myTable';

	return status === 'registrationOpen' ? 'waiting' : 'waitingClosed';
}
