import type { TableAssignmentParticipant, TableAssignmentStatus } from '@freedi/shared-types';

/**
 * Whether the person sits at a table of the published run: true seated, false
 * not seated (a latecomer), null not known yet (the run is still being read).
 */
export type SeatKnowledge = boolean | null;

/** Where a participant stands when they ask to change their choices. */
export type EditAccess = 'allowed' | 'checking' | 'denied';

/**
 * Choices can be saved while registration is open, and after publishing by
 * someone who has no seat yet (a latecomer). A seated person's table is fixed.
 */
export function preferencesAccess(
	status: TableAssignmentStatus,
	seated: SeatKnowledge = null,
): EditAccess {
	if (status === 'registrationOpen') return 'allowed';
	if (status !== 'published') return 'denied';
	if (seated === null) return 'checking';

	return seated ? 'denied' : 'allowed';
}

export function canEditPreferences(
	status: TableAssignmentStatus,
	seated: SeatKnowledge = null,
): boolean {
	return preferencesAccess(status, seated) === 'allowed';
}

/**
 * Cancel while registration is open, or after publishing for someone not yet
 * seated. A registration continued by name is refused by the server too.
 */
export function canCancelRegistration(
	status: TableAssignmentStatus,
	participant: Pick<TableAssignmentParticipant, 'claimedByName'>,
	seated: SeatKnowledge = null,
): boolean {
	return canEditPreferences(status, seated) && !participant.claimedByName;
}
