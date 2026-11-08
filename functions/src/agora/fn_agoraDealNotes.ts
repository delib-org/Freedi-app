import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { functionConfig } from '@freedi/shared-types';
import type {
	DealNotesRequest as Request,
	DealNotesResponse as Result,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { dealNotes } from './dealNotes';

/**
 * A student asks for their hand of classmates' notes at a station.
 *
 * Thin: the lottery lives in `dealNotes`. This wrapper checks the request
 * and turns the typed result into the errors a caller expects. Idempotent —
 * a repeated `fill` returns the same hand, so the client may call it on
 * every signal (board opened, rating landed, a note arrived) without care.
 */
export const agoraDealNotes = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<Request>): Promise<Result> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const { sessionId, parentId, mode } = request.data ?? {};
		if (!sessionId || typeof sessionId !== 'string') {
			throw new HttpsError('invalid-argument', 'sessionId is required');
		}
		if (!parentId || typeof parentId !== 'string') {
			throw new HttpsError('invalid-argument', 'parentId is required');
		}
		if (mode !== 'fill' && mode !== 'more') {
			throw new HttpsError('invalid-argument', 'mode must be "fill" or "more"');
		}

		try {
			const result = await dealNotes({ sessionId, parentId, mode, uid });
			if (result.ok) return result.value;

			switch (result.reason) {
				case 'not-found':
					throw new HttpsError('not-found', 'Session not found');
				case 'forbidden':
					throw new HttpsError('permission-denied', 'Only a seated student is dealt notes');
				case 'ended':
					throw new HttpsError('failed-precondition', 'This session has ended');
				default:
					throw new HttpsError('invalid-argument', 'This question is not part of the session');
			}
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.dealNotes',
				userId: uid,
				metadata: { sessionId, parentId, mode },
			});
			throw new HttpsError('internal', 'Failed to deal notes');
		}
	},
);
