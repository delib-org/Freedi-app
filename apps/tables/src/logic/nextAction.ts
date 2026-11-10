import type { TableAssignmentParticipant, TableAssignmentStatus } from '@freedi/shared-types';

/** A participant may save preferences only while registration is open. */
export function canEditPreferences(status: TableAssignmentStatus): boolean {
	return status === 'registrationOpen';
}

/** Open registration only; a registration continued by name is refused by the server too. */
export function canCancelRegistration(
	status: TableAssignmentStatus,
	participant: Pick<TableAssignmentParticipant, 'claimedByName'>,
): boolean {
	return status === 'registrationOpen' && !participant.claimedByName;
}
