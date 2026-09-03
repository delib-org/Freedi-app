import { db } from '../db';
import {
	Collections,
	AgoraModerationAction,
	AgoraTeacherMessage,
	AgoraTeacherMessageFrom,
	AgoraTeacherMessageKind,
	NotificationTriggerType,
	SourceApp,
	StatementType,
	getRandomUID,
} from '@freedi/shared-types';

/**
 * The private teacher ↔ student thread, written from two callables
 * (`agoraTeacherMessage`, `agoraModerateStatement`) through one door, so a
 * note and a moderation notice are the same kind of line in the same place.
 *
 * Nothing here ever logs the text: it is a child's words or a teacher's
 * remark about them, and Cloud Logging is not the place for either.
 */
export interface ThreadLine {
	sessionId: string;
	teacherId: string;
	studentUid: string;
	from: AgoraTeacherMessageFrom;
	kind: AgoraTeacherMessageKind;
	text: string;
	presetKey?: string;
	aboutStatementId?: string;
	moderation?: AgoraModerationAction;
	removedText?: string;
}

export async function fileThreadLine(line: ThreadLine): Promise<string> {
	const messageId = getRandomUID();
	const message: AgoraTeacherMessage = {
		messageId,
		sessionId: line.sessionId,
		teacherId: line.teacherId,
		studentUid: line.studentUid,
		from: line.from,
		kind: line.kind,
		text: line.text,
		...(line.presetKey ? { presetKey: line.presetKey } : {}),
		...(line.aboutStatementId ? { aboutStatementId: line.aboutStatementId } : {}),
		...(line.moderation ? { moderation: line.moderation } : {}),
		...(line.removedText !== undefined ? { removedText: line.removedText } : {}),
		createdAt: Date.now(),
	};
	await db.collection(Collections.agoraTeacherMessages).doc(messageId).set(message);

	return messageId;
}

/** How many lines the thread already holds — the cap is on the thread, not the sender */
export async function threadLength(sessionId: string, studentUid: string): Promise<number> {
	const snap = await db
		.collection(Collections.agoraTeacherMessages)
		.where('sessionId', '==', sessionId)
		.where('studentUid', '==', studentUid)
		.count()
		.get();

	return snap.data().count;
}

/**
 * The toast on the student's phone. Same shape as every other Agora
 * notification (see notifyOwner in fn_onAgoraProposal): the client filters
 * on sourceApp + triggerType, and `agoraMessageId` lets it land on the line.
 */
export async function notifyStudent(
	sessionId: string,
	studentUid: string,
	teacherId: string,
	triggerType: NotificationTriggerType,
	messageId: string,
	statementId?: string,
): Promise<void> {
	const notificationId = getRandomUID();
	await db
		.collection(Collections.inAppNotifications)
		.doc(notificationId)
		.set({
			notificationId,
			userId: studentUid,
			parentId: statementId ?? sessionId,
			statementId: statementId ?? sessionId,
			statementType: StatementType.option,
			// Never the note itself: the toast says "your teacher wrote to you"
			// in the student's language, and the words wait in the thread.
			text: '',
			creatorId: teacherId,
			creatorName: 'The teacher',
			sourceApp: SourceApp.AGORA,
			triggerType,
			targetPath: `/play/${sessionId}`,
			agoraMessageId: messageId,
			read: false,
			createdAt: Date.now(),
		});
}
