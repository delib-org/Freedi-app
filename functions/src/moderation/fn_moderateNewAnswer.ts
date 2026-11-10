/**
 * Server-side language check on main-app answers: when one is created, when its
 * words change, and when a chat message becomes one. A flagged answer is hidden,
 * marked and its author told; nothing is deleted.
 *
 * Paragraph children need no trigger of their own: fn_syncParagraphChildrenToDescription
 * copies their text into the answer's `description`, and that write is an edit here.
 *
 * Kept out of statementDispatch on purpose: that dispatcher takes no AI calls.
 * Fails open: if the check cannot answer, the answer stays visible and it is logged.
 */

import { Change, FirestoreEvent, QueryDocumentSnapshot } from 'firebase-functions/v2/firestore';
import {
	AnswerModeration,
	ANSWER_MODERATION_REASON,
	Collections,
	isAnswerHeldByModeration,
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

/** What generateDescriptionFromChildren ends a shortened description with. */
const PREVIEW_ELLIPSIS = '...';

/** Line breaks, and the ` | ` the title split joins a description with. */
const TEXT_SEPARATORS = /[\s|]+/g;

type AnswerCreatedEvent = FirestoreEvent<
	QueryDocumentSnapshot | undefined,
	{ statementId: string }
>;

type AnswerUpdatedEvent = FirestoreEvent<
	Change<QueryDocumentSnapshot> | undefined,
	{ statementId: string }
>;

/**
 * Strict on `sourceApp`: Mass Consensus and other apps write options with no
 * `sourceApp`, so the wider isMainAppStatement() would pull them in too.
 */
export function isMainAppAnswer(statement: Statement): boolean {
	return statement.statementType === StatementType.option && statement.sourceApp === SourceApp.MAIN;
}

/**
 * The title, description and paragraphs, as one text for one AI call. Tolerates
 * a malformed `paragraphs`: a throw here would skip the check for the whole answer.
 */
export function answerFullText(answer: Statement): string {
	const paragraphs = Array.isArray(answer.paragraphs)
		? answer.paragraphs.map((paragraph) => paragraph?.content)
		: [];

	return [answer.statement, answer.description, ...paragraphs].filter(Boolean).join('\n');
}

/** Whatever lies past the limit goes unchecked, so it has to be countable. Lengths only. */
function logTruncatedCheck(answer: Statement, totalCharacters: number): void {
	console.info('moderateNewAnswer: checked only the start of a long answer', {
		statementId: answer.statementId,
		totalCharacters,
		checkedCharacters: MAX_CHECKED_CHARACTERS,
	});
}

function comparableText(answer: Statement): string {
	return answerFullText(answer).replace(TEXT_SEPARATORS, ' ').trim();
}

/**
 * Only in this direction: a shortened copy adds no words, but text that grows
 * out of something ending in "..." may add any.
 */
function isShortenedCopy(shortened: string, full: string): boolean {
	return (
		shortened.endsWith(PREVIEW_ELLIPSIS) &&
		full.startsWith(shortened.slice(0, -PREVIEW_ELLIPSIS.length).trimEnd())
	);
}

/**
 * Whether `later` still carries the words of `earlier`. The title split that
 * onStatementCreated runs on a multi-line answer moves the later lines into a
 * possibly shortened `description`, and the paragraph sync reformats it; neither
 * is an edit. Any other change of words is one.
 */
function hasSameWords(earlier: Statement, later: Statement): boolean {
	const earlierText = comparableText(earlier);
	const laterText = comparableText(later);

	return earlierText === laterText || isShortenedCopy(laterText, earlierText);
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
 * A verdict is applied only to the words it was given on. If they moved on, the
 * edit that moved them has its own event and its own check, so the last words
 * on the document always get a verdict.
 *
 * The marker is compared by event id so that a redelivered event does nothing,
 * even if a host restored the answer in between.
 */
function verdictApplies(checked: Statement, current: Statement, eventId: string): boolean {
	if (current.answerModeration?.eventId === eventId) return false;
	if (isAnswerHeldByModeration(current)) return false;

	return hasSameWords(checked, current);
}

/**
 * Hide, mark and notify in one transaction.
 *
 * `hide` or `integratedInto` appearing during the wait does not stop it: an
 * unmarked answer would come back when a cluster is later reversed or dissolved.
 */
async function holdAnswer({ answer, eventId, noticeContext }: HoldRequest): Promise<void> {
	const answerRef = db.collection(Collections.statements).doc(answer.statementId);
	const noticeRef = db
		.collection(Collections.inAppNotifications)
		.doc(answerHiddenNoticeId(answer.statementId));

	await db.runTransaction(async (transaction) => {
		const current = await transaction.get(answerRef);
		const currentAnswer = current.data() as Statement | undefined;
		if (!currentAnswer || !verdictApplies(answer, currentAnswer, eventId)) return;

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
	});
}

async function checkAnswer(answer: Statement, eventId: string): Promise<void> {
	const text = limitCheckedText(answer, answerFullText(answer));
	if (!text || !(await isAnswerFlagged(text, answer))) return;

	try {
		await holdAnswer({ answer, eventId, noticeContext: await readNoticeContext(answer, text) });
	} catch (error) {
		logError(error, {
			operation: OPERATION,
			statementId: answer.statementId,
			userId: answer.creatorId,
			metadata: { outcome: 'flagged-but-hide-failed' },
		});
	}
}

/**
 * Runs on every statement update, so it reads only the event's own snapshots.
 * The moderation write, counters and consensus leave the words alone and stop here.
 *
 * An answer already held stays held whatever its words become: the host who
 * restores it sees the current text and decides on that.
 */
export function needsLanguageCheck(before: Statement, after: Statement): boolean {
	if (!isMainAppAnswer(after) || isAnswerHeldByModeration(after)) return false;

	return before.statementType !== StatementType.option || !hasSameWords(before, after);
}

export async function moderateNewAnswer(event: AnswerCreatedEvent): Promise<void> {
	const answer = event.data?.data() as Statement | undefined;
	if (!answer || !isMainAppAnswer(answer)) return;

	await checkAnswer(answer, event.id);
}

export async function moderateEditedAnswer(event: AnswerUpdatedEvent): Promise<void> {
	const before = event.data?.before.data() as Statement | undefined;
	const after = event.data?.after.data() as Statement | undefined;
	if (!before || !after || !needsLanguageCheck(before, after)) return;

	await checkAnswer(after, event.id);
}
