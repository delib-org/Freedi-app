import { Role } from '@freedi/shared-types';
import { getDoc } from 'firebase/firestore';
import { updateMemberRole } from '../subscriptions/setSubscriptions';
import { removeUserEvaluations } from '../evaluation/removeUserEvaluations';
import { getStatementFromDB } from '../statements/getStatement';
import { getStatementSubscriptionId } from '@/controllers/general/helpers';
import { canBanUser, getBanDisabledReason } from '@/helpers/roleHelpers';
import { createSubscriptionRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

/**
 * Bans a member from a statement by updating their role to banned
 * and optionally removing their votes/evaluations
 * @param statementId - The statement ID where the user is being banned
 * @param userId - The user ID to ban
 * @param reason - Reason for banning (for audit logging)
 * @param removeVotes - Whether to remove the user's votes and evaluations
 * @returns Promise<void>
 */
export async function banMember(
	statementId: string,
	userId: string,
	reason: string,
	removeVotes: boolean,
): Promise<void> {
	try {
		if (!statementId || !userId) {
			throw new Error('Statement ID and User ID are required to ban a member');
		}

		// Validate that the user can be banned (not an admin or creator)
		const subscriptionId = getStatementSubscriptionId(statementId, userId);
		if (!subscriptionId) {
			throw new Error('Error getting subscription ID');
		}

		const subscriptionRef = createSubscriptionRef(subscriptionId);
		const subscriptionDoc = await getDoc(subscriptionRef);

		if (!subscriptionDoc.exists()) {
			throw new Error('User subscription not found');
		}

		const currentRole = subscriptionDoc.data()?.role as Role;
		const statement = await getStatementFromDB(statementId);

		if (!canBanUser(currentRole, userId, statement)) {
			const reason = getBanDisabledReason(currentRole, userId, statement);
			throw new Error(reason || 'This user cannot be banned');
		}

		console.info('Banning member:', {
			statementId,
			userId,
			reason,
			removeVotes,
		});

		// 1. Update subscription role to Role.banned
		await updateMemberRole(statementId, userId, Role.banned);

		// 2. If removeVotes is true, remove all evaluations by this user
		if (removeVotes) {
			console.info('Removing votes for banned user:', userId);
			await removeUserEvaluations(statementId, userId);
		}

		// Log the ban action for audit purposes
		console.info('Member banned successfully:', {
			statementId,
			userId,
			reason,
			votesRemoved: removeVotes,
			bannedAt: new Date().toISOString(),
		});
	} catch (error) {
		logError(error, {
			operation: 'membership.banMember.unknown',
			metadata: { message: 'Error banning member:' },
		});
		throw error;
	}
}

/**
 * Unbans a member from a statement by updating their role back to member
 * Note: This does not restore removed votes
 * @param statementId - The statement ID where the user is being unbanned
 * @param userId - The user ID to unban
 * @returns Promise<void>
 */
export async function unbanMember(statementId: string, userId: string): Promise<void> {
	try {
		if (!statementId || !userId) {
			throw new Error('Statement ID and User ID are required to unban a member');
		}

		console.info('Unbanning member:', {
			statementId,
			userId,
		});

		// Update subscription role back to Role.member
		await updateMemberRole(statementId, userId, Role.member);

		console.info('Member unbanned successfully:', {
			statementId,
			userId,
			unbannedAt: new Date().toISOString(),
		});
	} catch (error) {
		logError(error, {
			operation: 'membership.banMember.unbanMember',
			metadata: { message: 'Error unbanning member:' },
		});
		throw error;
	}
}
