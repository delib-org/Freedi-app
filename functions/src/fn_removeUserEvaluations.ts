import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { Collections, Role, functionConfig, type Statement } from '@freedi/shared-types';
import { db } from './db';
import { logError } from './utils/errorHandling';

interface Request {
	statementId: string;
	userId: string;
}

interface Result {
	evaluationsRemoved: number;
	votesRemoved: number;
}

/** Firestore caps a batch at 500 writes. */
const BATCH_LIMIT = 500;

/**
 * Purging a banned member's votes is a moderation action: it deletes documents
 * belonging to someone else. That used to be a client-side batch delete, which
 * only worked because /evaluations let any authenticated user delete anything.
 * Now that deletes are owner-only, the capability lives here, behind an
 * explicit admin check, where it belongs.
 */
export const removeUserEvaluations = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<Request>): Promise<Result> => {
		const callerUid = request.auth?.uid;
		if (!callerUid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const { statementId, userId } = request.data ?? {};
		if (!statementId || !userId) {
			throw new HttpsError('invalid-argument', 'statementId and userId are required');
		}

		try {
			await assertStatementAdmin(statementId, callerUid);

			const evaluationsSnap = await db
				.collection(Collections.evaluations)
				.where('parentId', '==', statementId)
				.where('evaluatorId', '==', userId)
				.get();

			const refs = evaluationsSnap.docs.map((docSnap) => docSnap.ref);

			// The vote document is keyed {userId}--{parentId}. Deleting a
			// non-existent document is a no-op, so no existence check is needed —
			// but it means we cannot honestly report how many votes were removed.
			const voteRef = db.collection(Collections.votes).doc(`${userId}--${statementId}`);
			const voteSnap = await voteRef.get();
			if (voteSnap.exists) refs.push(voteRef);

			for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
				const batch = db.batch();
				refs.slice(i, i + BATCH_LIMIT).forEach((ref) => batch.delete(ref));
				await batch.commit();
			}

			return {
				evaluationsRemoved: evaluationsSnap.size,
				votesRemoved: voteSnap.exists ? 1 : 0,
			};
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'moderation.removeUserEvaluations',
				userId: callerUid,
				statementId,
				metadata: { targetUserId: userId },
			});
			throw new HttpsError('internal', 'Failed to remove evaluations');
		}
	},
);

/**
 * Admin on the statement itself, on its topParent, or the statement's creator.
 * Mirrors `assertSynthesisAdmin`, but also accepts an admin subscription on the
 * statement being moderated — a question's own admins must be able to ban from
 * it without holding a role on the whole group.
 */
async function assertStatementAdmin(statementId: string, userId: string): Promise<void> {
	const statementSnap = await db.collection(Collections.statements).doc(statementId).get();
	if (!statementSnap.exists) {
		throw new HttpsError('not-found', 'Statement not found');
	}
	const statement = statementSnap.data() as Statement;
	if (statement.creatorId === userId) return;

	const scopeIds = [statementId];
	if (statement.topParentId && statement.topParentId !== statementId) {
		scopeIds.push(statement.topParentId);
	}

	const membership = await db
		.collection(Collections.statementsSubscribe)
		.where('statementId', 'in', scopeIds)
		.where('userId', '==', userId)
		.where('role', 'in', [Role.admin, 'creator', 'admin'])
		.limit(1)
		.get();

	if (membership.empty) {
		throw new HttpsError('permission-denied', 'Only admins can remove another member’s votes');
	}
}
