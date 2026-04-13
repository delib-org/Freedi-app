import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import { db } from './index';
import { Collections, functionConfig } from '@freedi/shared-types';

interface DeleteRequest {
	targetUserId: string;
}

interface DeleteResult {
	success: boolean;
	deletedLogs: number;
	deletedConsent: number;
}

/**
 * Delete all research logs and consent records for a user.
 * Callable by the user themselves or by a system admin.
 */
export const deleteResearchLogs = onCall<DeleteRequest>(
	{ ...functionConfig },
	async (request): Promise<DeleteResult> => {
		if (!request.auth) {
			throw new HttpsError('unauthenticated', 'Authentication required');
		}

		const { targetUserId } = request.data;
		if (!targetUserId) {
			throw new HttpsError('invalid-argument', 'targetUserId is required');
		}

		const callerUid = request.auth.uid;

		// Authorization: caller must be the target user or a system admin
		if (callerUid !== targetUserId) {
			const callerDoc = await db.collection(Collections.users).doc(callerUid).get();
			if (!callerDoc.exists || callerDoc.data()?.systemAdmin !== true) {
				throw new HttpsError(
					'permission-denied',
					'Only the user themselves or a system admin can delete research logs',
				);
			}
		}

		let deletedLogs = 0;
		let deletedConsent = 0;

		try {
			// Delete research logs in batches
			deletedLogs = await batchDelete(
				Collections.researchLogs,
				'userId',
				targetUserId,
			);

			// Delete consent records in batches
			deletedConsent = await batchDelete(
				Collections.researchConsent,
				'userId',
				targetUserId,
			);

			logger.info(`[DeleteResearchLogs] Deleted ${deletedLogs} logs and ${deletedConsent} consent records for user ${targetUserId}`);

			return { success: true, deletedLogs, deletedConsent };
		} catch (error) {
			logger.error('[DeleteResearchLogs] Error:', error);
			throw new HttpsError('internal', 'Failed to delete research logs');
		}
	},
);

async function batchDelete(
	collectionName: string,
	field: string,
	value: string,
): Promise<number> {
	const BATCH_SIZE = 500;
	let totalDeleted = 0;
	let hasMore = true;

	while (hasMore) {
		const snapshot = await db
			.collection(collectionName)
			.where(field, '==', value)
			.limit(BATCH_SIZE)
			.get();

		if (snapshot.empty) {
			hasMore = false;
			break;
		}

		const batch = db.batch();
		snapshot.docs.forEach((doc) => batch.delete(doc.ref));
		await batch.commit();

		totalDeleted += snapshot.size;

		if (snapshot.size < BATCH_SIZE) {
			hasMore = false;
		}
	}

	return totalDeleted;
}
