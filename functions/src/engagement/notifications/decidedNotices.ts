/**
 * The closing notice: when a question reaches the Decided stage, each person
 * who wrote an answer hears once that their answer was part of what the group
 * weighed. In-app only. The deterministic queue id makes a re-delivered trigger,
 * or a host moving the stage back and forth, send nothing new.
 */

import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import {
	Collections,
	NotificationTriggerType,
	QuestionStep,
	StatementType,
} from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import { logError } from '../../utils/errorHandling';
import { readNoticeAudiences } from './noticeAudience';
import { answerPreview, decidedCopy, pickNoticeLanguage } from './noticeText';
import { answerAuthor, buildAnswerNotice, isMainAppStatement } from './socialProofTrigger';

const ALREADY_EXISTS = 6;
const CREATE_CHUNK = 50;

/** All the closing notice needs of each answer. */
export const ANSWER_FIELDS = [
	'statement',
	'statementType',
	'creator.uid',
	'hide',
	'isCluster',
	'sourceApp',
	'classTable',
] as const;

export function isDecidedTransition(before: Statement, after: Statement): boolean {
	return (
		after.statementType === StatementType.question &&
		isMainAppStatement(after) &&
		after.questionSettings?.currentStep === QuestionStep.finished &&
		before.questionSettings?.currentStep !== QuestionStep.finished
	);
}

async function answersByAuthor(
	db: Firestore,
	questionId: string,
): Promise<Map<string, Statement[]>> {
	const snapshot = await db
		.collection(Collections.statements)
		.where('parentId', '==', questionId)
		.where('statementType', '==', StatementType.option)
		.select(...ANSWER_FIELDS)
		.get();

	const byAuthor = new Map<string, Statement[]>();
	snapshot.docs.forEach((doc) => {
		const answer = doc.data() as Statement;
		const authorId = answerAuthor(answer);
		if (!authorId) return;
		byAuthor.set(authorId, [...(byAuthor.get(authorId) ?? []), answer]);
	});

	return byAuthor;
}

/** Queues one author's notice. A notice that already exists is success, not an error. */
async function createOnce(
	db: Firestore,
	queueItemId: string,
	notice: ReturnType<typeof buildAnswerNotice>,
): Promise<void> {
	try {
		await db.collection(Collections.notificationQueue).doc(queueItemId).create(notice);
	} catch (error) {
		if ((error as { code?: unknown } | null)?.code === ALREADY_EXISTS) return;
		logError(error, {
			operation: 'engagement.sendDecidedNotices',
			userId: notice.userId,
			statementId: notice.statementId,
		});
	}
}

/**
 * Called on every statement update, so it must stay a plain comparison unless
 * this update is the one that moved the question to Decided. Never throws.
 */
export async function sendDecidedNoticesOnStageChange(
	before: Statement,
	after: Statement,
): Promise<void> {
	if (!isDecidedTransition(before, after)) return;

	const questionId = after.statementId;

	try {
		const db = getFirestore();
		const now = Date.now();
		const byAuthor = await answersByAuthor(db, questionId);
		const audiences = await readNoticeAudiences(db, [...byAuthor.keys()]);

		const notices = [...byAuthor.entries()].flatMap(([userId, answers]) => {
			const audience = audiences.get(userId);
			if (!audience?.inAppOn || !audience.answerUpdatesOn) return [];

			const language = pickNoticeLanguage(audience.storedLanguage, answers[0].statement);
			const preview = answers.length === 1 ? answerPreview(answers[0].statement) : undefined;

			return [
				buildAnswerNotice({
					queueItemId: `decided_${questionId}_${userId}`,
					userId,
					copy: decidedCopy(language, preview),
					targetPath: `/statement/${questionId}`,
					triggerType: NotificationTriggerType.CONSENSUS_SHIFT,
					statement: after,
					now,
				}),
			];
		});

		for (let start = 0; start < notices.length; start += CREATE_CHUNK) {
			await Promise.all(
				notices
					.slice(start, start + CREATE_CHUNK)
					.map((notice) => createOnce(db, notice.queueItemId, notice)),
			);
		}
	} catch (error) {
		logError(error, { operation: 'engagement.sendDecidedNotices', statementId: questionId });
	}
}
