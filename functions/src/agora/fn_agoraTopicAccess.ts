import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	AgoraSession,
	AgoraTopicPackage,
	Collections,
	TopicAccessRequest,
	TopicAccessResponse,
	canOpenScenario,
	createAgoraParticipantId,
	functionConfig,
	isRemovedFromAgoraSession,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { isSystemAdmin } from '../utils/httpAuth';
import { grantTopicRead } from './topicReaders';

/**
 * Someone already in a session asks to read the private scenario it plays.
 *
 * The usual path needs no call: agoraJoinSession leaves the reader marker as
 * a player sits down. This is the fallback the client tries once when the
 * direct read is refused — for a player seated before markers existed, a
 * team device, or a teacher running a lesson on a scenario someone else
 * authored. It never widens access beyond the session: the caller must be the
 * session's teacher or hold a seat in it (their participant doc).
 */
export const agoraTopicAccess = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<TopicAccessRequest>): Promise<TopicAccessResponse> => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'User must be authenticated');
		const sessionId = request.data?.sessionId;
		if (!sessionId || typeof sessionId !== 'string') {
			throw new HttpsError('invalid-argument', 'sessionId is required');
		}

		try {
			const sessionSnap = await db.collection(Collections.agoraSessions).doc(sessionId).get();
			const session = sessionSnap.data() as AgoraSession | undefined;
			if (!session) throw new HttpsError('not-found', 'Session not found');
			const { topicPackageId } = session;

			const [pkgSnap, seatSnap] = await Promise.all([
				db.collection(Collections.agoraTopicPackages).doc(topicPackageId).get(),
				db
					.collection(Collections.agoraParticipants)
					.doc(createAgoraParticipantId(sessionId, uid))
					.get(),
			]);
			const pkg = pkgSnap.data() as AgoraTopicPackage | undefined;
			if (!pkg) throw new HttpsError('not-found', 'Scenario not found');

			// Readable without a marker: nothing to write
			if (canOpenScenario(pkg, { uid, isSystemAdmin: false })) {
				return { topicPackageId, granted: true };
			}

			// A student the teacher took out of the lesson has no seat to point at
			const inSession =
				session.teacherId === uid || (seatSnap.exists && !isRemovedFromAgoraSession(session, uid));
			if (!inSession) {
				if (await isSystemAdmin(uid)) return { topicPackageId, granted: true };
				throw new HttpsError('permission-denied', 'Not part of this session');
			}

			const granted = await grantTopicRead(topicPackageId, uid, sessionId);

			return { topicPackageId, granted };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.topicAccess',
				userId: uid,
				metadata: { sessionId },
			});
			throw new HttpsError('internal', 'Failed to check scenario access');
		}
	},
);
