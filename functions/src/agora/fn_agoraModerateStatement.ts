import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../db';
import {
	Collections,
	AgoraMessageKind,
	AgoraModeration,
	AgoraSession,
	AgoraStage,
	AgoraTeacherMessage,
	AGORA_LIMITS,
	AGORA_TEACHER_MESSAGE,
	ModerateStatementRequest,
	ModerateStatementResponse,
	NotificationTriggerType,
	createAgoraParticipantId,
	functionConfig,
	isAgoraAiUid,
	isAgoraHidden,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { fileThreadLine, notifyStudent } from './teacherThread';

/** The fields of a student's statement this callable reads or rewrites */
interface ModeratedStatement {
	statementId?: string;
	statement?: string;
	creatorId?: string;
	agoraSessionId?: string;
	agoraMessageKind?: string;
	agoraChallenge?: boolean;
	agoraModeration?: AgoraModeration;
	hide?: boolean;
}

/**
 * The session teacher's hand on a student's text: take it down, put it
 * back, or reword it — plus two housekeeping actions (blank an offensive
 * look name, forget the real names now).
 *
 * Why a callable and not a rule: hiding has to blank the text on a
 * world-readable document, mirror a flag onto the score doc, tuck the words
 * away where only the author can read them, and tell the author — one
 * batch, one place. And the proposal trigger tells a teacher's write apart
 * from a student's by the moderation clocks this function stamps, so the
 * student is never paid revision credit for the teacher's wording.
 */
export const agoraModerateStatement = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<ModerateStatementRequest>,
	): Promise<ModerateStatementResponse> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		if (request.auth?.token.firebase.sign_in_provider === 'anonymous') {
			throw new HttpsError('permission-denied', 'Teachers must sign in with a full account');
		}
		const { sessionId, action, statementId, reason, text, studentUid } = request.data ?? {};
		if (!sessionId || typeof sessionId !== 'string') {
			throw new HttpsError('invalid-argument', 'sessionId is required');
		}

		try {
			const sessionRef = db.collection(Collections.agoraSessions).doc(sessionId);
			const session = (await sessionRef.get()).data() as AgoraSession | undefined;
			if (!session) {
				throw new HttpsError('not-found', 'Session not found');
			}
			if (session.teacherId !== uid) {
				throw new HttpsError('permission-denied', 'Only the session teacher may moderate');
			}
			const now = Date.now();

			if (action === 'forgetNames') {
				const identities = await db
					.collection(Collections.agoraIdentities)
					.where('sessionId', '==', sessionId)
					.get();
				const batch = db.batch();
				identities.docs.forEach((snap) => batch.delete(snap.ref));
				await batch.commit();

				return { ok: true };
			}

			if (action === 'clearLookName') {
				if (!studentUid || typeof studentUid !== 'string') {
					throw new HttpsError('invalid-argument', 'studentUid is required');
				}
				const batch = db.batch();
				batch.update(
					db
						.collection(Collections.agoraParticipants)
						.doc(createAgoraParticipantId(sessionId, studentUid)),
					{ builtTheme: FieldValue.delete(), theme: FieldValue.delete(), lastActive: now },
				);
				// A crowned look carries its maker's name on the room itself
				if (session.theme?.custom?.authorId === studentUid) {
					batch.update(sessionRef, { theme: FieldValue.delete(), lastUpdate: now });
				}
				await batch.commit();

				return { ok: true };
			}

			if (!statementId || typeof statementId !== 'string') {
				throw new HttpsError('invalid-argument', 'statementId is required');
			}
			const statementRef = db.collection(Collections.statements).doc(statementId);
			const statement = (await statementRef.get()).data() as ModeratedStatement | undefined;
			if (!statement || statement.agoraSessionId !== sessionId) {
				throw new HttpsError('not-found', 'Statement not found in this session');
			}
			if (
				statement.agoraMessageKind === AgoraMessageKind.edit ||
				statement.agoraMessageKind === AgoraMessageKind.award
			) {
				throw new HttpsError('failed-precondition', 'system-line');
			}
			const authorUid = statement.creatorId ?? '';
			if (!authorUid || isAgoraAiUid(authorUid)) {
				throw new HttpsError('failed-precondition', 'not-a-student');
			}
			const scoreRef = db.collection(Collections.agoraScores).doc(statementId);
			const scoreExists = (await scoreRef.get()).exists;
			const isLivePitch =
				statement.agoraChallenge === true &&
				session.votingGame?.challengerStatementId === statementId;
			const moderation: AgoraModeration = statement.agoraModeration ?? { hidden: false };

			if (action === 'hide') {
				if (isAgoraHidden(statement)) return { ok: true, hidden: true };
				// The ballot is a frozen snapshot the rules pin; the teacher
				// closes the vote first, then takes the text down.
				if (
					session.stage === AgoraStage.voting &&
					session.voting?.candidateIds.includes(statementId)
				) {
					throw new HttpsError('failed-precondition', 'on-ballot');
				}
				const removedText = statement.statement ?? '';
				const why =
					typeof reason === 'string'
						? reason.trim().slice(0, AGORA_TEACHER_MESSAGE.MAX_REASON)
						: '';

				const batch = db.batch();
				batch.update(statementRef, {
					statement: '',
					hide: true,
					agoraModeration: { ...moderation, hidden: true, hiddenAt: now },
					lastUpdate: now,
				});
				if (scoreExists) batch.update(scoreRef, { hidden: true, lastUpdate: now });
				// The edit announcements under a proposal quote its earlier
				// wording — they go dark with it, and stay dark.
				const edits = await db
					.collection(Collections.statements)
					.where('parentId', '==', statementId)
					.where('agoraMessageKind', '==', AgoraMessageKind.edit)
					.get();
				edits.docs.forEach((snap) =>
					batch.update(snap.ref, {
						statement: '',
						agoraPreviousText: '',
						hide: true,
						agoraModeration: { hidden: true, hiddenAt: now },
						lastUpdate: now,
					}),
				);
				if (isLivePitch) {
					batch.update(sessionRef, { 'votingGame.challengerStatement': '', lastUpdate: now });
				}
				await batch.commit();

				const messageId = await fileThreadLine({
					sessionId,
					teacherId: uid,
					studentUid: authorUid,
					from: 'teacher',
					kind: 'moderation',
					text: why,
					aboutStatementId: statementId,
					moderation: 'hidden',
					removedText,
				});
				await notifyStudent(
					sessionId,
					authorUid,
					uid,
					NotificationTriggerType.AGORA_TEACHER_HIDDEN,
					messageId,
					statementId,
				);

				return { ok: true, hidden: true };
			}

			if (action === 'restore') {
				if (!isAgoraHidden(statement)) return { ok: true, hidden: false };
				// The words came off the document when it was hidden; the only
				// copy is the notice filed to the author.
				const notices = await db
					.collection(Collections.agoraTeacherMessages)
					.where('sessionId', '==', sessionId)
					.where('aboutStatementId', '==', statementId)
					.where('moderation', '==', 'hidden')
					.get();
				const latest = notices.docs
					.map((snap) => snap.data() as AgoraTeacherMessage)
					.sort((a, b) => b.createdAt - a.createdAt)[0];
				if (!latest) {
					throw new HttpsError('failed-precondition', 'nothing-to-restore');
				}
				const restoredText = latest.removedText ?? '';

				const batch = db.batch();
				batch.update(statementRef, {
					statement: restoredText,
					hide: false,
					agoraModeration: { ...moderation, hidden: false, restoredAt: now },
					lastUpdate: now,
				});
				if (scoreExists) batch.update(scoreRef, { hidden: false, lastUpdate: now });
				if (isLivePitch) {
					batch.update(sessionRef, {
						'votingGame.challengerStatement': restoredText,
						lastUpdate: now,
					});
				}
				await batch.commit();

				const messageId = await fileThreadLine({
					sessionId,
					teacherId: uid,
					studentUid: authorUid,
					from: 'teacher',
					kind: 'moderation',
					text: '',
					aboutStatementId: statementId,
					moderation: 'restored',
				});
				await notifyStudent(
					sessionId,
					authorUid,
					uid,
					NotificationTriggerType.AGORA_TEACHER_RESTORED,
					messageId,
					statementId,
				);

				return { ok: true, hidden: false };
			}

			if (action === 'edit') {
				if (isAgoraHidden(statement)) {
					throw new HttpsError('failed-precondition', 'hidden');
				}
				const wording = typeof text === 'string' ? text.trim() : '';
				if (wording.length === 0 || wording.length > AGORA_LIMITS.MAX_PROPOSAL_LENGTH) {
					throw new HttpsError('invalid-argument', 'text out of range');
				}
				const previousText = statement.statement ?? '';
				if (wording === previousText) return { ok: true };
				const why =
					typeof reason === 'string'
						? reason.trim().slice(0, AGORA_TEACHER_MESSAGE.MAX_REASON)
						: '';

				const batch = db.batch();
				batch.update(statementRef, {
					statement: wording,
					agoraModeration: { ...moderation, editedAt: now },
					lastUpdate: now,
				});
				if (isLivePitch) {
					batch.update(sessionRef, { 'votingGame.challengerStatement': wording, lastUpdate: now });
				}
				await batch.commit();

				const messageId = await fileThreadLine({
					sessionId,
					teacherId: uid,
					studentUid: authorUid,
					from: 'teacher',
					kind: 'moderation',
					text: why,
					aboutStatementId: statementId,
					moderation: 'edited',
					removedText: previousText,
				});
				await notifyStudent(
					sessionId,
					authorUid,
					uid,
					NotificationTriggerType.AGORA_TEACHER_EDITED,
					messageId,
					statementId,
				);

				return { ok: true };
			}

			throw new HttpsError('invalid-argument', 'Unknown action');
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			// Ids only — never the text or the reason
			logError(error, {
				operation: 'agora.moderateStatement',
				userId: uid,
				statementId: typeof statementId === 'string' ? statementId : undefined,
				metadata: { sessionId, action },
			});
			throw new HttpsError('internal', 'Failed to moderate');
		}
	},
);
