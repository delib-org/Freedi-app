import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	StatementType,
	createStatementObject,
	functionConfig,
	getRandomUID,
	AgoraDeviceMode,
	AgoraSession,
	AgoraSessionStatus,
	AgoraStage,
	AgoraTopicPackage,
	AgoraTopicStatus,
	AGORA_SESSION,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';

interface Request {
	topicPackageId: string;
	deviceMode: AgoraDeviceMode;
	teamSizeMax?: number;
	lessonLengthMs?: number;
}

interface Result {
	sessionId: string;
	code: string;
}

async function generateUniqueCode(): Promise<string> {
	const { JOIN_CODE_LENGTH, JOIN_CODE_ALPHABET } = AGORA_SESSION;
	const MAX_ATTEMPTS = 10;

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		let code = '';
		for (let index = 0; index < JOIN_CODE_LENGTH; index++) {
			code += JOIN_CODE_ALPHABET[Math.floor(Math.random() * JOIN_CODE_ALPHABET.length)];
		}

		const existing = await db
			.collection(Collections.agoraSessions)
			.where('code', '==', code)
			.where('status', 'in', [AgoraSessionStatus.open, AgoraSessionStatus.live])
			.limit(1)
			.get();

		if (existing.empty) return code;
	}

	throw new HttpsError('resource-exhausted', 'Could not generate a unique join code');
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

		const { topicPackageId, deviceMode, teamSizeMax, lessonLengthMs } = request.data ?? {};
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
				rootStatement
			);
			batch.set(
				db.collection(Collections.statements).doc(challengeStatement.statementId),
				challengeStatement
			);
			batch.set(db.collection(Collections.agoraSessions).doc(sessionId), session);
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
	}
);
