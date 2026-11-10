/**
 * Every new answer written by the main app gets one server-side language check.
 * A flagged answer is hidden, marked and its author told once; nothing is deleted.
 *
 * Kept out of statementDispatch on purpose: that dispatcher takes no AI calls.
 * Fails open: if the check cannot answer, the answer stays visible and it is logged.
 */

import { FirestoreEvent, QueryDocumentSnapshot } from 'firebase-functions/v2/firestore';
import { Collections, SourceApp, Statement, StatementType, User } from '@freedi/shared-types';
import { db } from '../db';
import { assessLanguage } from '../fn_profanityChecker';
import { logError } from '../utils/errorHandling';
import {
	AnswerModerationMarker,
	ANSWER_MODERATION_FIELD,
	ANSWER_MODERATION_REASON,
	isSameModerationEvent,
} from './answerModerationMarker';
import {
	AnswerHiddenLanguage,
	answerHiddenNoticeId,
	buildAnswerHiddenNotice,
	pickAnswerHiddenLanguage,
} from './answerHiddenNotice';

const OPERATION = 'moderation.moderateNewAnswer';

/** Well under the trigger's 60 s limit, and past the model's normal answer time. */
const CHECK_TIMEOUT_MS = 30_000;

/** Bounds the cost of one AI call; Firestore alone would allow about 1 MB of text. */
const MAX_CHECKED_CHARACTERS = 5_000;

type AnswerCreatedEvent = FirestoreEvent<
	QueryDocumentSnapshot | undefined,
	{ statementId: string }
>;

/**
 * Strict on `sourceApp`: Mass Consensus and other apps write options with no
 * `sourceApp`, so the wider isMainAppStatement() would pull them in too.
 */
export function isNewMainAppAnswer(statement: Statement): boolean {
	return statement.statementType === StatementType.option && statement.sourceApp === SourceApp.MAIN;
}

/** The title and the description paragraphs, as one text for one AI call. */
export function answerTextToCheck(answer: Statement): string {
	const paragraphs = (answer.paragraphs ?? []).map((paragraph) => paragraph.content);

	return [answer.statement, ...paragraphs]
		.filter(Boolean)
		.join('\n')
		.substring(0, MAX_CHECKED_CHARACTERS);
}

function rejectAfterTimeout(
	onTimer: (timer: ReturnType<typeof setTimeout>) => void,
): Promise<never> {
	return new Promise((_resolve, reject) => {
		onTimer(
			setTimeout(
				() => reject(new Error(`Language check timed out after ${CHECK_TIMEOUT_MS} ms`)),
				CHECK_TIMEOUT_MS,
			),
		);
	});
}

/** Answers "should this be hidden"; any failure is a logged "no". */
async function isAnswerFlagged(text: string, answer: Statement): Promise<boolean> {
	let timer: ReturnType<typeof setTimeout> | undefined;

	try {
		return await Promise.race([
			assessLanguage(text),
			rejectAfterTimeout((started) => {
				timer = started;
			}),
		]);
	} catch (error) {
		logError(error, {
			operation: OPERATION,
			statementId: answer.statementId,
			userId: answer.creatorId,
			metadata: { outcome: 'check-failed-answer-left-visible' },
		});

		return false;
	} finally {
		clearTimeout(timer);
	}
}

/** A failed read loses only the language or the question's title, never the notice. */
async function readNoticeContext(
	answer: Statement,
	text: string,
): Promise<{ language: AnswerHiddenLanguage; questionTitle?: string }> {
	try {
		const [authorSnap, questionSnap] = await Promise.all([
			db.collection(Collections.users).doc(answer.creatorId).get(),
			db.collection(Collections.statements).doc(answer.parentId).get(),
		]);
		const storedLanguage = (authorSnap.data() as User | undefined)?.defaultLanguage;
		const questionTitle = (questionSnap.data() as Statement | undefined)?.statement;

		return { language: pickAnswerHiddenLanguage(storedLanguage, text), questionTitle };
	} catch (error) {
		logError(error, {
			operation: OPERATION,
			statementId: answer.statementId,
			userId: answer.creatorId,
			metadata: { outcome: 'notice-context-read-failed' },
		});

		return { language: pickAnswerHiddenLanguage(undefined, text) };
	}
}

/**
 * Hide, mark and notify in one transaction, so a redelivered event finds its
 * own marker and does nothing, even if a host restored the answer in between.
 * The marker is compared by event id because a marker already on the document
 * at creation would be the client's and proves nothing.
 */
async function hideFlaggedAnswer(answer: Statement, eventId: string, text: string): Promise<void> {
	const { language, questionTitle } = await readNoticeContext(answer, text);
	const answerRef = db.collection(Collections.statements).doc(answer.statementId);
	const noticeRef = db
		.collection(Collections.inAppNotifications)
		.doc(answerHiddenNoticeId(answer.statementId));

	await db.runTransaction(async (transaction) => {
		const current = await transaction.get(answerRef);
		const currentAnswer = current.data();
		if (!currentAnswer || isSameModerationEvent(currentAnswer, eventId)) return;

		const now = Date.now();
		const marker: AnswerModerationMarker = {
			reason: ANSWER_MODERATION_REASON,
			hiddenAt: now,
			eventId,
		};
		transaction.update(answerRef, {
			hide: true,
			[ANSWER_MODERATION_FIELD]: marker,
			lastUpdate: now,
		});
		transaction.set(noticeRef, buildAnswerHiddenNotice({ answer, language, questionTitle, now }));
	});
}

export async function moderateNewAnswer(event: AnswerCreatedEvent): Promise<void> {
	const answer = event.data?.data() as Statement | undefined;
	if (!answer || !isNewMainAppAnswer(answer)) return;

	const text = answerTextToCheck(answer);
	if (!text || !(await isAnswerFlagged(text, answer))) return;

	try {
		await hideFlaggedAnswer(answer, event.id, text);
	} catch (error) {
		logError(error, {
			operation: OPERATION,
			statementId: answer.statementId,
			userId: answer.creatorId,
			metadata: { outcome: 'flagged-but-hide-failed' },
		});
	}
}
