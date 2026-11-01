import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import {
	AgoraSessionStatus,
	AgoraStage,
	Collections,
	createAgoraParticipantId,
	currentPlanIndex,
	functionConfig,
	removalOf,
	resolveStagePlan,
	stationDeepLink,
	type AgoraSession,
	type MintStationHandoffRequest,
	type MintStationHandoffResponse,
} from '@freedi/shared-types';
import { db } from '../db';
import { logError } from '../utils/errorHandling';
import { storeAppHandoff } from '../handoff/appHandoff';
import { appOrigin } from './stationLink';

/**
 * A student at a linked station asks for the way in: a one-time code for
 * THEIR uid, bound to this session, this step and its question, wrapped in
 * a deep link the server builds from constants. The station prefetches it
 * when the card renders (and refreshes it at half the TTL), so the tap can
 * open the tab synchronously and no popup blocker steps in.
 *
 * Refused for anyone without a seat, a seat the teacher took away, a step
 * the room has not reached, and a lesson that is over.
 */
export async function mintStationHandoff(
	uid: string,
	request: MintStationHandoffRequest,
	now: number,
): Promise<MintStationHandoffResponse> {
	const { sessionId, itemId } = request;
	const sessionSnap = await db.collection(Collections.agoraSessions).doc(sessionId).get();
	if (!sessionSnap.exists) throw new HttpsError('not-found', 'Session not found');
	const session = sessionSnap.data() as AgoraSession;
	if (session.status === AgoraSessionStatus.ended || session.stage === AgoraStage.ended) {
		throw new HttpsError('failed-precondition', 'The lesson has ended', { reason: 'ended' });
	}
	if (removalOf(session, uid)) {
		throw new HttpsError('permission-denied', 'Not in this lesson');
	}
	const seat = await db
		.collection(Collections.agoraParticipants)
		.doc(createAgoraParticipantId(sessionId, uid))
		.get();
	if (!seat.exists) throw new HttpsError('permission-denied', 'Not in this lesson');

	const plan = resolveStagePlan(session);
	const index = plan.findIndex((item) => item.itemId === itemId);
	const item = plan[index];
	if (!item || item.stage !== AgoraStage.linked || !item.link) {
		throw new HttpsError('invalid-argument', 'Not a linked station');
	}
	if (index > currentPlanIndex(session)) {
		throw new HttpsError('failed-precondition', 'This station is not open yet', {
			reason: 'closed',
		});
	}

	const { app, statementId } = item.link;
	const origin = appOrigin(app);
	const { code, expiresAt } = await storeAppHandoff(
		{ uid, app, sessionId, itemId, statementId },
		now,
	);

	return {
		url: stationDeepLink({ app, origin, statementId, code, sessionId, itemId }),
		expiresAt,
	};
}

const isId = (value: unknown): value is string =>
	typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/');

export const agoraMintStationHandoff = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<MintStationHandoffRequest>,
	): Promise<MintStationHandoffResponse> => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'User must be authenticated');
		const { sessionId, itemId } = request.data ?? {};
		if (!isId(sessionId) || !isId(itemId)) {
			throw new HttpsError('invalid-argument', 'sessionId and itemId are required');
		}
		try {
			return await mintStationHandoff(uid, { sessionId, itemId }, Date.now());
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.mintStationHandoff',
				userId: uid,
				metadata: { sessionId, itemId },
			});
			throw new HttpsError('internal', 'Could not open the task');
		}
	},
);
