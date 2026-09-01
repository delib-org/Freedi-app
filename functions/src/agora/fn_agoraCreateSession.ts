import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	StatementType,
	createStatementObject,
	functionConfig,
	getRandomUID,
	AgoraClass,
	AgoraDeviceMode,
	AgoraParticipant,
	AgoraSession,
	AgoraSessionFlow,
	AgoraSessionFlowSchema,
	AgoraSessionStatus,
	AgoraStage,
	AgoraTopicPackage,
	AgoraTopicStatus,
	SourceApp,
	AGORA_AI_REVIEW,
	AGORA_CYCLE,
	AGORA_SESSION,
	createAgoraAiRaterUid,
	createAgoraParticipantId,
	deriveCamp,
} from '@freedi/shared-types';
import { safeParse } from 'valibot';
import { logError } from '../utils/errorHandling';
import { generateUniqueCode } from './joinCodes';

interface Request {
	topicPackageId: string;
	deviceMode: AgoraDeviceMode;
	teamSizeMax?: number;
	lessonLengthMs?: number;
	/** Link this game to a class — the caller must be one of its teachers */
	classId?: string;
	/** Which beats to run — the classroom counterpart of the civic script */
	flow?: AgoraSessionFlow;
}

/** Sanity bounds on the teacher's flow knobs — a 40-round lesson is a typo */
const FLOW_BOUNDS = {
	MIN_ROUNDS: 1,
	MAX_ROUNDS: AGORA_CYCLE.ROUNDS,
	MIN_RATINGS_PER_ROUND: 1,
	MAX_RATINGS_PER_ROUND: 10,
} as const;

/**
 * Validate and clamp a teacher-supplied session flow. Only fields the teacher
 * actually set survive (mirrors scriptToFlow's sparseness), so an untouched
 * knob still resolves through the mode's legacy defaults.
 */
function sanitizeFlow(flow: AgoraSessionFlow | undefined): AgoraSessionFlow | undefined {
	if (flow === undefined) return undefined;
	const parsed = safeParse(AgoraSessionFlowSchema, flow);
	if (!parsed.success) {
		throw new HttpsError('invalid-argument', 'Invalid session flow');
	}
	const clean = { ...parsed.output };
	if (clean.rounds !== undefined) {
		clean.rounds = Math.min(
			FLOW_BOUNDS.MAX_ROUNDS,
			Math.max(FLOW_BOUNDS.MIN_ROUNDS, Math.round(clean.rounds)),
		);
	}
	if (clean.ratingsPerRound !== undefined) {
		clean.ratingsPerRound = Math.min(
			FLOW_BOUNDS.MAX_RATINGS_PER_ROUND,
			Math.max(FLOW_BOUNDS.MIN_RATINGS_PER_ROUND, Math.round(clean.ratingsPerRound)),
		);
	}

	return Object.keys(clean).length > 0 ? clean : undefined;
}

interface Result {
	sessionId: string;
	code: string;
}

/**
 * Teacher opens a classroom session for a ready topic package. Creates the
 * session root Statement + the challenge-question Statement (so the wizcol
 * evaluation pipeline works unchanged) and the AgoraSession doc.
 */
