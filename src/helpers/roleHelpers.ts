import { Role, Statement } from '@freedi/shared-types';

/**
 * Determines if a user can be banned based on their role and relationship to the statement
 * @param targetRole - The role of the user to be banned
 * @param targetUserId - The user ID of the user to be banned
 * @param statement - The statement context
 * @returns true if the user can be banned, false otherwise
 */
export function canBanUser(
	targetRole: Role | undefined,
	targetUserId: string,
	statement: Statement | undefined,
): boolean {
	// Cannot ban if role or statement is missing
	if (!targetRole || !statement) {
		return false;
	}

	// Cannot ban admins
	if (targetRole === Role.admin) {
		return false;
	}

	// Cannot ban creators (role-based check)
	if (targetRole === Role.creator) {
		return false;
	}

	// Cannot ban the statement creator (UID-based check)
	if (statement.creator?.uid === targetUserId) {
		return false;
	}

	// Can ban all other users (members, banned, waiting, etc.)
	return true;
}

/**
 * Gets a human-readable reason why a user cannot be banned
 * @param targetRole - The role of the user to be banned
 * @param targetUserId - The user ID of the user to be banned
 * @param statement - The statement context
 * @returns A string explaining why the user cannot be banned, or null if they can be banned
 */
export function getBanDisabledReason(
	targetRole: Role | undefined,
	targetUserId: string,
	statement: Statement | undefined,
): string | null {
	if (!targetRole || !statement) {
		return 'User information unavailable';
	}

	// Check if statement creator
	if (statement.creator?.uid === targetUserId) {
		return 'Cannot ban the statement creator';
	}

	// Check if admin
	if (targetRole === Role.admin) {
		return 'Cannot ban administrators';
	}

	// Check if creator role
	if (targetRole === Role.creator) {
		return 'Cannot ban statement creators';
	}

	// User can be banned
	return null;
}

/**
 * Checks if a role is considered an admin role (admin or creator)
 * @param role - The role to check
 * @returns true if the role is admin or creator
 */
export function isAdminRole(role: Role | undefined): boolean {
	return role === Role.admin || role === Role.creator;
}
