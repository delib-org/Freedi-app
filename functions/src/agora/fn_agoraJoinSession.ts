import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../db';
import {
	Collections,
	AgoraCamp,
	AgoraDeviceMode,
	AgoraParticipant,
	AgoraSession,
	AgoraSessionMode,
	AgoraSessionStatus,
	AgoraTopicPackage,
	CivicStanceEvaluation,
	CivicStanceMeta,
	Evaluation,
	AGORA_SESSION,
	createAgoraParticipantId,
	deriveCamp,
	deriveCivicCampPositionFromIsland,
	functionConfig,
	resolveSessionFlow,
	AttitudeMap,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { generateAnonName } from './anonNames';

interface CivicStanding {
	campPosition: number;
	camp: AgoraCamp;
}

/**
 * Where this player stood on the island, carried over as a camp.
 *
 * A classroom asks the positioning question on screen; a civic participant
 * answered it on the island, one stance at a time, so asking again would be
 * asking them to repeat themselves. Reads EVERY stance of the island: the
 * poles when the player marked them, and otherwise the spectrum derivation —
 * the stances are authored in order from pole to pole, so a voyager who
 * marked only middle stances still arrives with the lean those answers
 * express, instead of being handed the positioning bridge.
 */
async function deriveCivicStanding(
	session: AgoraSession,
	uid: string,
): Promise<CivicStanding | undefined> {
	const { islandStatementId, leftAnchorStanceId, rightAnchorStanceId } = session.civic ?? {};
	if (!islandStatementId || !leftAnchorStanceId || !rightAnchorStanceId) return undefined;

	const stanceSnaps = await db
		.collection(Collections.statements)
		.where('parentId', '==', islandStatementId)
		.get();
	const stanceMeta: CivicStanceMeta[] = stanceSnaps.docs.map((doc) => {
		const data = doc.data() as { order?: number };

		return { statementId: doc.id, order: data.order };
	});
	if (!stanceMeta.length) return undefined;

	const evalSnaps = await db.getAll(
		...stanceMeta.map((stance) =>
			db.collection(Collections.evaluations).doc(`${uid}--${stance.statementId}`),
		),
	);
	const evaluations: CivicStanceEvaluation[] = [];
	for (const snap of evalSnaps) {
		const data = snap.data() as Evaluation | undefined;
		if (data && typeof data.evaluation === 'number') {
			evaluations.push({ statementId: data.statementId, evaluation: data.evaluation });
		}
	}

	const campPosition = deriveCivicCampPositionFromIsland(
		evaluations,
		stanceMeta,
		leftAnchorStanceId,
		rightAnchorStanceId,
	);
	if (campPosition === null) return undefined;

	return { campPosition, camp: deriveCamp(campPosition) };
}

/**
 * This player's island stances exactly as they stand on arrival.
 *
 * A convergence score compares the room before the deliberation with the room
 * after it, and the "before" is only recoverable if it is copied now: the
 * ratings live at deterministic `${uid}--${stanceId}` ids, so the closing
 * re-rate overwrites the very documents the starting picture was made of.
 *
 * Reads every stance of the island, not just the two anchors — a camp-less
 * event has no anchors to speak of, and the whole island is what people are
 * actually being measured on.
 */
async function readStanceBaseline(
	session: AgoraSession,
	uid: string,
): Promise<AttitudeMap | undefined> {
	const islandStatementId = session.civic?.islandStatementId;
	if (!islandStatementId) return undefined;

	const stanceSnaps = await db
		.collection(Collections.statements)
		.where('parentId', '==', islandStatementId)
		.get();
	const stanceIds = stanceSnaps.docs.map((doc) => doc.id);
	if (!stanceIds.length) return undefined;

	const evalSnaps = await db.getAll(
		...stanceIds.map((stanceId) =>
			db.collection(Collections.evaluations).doc(`${uid}--${stanceId}`),
		),
	);

	const baseline: AttitudeMap = {};
	for (const snap of evalSnaps) {
		const data = snap.data() as Evaluation | undefined;
		if (data && typeof data.evaluation === 'number') {
			baseline[data.statementId] = data.evaluation;
		}
	}

	return Object.keys(baseline).length ? baseline : undefined;
}

interface Request {
	code: string;
	teamMemberCount?: number;
}

interface Result {
	sessionId: string;
	participantId: string;
	anonName: string;
}

/**
 * Student (or team device) joins a session by code. Creates the anonymous
 * participant doc — idempotent: rejoining returns the existing participant,
 * so a page refresh never duplicates a traveler.
 */
export const agoraJoinSession = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<Request>): Promise<Result> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const { code, teamMemberCount } = request.data ?? {};
		if (!code || typeof code !== 'string') {
			throw new HttpsError('invalid-argument', 'code is required');
		}

		// Codes are digits now, so the old .toUpperCase() was a no-op. Normalise
		// the same way the client does, so a stray space or dash still resolves.
		const normalisedCode = code.replace(/\D/g, '');
		if (normalisedCode.length !== AGORA_SESSION.JOIN_CODE_LENGTH) {
			throw new HttpsError('invalid-argument', 'code must be 5 digits');
		}

		try {
			const sessionSnap = await db
				.collection(Collections.agoraSessions)
				.where('code', '==', normalisedCode)
				.where('status', 'in', [AgoraSessionStatus.open, AgoraSessionStatus.live])
				.limit(1)
				.get();

			if (sessionSnap.empty) {
				throw new HttpsError('not-found', 'Session not found');
			}

			const session = sessionSnap.docs[0].data() as AgoraSession;
			const participantId = createAgoraParticipantId(session.sessionId, uid);
			const participantRef = db.collection(Collections.agoraParticipants).doc(participantId);

			const existing = await participantRef.get();
			if (existing.exists) {
				const participant = existing.data() as AgoraParticipant;

				// A voyager seated before the spectrum derivation existed can hold
				// no campPosition even though their island answers lean. Heal it on
				// rejoin, so nobody is re-asked on the bridge what the island
				// already answered — a player who placed themselves by hand keeps
				// their answer (campPosition is defined) and is left alone.
				if (
					participant.campPosition === undefined &&
					session.sessionMode === AgoraSessionMode.civic &&
					resolveSessionFlow(session).stances
				) {
					const standing = await deriveCivicStanding(session, uid);
					if (standing) {
						await participantRef.update({
							campPosition: standing.campPosition,
							camp: standing.camp,
							lastActive: Date.now(),
						});
					}
				}

				return {
					sessionId: session.sessionId,
					participantId,
					anonName: participant.anonName,
				};
			}

			if (session.deviceMode === AgoraDeviceMode.team) {
				const size = teamMemberCount ?? 1;
				if (size < AGORA_SESSION.TEAM_SIZE_MIN || size > session.teamSizeMax) {
					throw new HttpsError('invalid-argument', 'teamMemberCount out of range');
				}
			}

			const topicSnap = await db
				.collection(Collections.agoraTopicPackages)
				.doc(session.topicPackageId)
				.get();
			const language = (topicSnap.data() as AgoraTopicPackage | undefined)?.language ?? 'en';

			const now = Date.now();
			const sessionRef = db.collection(Collections.agoraSessions).doc(session.sessionId);

			const flow = resolveSessionFlow(session);
			const civic = session.sessionMode === AgoraSessionMode.civic;

			// Read before the transaction: both touch only this player's own
			// documents, nothing the transaction contends on.
			//
			// An event that runs without stances gets no camp at all — not a
			// centred one. A centre position is a real answer ("I hold both sides
			// equally"), and writing it for someone who was never asked would put
			// a claim in their mouth.
			const civicStanding =
				civic && flow.stances ? await deriveCivicStanding(session, uid) : undefined;
			// Only ever on a first join — a rejoin returned above, which is what
			// keeps someone's starting position from being re-read after they
			// have already moved.
			const stanceBaseline =
				civic && flow.scoreMode === 'convergence'
					? await readStanceBaseline(session, uid)
					: undefined;

			/**
			 * The name and the count that produces it must be decided together.
			 *
			 * This used to read participantCount from the session snapshot fetched
			 * above, then increment it in a separate batch. A class does not trickle
			 * in — it arrives at once, on a teacher's "scan this code". Three students
			 * joining 26ms apart all read participantCount === 0 and all became
			 * "פנס אמיץ", and the teacher could not tell them apart for the rest of
			 * the lesson. Observed in production, session BxDE3d1DmbLq.
			 *
			 * Reading the session INSIDE the transaction makes the read a conflict
			 * point: concurrent joins serialise and retry against a fresh count, so
			 * indices are handed out exactly once each.
			 */
			const anonName = await db.runTransaction(async (transaction) => {
				const freshSession = await transaction.get(sessionRef);
				const count = (freshSession.data() as AgoraSession | undefined)?.participantCount ?? 0;
				const name = generateAnonName(language, count);

				const participant: AgoraParticipant = {
					participantId,
					sessionId: session.sessionId,
					userId: uid,
					anonName: name,
					...(session.deviceMode === AgoraDeviceMode.team
						? { teamMemberCount: teamMemberCount ?? 1 }
						: {}),
					// Civic players arrive already placed, so the client never sends
					// them to the positioning screen they have effectively done.
					...(civicStanding
						? { campPosition: civicStanding.campPosition, camp: civicStanding.camp }
						: {}),
					...(stanceBaseline ? { stanceBaseline } : {}),
					points: { valueAccuracy: 0, proposals: 0, helping: 0, total: 0 },
					joinedAt: now,
					lastActive: now,
				};

				transaction.set(participantRef, participant);
				transaction.update(sessionRef, {
					participantCount: FieldValue.increment(1),
					lastUpdate: now,
				});

				return name;
			});

			return { sessionId: session.sessionId, participantId, anonName };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.joinSession',
				userId: uid,
				metadata: { code },
			});
			throw new HttpsError('internal', 'Failed to join session');
		}
	},
);
