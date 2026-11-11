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
 *  - waitingForSeat: registered after the tables were published and not seated yet: the host
 *    will seat them (a latecomer);
 *  - checkingSeat: published and registered, the published run is still being read;
 *  - closedNotRegistered: registration is closed and the person never registered;
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
	| 'waitingForSeat'
	| 'checkingSeat'
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
	/** Published ranked run: does the person sit at one of its tables? Null while unknown. */
	seated: boolean | null;
}

function stageWithoutRegistration(
	status: TableAssignmentStatus,
	lost: RegistrationLoss | null,
): ParticipantStage {
	if (lost) return lost;

	// Latecomers may register after publishing; only a closed registration is shut.
	return status === 'registrationOpen' || status === 'published' ? 'name' : 'closedNotRegistered';
}

function stageInPublished(mode: TableAssignmentMode, seated: boolean | null): ParticipantStage {
	if (mode === 'direct' || seated === true) return 'myTable';

	return seated === false ? 'waitingForSeat' : 'checkingSeat';
}

export function participantStage({
	status,
	mode,
	registered,
	hasChosenTable,
	lost,
	seated,
}: StageInput): ParticipantStage {
	if (status === 'draft') return 'notOpen';
	if (status === 'ended') return 'ended';
	if (!registered) return stageWithoutRegistration(status, lost);
	if (mode === 'direct' && hasChosenTable) return 'myTable';
	if (status === 'published') return stageInPublished(mode, seated);

	return status === 'registrationOpen' ? 'waiting' : 'waitingClosed';
}
