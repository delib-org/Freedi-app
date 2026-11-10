/**
 * Every new answer written by the main app gets one server-side language check.
 * A flagged answer is hidden, marked and its author told once; nothing is deleted.
 *
 * Kept out of statementDispatch on purpose: that dispatcher takes no AI calls.
 * Fails open: if the check cannot answer, the answer stays visible and it is logged.
 */

import { isDeepStrictEqual } from 'node:util';
import { FirestoreEvent, QueryDocumentSnapshot } from 'firebase-functions/v2/firestore';
import {
	AnswerModeration,
	ANSWER_MODERATION_REASON,
	Collections,
	SourceApp,
	Statement,
	StatementType,
	User,
} from '@freedi/shared-types';
import { db } from '../db';
import { assessLanguage } from '../fn_profanityChecker';
import { logError } from '../utils/errorHandling';
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
export function answerFullText(answer: Statement): string {
	const paragraphs = (answer.paragraphs ?? []).map((paragraph) => paragraph.content);

	return [answer.statement, ...paragraphs].filter(Boolean).join('\n');
}

/** Whatever lies past the limit goes unchecked, so it has to be countable. Lengths only. */
function logTruncatedCheck(answer: Statement, totalCharacters: number): void {
	console.info('moderateNewAnswer: checked only the start of a long answer', {
		statementId: answer.statementId,
		totalCharacters,
		checkedCharacters: MAX_CHECKED_CHARACTERS,
	});
}

/** The body lines onStatementCreated moves into paragraph children when it splits a title. */
function splitBodyLines(title: string): string[] {
	return title
		.split('\n')
		.slice(1)
		.filter((line) => line.trim());
}

/** The title splitStatementIntoParagraphs leaves behind for this created text. */
function splitTitle(title: string): string {
	return title.split('\n')[0].trim();
}

/**
 * Whether the words the verdict was given on are still the words on the
 * document. The split that onStatementCreated runs on every multi-line title
 * rewrites `statement` to its first line, usually before the AI answers, so
 * that exact rewrite is not a change. Any other edit, a shortened title
 * included, is one.
 */
function isSameTextAsCreated(created: Statement, current: Statement): boolean {
	const isSameTitle =
		current.statement === created.statement ||
		(splitBodyLines(created.statement).length > 0 &&
			current.statement === splitTitle(created.statement));

	return isSameTitle && isDeepStrictEqual(current.paragraphs, created.paragraphs);
}

/**
 * The current words of an edited answer. Once the split has run (it writes
 * `description`), the later lines live in child statements, so they are taken
 * from the creation snapshot: re-checking the first line alone would let an
 * edit to it clear abusive text further down.
 */
function editedAnswerText(created: Statement, current: Statement): string {
	const wasSplit = !created.description && Boolean(current.description);
	const body = wasSplit ? splitBodyLines(created.statement) : [];

	return [answerFullText(current), ...body].filter(Boolean).join('\n');
}

/** Cuts the text to what one AI call may see, and records when that loses some of it. */
function limitCheckedText(answer: Statement, fullText: string): string {
	if (fullText.length > MAX_CHECKED_CHARACTERS) logTruncatedCheck(answer, fullText.length);

	return fullText.substring(0, MAX_CHECKED_CHARACTERS);
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

interface NoticeContext {
	language: AnswerHiddenLanguage;
	questionTitle?: string;
}

/** A failed read loses only the language or the question's title, never the notice. */
async function readNoticeContext(answer: Statement, text: string): Promise<NoticeContext> {
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

interface HoldRequest {
	answer: Statement;
	eventId: string;
	noticeContext: NoticeContext;
}

/**
 * Hide, mark and notify in one transaction, so a redelivered event finds its
 * own marker and does nothing, even if a host restored the answer in between.
 * The marker is compared by event id because a marker already on the document
 * at creation would be the client's and proves nothing.
 *
 * `hide` or `integratedInto` appearing during the wait does not stop it: an
 * unmarked answer would come back when a cluster is later reversed or dissolved.
 *
 * Returns the document, unwritten, when `verdictApplies` says its words moved on.
 */
async function holdAnswer(
	{ answer, eventId, noticeContext }: HoldRequest,
	verdictApplies: (current: Statement) => boolean,
): Promise<Statement | undefined> {
	const answerRef = db.collection(Collections.statements).doc(answer.statementId);
	const noticeRef = db
		.collection(Collections.inAppNotifications)
		.doc(answerHiddenNoticeId(answer.statementId));

	return db.runTransaction(async (transaction) => {
		const current = await transaction.get(answerRef);
		const currentAnswer = current.data() as Statement | undefined;
		if (!currentAnswer || currentAnswer.answerModeration?.eventId === eventId) return undefined;
		if (!verdictApplies(currentAnswer)) return currentAnswer;

		const now = Date.now();
		const marker: AnswerModeration = {
			reason: ANSWER_MODERATION_REASON,
			hiddenAt: now,
			eventId,
		};
		transaction.update(answerRef, {
			hide: true,
			answerModeration: marker,
			lastUpdate: now,
		});
		transaction.set(noticeRef, buildAnswerHiddenNotice({ answer, ...noticeContext, now }));

		return undefined;
	});
}

/**
 * A flagged answer is held unless its words really changed during the wait.
 * Then the current words get one more check, and at most one: if they flag too,
 * the answer is held even if it was edited yet again, because two flagged
 * versions in a few seconds is not a change of heart.
 */
async function holdFlaggedAnswer(answer: Statement, eventId: string, text: string): Promise<void> {
	const request = { answer, eventId, noticeContext: await readNoticeContext(answer, text) };
	const editedAnswer = await holdAnswer(request, (current) => isSameTextAsCreated(answer, current));
	if (!editedAnswer) return;

	const editedText = limitCheckedText(answer, editedAnswerText(answer, editedAnswer));
	if (!editedText || !(await isAnswerFlagged(editedText, answer))) {
		console.info('moderateNewAnswer: edited during the check, left visible', {
			statementId: answer.statementId,
		});

		return;
	}
	await holdAnswer(request, () => true);
}

export async function moderateNewAnswer(event: AnswerCreatedEvent): Promise<void> {
	const answer = event.data?.data() as Statement | undefined;
	if (!answer || !isNewMainAppAnswer(answer)) return;

	const text = limitCheckedText(answer, answerFullText(answer));
	if (!text || !(await isAnswerFlagged(text, answer))) return;

	try {
		await holdFlaggedAnswer(answer, event.id, text);
	} catch (error) {
		logError(error, {
			operation: OPERATION,
			statementId: answer.statementId,
			userId: answer.creatorId,
			metadata: { outcome: 'flagged-but-hide-failed' },
		});
	}
}
