import { httpsCallable } from 'firebase/functions';
import { functions } from '../config';
import { logError } from '@/utils/errorHandling';

interface RemoveUserEvaluationsResult {
	evaluationsRemoved: number;
	votesRemoved: number;
}

/**
 * Removes a member's evaluations and vote for a statement — the "also remove
 * their votes" half of banning someone.
 *
 * This used to be a client-side batch delete, which only worked because the
 * /evaluations rules let any authenticated user delete any document. Deletes
 * are owner-only now, so the capability lives in the `removeUserEvaluations`
 * callable, behind a server-side admin check. Deleting the evaluation docs
 * still triggers the counter-recalculation function, exactly as before.
 */
export async function removeUserEvaluations(
	statementId: string,
	userId: string,
): Promise<RemoveUserEvaluationsResult> {
	try {
		if (!statementId || !userId) {
			throw new Error('Statement ID and User ID are required');
		}

		const callable = httpsCallable<
			{ statementId: string; userId: string },
			RemoveUserEvaluationsResult
		>(functions, 'removeUserEvaluations');

		const { data } = await callable({ statementId, userId });

		console.info('Successfully removed user evaluations:', {
			statementId,
			userId,
			...data,
		});

		return data;
	} catch (error) {
		logError(error, {
			operation: 'evaluation.removeUserEvaluations',
			statementId,
			metadata: { targetUserId: userId },
		});
		throw error;
	}
}
