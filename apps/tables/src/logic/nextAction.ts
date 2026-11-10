import type { TableAssignmentStatus } from '@freedi/shared-types';

/** A participant may save preferences only while registration is open. */
export function canEditPreferences(status: TableAssignmentStatus): boolean {
	return status === 'registrationOpen';
}
