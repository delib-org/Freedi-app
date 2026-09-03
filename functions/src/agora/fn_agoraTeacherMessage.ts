import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	AgoraParticipant,
	AgoraSession,
	AGORA_TEACHER_MESSAGE,
	NotificationTriggerType,
	TeacherMessageRequest,
	TeacherMessageResponse,
	createAgoraParticipantId,
	functionConfig,
	isAgoraTeacherPreset,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { fileThreadLine, notifyStudent, threadLength } from './teacherThread';

/**
 * One line into the private thread between the teacher and one student.
 *
 * Both directions come through here rather than through rules: an append
 * into a shared collection cannot be expressed as a rule that also caps the
 * thread and pins both listener keys, and a callable can refuse politely.
 * The teacher names the student; a student's reply can only land in their
 * own thread, whatever the request says.
 */
export const agoraTeacherMessage = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<TeacherMessageRequest>): Promise<TeacherMessageResponse> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		const { sessionId, studentUid, text, presetKey, aboutStatementId } = request.data ?? {};
		if (!sessionId || typeof sessionId !== 'string') {
			throw new HttpsError('invalid-argument', 'sessionId is required');
		}

		try {
			const sessionSnap = await db.collection(Collections.agoraSessions).doc(sessionId).get();
			const session = sessionSnap.data() as AgoraSession | undefined;
			if (!session) {
				throw new HttpsError('not-found', 'Session not found');
			}

			const isTeacher =
				session.teacherId === uid && request.auth?.token.firebase.sign_in_provider !== 'anonymous';

			// Who the thread belongs to. A teacher says; a student IS.
			let target: string;
			if (isTeacher) {
				if (!studentUid || typeof studentUid !== 'string') {
					throw new HttpsError('invalid-argument', 'studentUid is required');
				}
				target = studentUid;
			} else {
				target = uid;
			}
			const participantSnap = await db
				.collection(Collections.agoraParticipants)
				.doc(createAgoraParticipantId(sessionId, target))
				.get();
			const participant = participantSnap.data() as AgoraParticipant | undefined;
			if (!participant || participant.isAI) {
				throw new HttpsError(
					isTeacher ? 'not-found' : 'permission-denied',
					'Not a student of this session',
				);
			}

			// A quick phrase is the teacher's shortcut; a student always types.
			let body = typeof text === 'string' ? text.trim() : '';
			let preset: string | undefined;
			if (presetKey !== undefined) {
				if (!isTeacher || !isAgoraTeacherPreset(presetKey)) {
					throw new HttpsError('invalid-argument', 'Unknown preset');
				}
				preset = presetKey;
			}
			if (!preset && body.length === 0) {
				throw new HttpsError('invalid-argument', 'text is required');
			}
			if (body.length > AGORA_TEACHER_MESSAGE.MAX_TEXT) {
				body = body.slice(0, AGORA_TEACHER_MESSAGE.MAX_TEXT);
			}
			if (aboutStatementId !== undefined && typeof aboutStatementId !== 'string') {
				throw new HttpsError('invalid-argument', 'aboutStatementId must be a string');
			}

			if ((await threadLength(sessionId, target)) >= AGORA_TEACHER_MESSAGE.MAX_PER_THREAD) {
				throw new HttpsError('resource-exhausted', 'thread-full');
			}

			const messageId = await fileThreadLine({
				sessionId,
				teacherId: session.teacherId,
				studentUid: target,
				from: isTeacher ? 'teacher' : 'student',
				kind: isTeacher ? 'note' : 'reply',
				text: body,
				...(preset ? { presetKey: preset } : {}),
				...(isTeacher && aboutStatementId ? { aboutStatementId } : {}),
			});

			// The student's phone rings; the teacher's console is already listening.
			if (isTeacher) {
				await notifyStudent(
					sessionId,
					target,
					session.teacherId,
					NotificationTriggerType.AGORA_TEACHER_NOTE,
					messageId,
					aboutStatementId,
				);
			}

			return { messageId };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			// Ids only — never the text
			logError(error, {
				operation: 'agora.teacherMessage',
				userId: uid,
				metadata: { sessionId },
			});
			throw new HttpsError('internal', 'Failed to send message');
		}
	},
);
