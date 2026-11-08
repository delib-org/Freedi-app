import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { ResolveRejoinRequest, ResolveRejoinResponse, functionConfig } from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { resolveRejoin } from './rejoin';

/** `agoraResolveRejoin` — the session teacher answers a removed student's knock. See rejoin.ts. */
export const agoraResolveRejoin = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<ResolveRejoinRequest>): Promise<ResolveRejoinResponse> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		if (request.auth?.token.firebase.sign_in_provider === 'anonymous') {
			throw new HttpsError('permission-denied', 'Teachers must sign in with a full account');
		}
		const { sessionId, studentUid, decision } = request.data ?? {};
		if (!sessionId || typeof sessionId !== 'string') {
			throw new HttpsError('invalid-argument', 'sessionId is required');
		}
		if (!studentUid || typeof studentUid !== 'string') {
			throw new HttpsError('invalid-argument', 'studentUid is required');
		}
		if (decision !== 'approve' && decision !== 'decline') {
			throw new HttpsError('invalid-argument', 'decision must be approve or decline');
		}

		try {
			return await resolveRejoin({ sessionId, teacherUid: uid, studentUid, decision });
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.resolveRejoin',
				userId: uid,
				metadata: { sessionId, studentUid, decision },
			});
			throw new HttpsError('internal', 'Failed to answer the request');
		}
	},
);