export const agoraCreateSession = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<Request>): Promise<Result> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		if (request.auth?.token.firebase.sign_in_provider === 'anonymous') {
			throw new HttpsError('permission-denied', 'Teachers must sign in with a full account');
		}

		const { topicPackageId, deviceMode, teamSizeMax, lessonLengthMs, classId, flow } =
			request.data ?? {};
		if (!topicPackageId || typeof topicPackageId !== 'string') {
			throw new HttpsError('invalid-argument', 'topicPackageId is required');
		}
		if (!Object.values(AgoraDeviceMode).includes(deviceMode)) {
			throw new HttpsError('invalid-argument', 'deviceMode must be individual or team');
		}
		const resolvedTeamSize = teamSizeMax ?? AGORA_SESSION.TEAM_SIZE_MAX;
		if (
			resolvedTeamSize < AGORA_SESSION.TEAM_SIZE_MIN ||
			resolvedTeamSize > AGORA_SESSION.TEAM_SIZE_MAX
		) {
			throw new HttpsError('invalid-argument', 'teamSizeMax out of range');
		}

		try {
			const topicSnap = await db
				.collection(Collections.agoraTopicPackages)
				.doc(topicPackageId)
				.get();
			if (!topicSnap.exists) {
				throw new HttpsError('not-found', 'Topic package not found');
			}
			const topic = topicSnap.data() as AgoraTopicPackage;
			if (topic.status !== AgoraTopicStatus.ready) {
				throw new HttpsError('failed-precondition', 'Topic package is not ready');
			}

			// A class game must be opened by one of the class's own teachers; a
			// guest game (no classId) stays exactly what sessions have always been.
			let schoolId: string | undefined;
			if (classId !== undefined) {
				if (typeof classId !== 'string' || !classId) {
					throw new HttpsError('invalid-argument', 'classId must be a string');
				}
				const classSnap = await db.collection(Collections.agoraClasses).doc(classId).get();
				const agoraClass = classSnap.data() as AgoraClass | undefined;
				if (!agoraClass || agoraClass.status !== 'active') {
					throw new HttpsError('failed-precondition', 'Class not found or archived');
				}
				if (!agoraClass.teacherIds.includes(uid)) {
					throw new HttpsError(
						'permission-denied',
						'Only a teacher of this class can open a game for it',
					);
				}
				schoolId = agoraClass.schoolId;
			}

			const sessionFlow = sanitizeFlow(flow);

			const token = request.auth?.token as Record<string, unknown> | undefined;
			const creator = {
				uid,
				displayName: typeof token?.name === 'string' ? token.name : 'Teacher',
				email: typeof token?.email === 'string' ? token.email : null,
				photoURL: typeof token?.picture === 'string' ? token.picture : null,
				isAnonymous: false,
			};

			const sessionId = getRandomUID();

			const rootStatement = createStatementObject({
				statement: topic.title,
				statementType: StatementType.question,
				parentId: 'top',
				topParentId: 'top',
				creatorId: uid,
				creator,
				sourceApp: SourceApp.AGORA,
				agoraSessionId: sessionId,
			});
			if (!rootStatement) {
				throw new HttpsError('internal', 'Failed to build root statement');
			}

			const challengeStatement = createStatementObject({
				statement: topic.challengeQuestion,
				statementType: StatementType.question,
				parentId: rootStatement.statementId,
				topParentId: rootStatement.statementId,
				creatorId: uid,
				creator,
				sourceApp: SourceApp.AGORA,
				agoraSessionId: sessionId,
			});
			if (!challengeStatement) {
				throw new HttpsError('internal', 'Failed to build challenge statement');
			}

			const code = await generateUniqueCode();
			const now = Date.now();

			const session: AgoraSession = {
				sessionId,
				code,
				topicPackageId,
				teacherId: uid,
				rootStatementId: rootStatement.statementId,
				challengeQuestionId: challengeStatement.statementId,
				deviceMode,
				teamSizeMax: resolvedTeamSize,
				...(classId && schoolId ? { classId, schoolId } : {}),
				...(sessionFlow ? { flow: sessionFlow } : {}),
				stage: AgoraStage.lobby,
				roundNumber: 0,
				participantCount: 0,
				status: AgoraSessionStatus.open,
				lessonEndsAt: now + (lessonLengthMs ?? AGORA_SESSION.DEFAULT_LESSON_MS),
				createdAt: now,
				lastUpdate: now,
			};

			const batch = db.batch();
			batch.set(
				db.collection(Collections.statements).doc(rootStatement.statementId),
				rootStatement,
			);
			batch.set(
				db.collection(Collections.statements).doc(challengeStatement.statementId),
				challengeStatement,
			);
			batch.set(db.collection(Collections.agoraSessions).doc(sessionId), session);

			// Seed the characters' synthetic AI rater identities — each character
			// reviews proposals "as if they were 3 participants". Their participant
			// docs must exist (with a camp) before their first evaluation, because
			// the bridging trigger resolves camps server-side. Excluded everywhere
			// from participantCount and student-only metrics via isAI.
			for (const character of topic.characters) {
				const campPosition =
					character.characterId === topic.positioningScale.rightCharacterId
						? AGORA_AI_REVIEW.RIGHT_CAMP_POSITION
						: AGORA_AI_REVIEW.LEFT_CAMP_POSITION;
				for (let index = 1; index <= AGORA_AI_REVIEW.RATERS_PER_CHARACTER; index++) {
					const aiUid = createAgoraAiRaterUid(character.characterId, index);
					const aiParticipant: AgoraParticipant = {
						participantId: createAgoraParticipantId(sessionId, aiUid),
						sessionId,
						userId: aiUid,
						anonName: character.name,
						isAI: true,
						campPosition,
						camp: deriveCamp(campPosition),
						points: { valueAccuracy: 0, proposals: 0, helping: 0, total: 0 },
						joinedAt: now,
						lastActive: now,
					};
					batch.set(
						db.collection(Collections.agoraParticipants).doc(aiParticipant.participantId),
						aiParticipant,
					);
				}
			}

			await batch.commit();

			return { sessionId, code };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.createSession',
				userId: uid,
				metadata: { topicPackageId },
			});
			throw new HttpsError('internal', 'Failed to create session');
		}
	},
);
