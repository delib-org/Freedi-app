/**
 * Server-side language check on main-app answers: when one is created, when its
 * words change, and when a chat message becomes one. A flagged answer is hidden,
 * marked and its author told; nothing is deleted.
 *
 * Paragraph children need no trigger of their own: fn_syncParagraphChildrenToDescription
 * copies their text into the answer's `description`, and that write is the signal.
 * The words judged are read from the children themselves (see answerText.ts).
 *
 * Kept out of statementDispatch on purpose: that dispatcher takes no AI calls.
 * Fails open: if the check cannot answer, the answer stays visible and it is logged.
 */

import { QuerySnapshot } from 'firebase-admin/firestore';
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
import {
	answerFullText,
	changedOnlyDescription,
	descriptionOrigin,
	hasSameWords,
} from './answerText';

const OPERATION = 'moderation.moderateNewAnswer';

/** Well under the trigger's 60 s limit, and past the model's normal answer time. */
const CHECK_TIMEOUT_MS = 30_000;

/** Bounds the cost of one AI call; Firestore alone would allow about 1 MB of text. */
const MAX_CHECKED_CHARACTERS = 5_000;

type AnswerCreatedEvent = FirestoreEvent<
	QueryDocumentSnapshot | undefined,
	{ statementId: string }
>;

type AnswerUpdatedEvent = FirestoreEvent<
	Change<QueryDocumentSnapshot> | undefined,
	{ statementId: string }
>;

/** The parts of a trigger event a verdict is tied to. */
interface CheckEvent {
	id: string;
	time: string;
}

/**
 * Strict on `sourceApp`: Mass Consensus and other apps write options with no
 * `sourceApp`, so the wider isMainAppStatement() would pull them in too.
 */
export function isMainAppAnswer(statement: Statement): boolean {
	return statement.statementType === StatementType.option && statement.sourceApp === SourceApp.MAIN;
}

/** Whatever lies past the limit goes unchecked, so it has to be countable. Lengths only. */
function logTruncatedCheck(answer: Statement, totalCharacters: number): void {
	console.info('moderateNewAnswer: checked only the start of a long answer', {
		statementId: answer.statementId,
		totalCharacters,
		checkedCharacters: MAX_CHECKED_CHARACTERS,
	});
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
	checkedText: string;
	event: CheckEvent;
	noticeContext: NoticeContext;
}

function paragraphChildrenQuery(answerId: string) {
	return db
		.collection(Collections.statements)
		.where('parentId', '==', answerId)
		.where('statementType', '==', StatementType.paragraph);
}

function paragraphsIn(snapshot: QuerySnapshot): Statement[] {
	return snapshot.docs.map((doc) => doc.data() as Statement);
}

/**
 * A verdict is applied only to the words it was given on, read from the source
 * of truth, so a preview rewriting `description` cannot discard it. If the words
 * moved on, the edit that moved them has its own event and its own check, so the
 * last words on the document always get a verdict.
 *
 * The marker is compared by event id so that a redelivered event does nothing.
 * A restore later than the write being judged means a host has already ruled on
 * those words, so a second event still in flight must not undo it.
 */
function verdictApplies(
	{ checkedText, event }: HoldRequest,
	current: Statement,
	currentParagraphs: Statement[],
): boolean {
	const mark = current.answerModeration;
	if (mark?.eventId === event.id) return false;
	if (isAnswerHeldByModeration(current)) return false;
	if (mark?.restoredAt !== undefined && mark.restoredAt >= Date.parse(event.time)) return false;

	return hasSameWords(checkedText, answerFullText(current, currentParagraphs));
}

/**
 * Hide, mark and notify in one transaction.
 *
 * `hide` or `integratedInto` appearing during the wait does not stop it: an
 * unmarked answer would come back when a cluster is later reversed or dissolved.
 */
async function holdAnswer(request: HoldRequest): Promise<void> {
	const { answer, event, noticeContext } = request;
	const answerRef = db.collection(Collections.statements).doc(answer.statementId);
	const noticeRef = db
		.collection(Collections.inAppNotifications)
		.doc(answerHiddenNoticeId(answer.statementId));

	await db.runTransaction(async (transaction) => {
		const current = await transaction.get(answerRef);
		const paragraphs = await transaction.get(paragraphChildrenQuery(answer.statementId));
		const currentAnswer = current.data() as Statement | undefined;
		if (!currentAnswer || !verdictApplies(request, currentAnswer, paragraphsIn(paragraphs))) return;

		const now = Date.now();
		const marker: AnswerModeration = {
			reason: ANSWER_MODERATION_REASON,
			hiddenAt: now,
			eventId: event.id,
		};
		transaction.update(answerRef, {
			hide: true,
			answerModeration: marker,
			lastUpdate: now,
		});
		transaction.set(noticeRef, buildAnswerHiddenNotice({ answer, ...noticeContext, now }));
	});
}

async function checkAnswer(
	answer: Statement,
	event: CheckEvent,
	paragraphChildren: Statement[] = [],
): Promise<void> {
	const checkedText = answerFullText(answer, paragraphChildren);
	const text = limitCheckedText(answer, checkedText);
	if (!text || !(await isAnswerFlagged(text, answer))) return;

	try {
		const noticeContext = await readNoticeContext(answer, text);
		await holdAnswer({ answer, checkedText, event, noticeContext });
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
 * Also true when `sourceApp` comes back to main: rules do not protect it, so
 * words edited while it pointed elsewhere have had no check.
 */
function becameAnswer(before: Statement): boolean {
	return !isMainAppAnswer(before);
}

/**
 * A main-app answer leaving for another app in the same write stays in scope:
 * rules do not protect `sourceApp`, so that write could carry new words.
 */
function isInScope(before: Statement, after: Statement): boolean {
	return (
		isMainAppAnswer(after) ||
		(isMainAppAnswer(before) && after.statementType === StatementType.option)
	);
}

/**
 * Runs on every statement update, so it reads only the event's own snapshots.
 * The moderation write, counters and consensus leave the words alone and stop
 * here, and so does clearing `description`, which only removes words.
 *
 * An answer already held stays held whatever its words become: the host who
 * restores it sees the current text and decides on that.
 */
export function needsLanguageCheck(before: Statement, after: Statement): boolean {
	if (!isInScope(before, after) || isAnswerHeldByModeration(after)) return false;
	if (becameAnswer(before)) return true;
	if (hasSameWords(answerFullText(before), answerFullText(after))) return false;

	return Boolean(after.description) || !changedOnlyDescription(before, after);
}

/**
 * With the paragraphs in hand: the title split moved the words without changing
 * them, and the newest-3 preview a reply rewrites changes nobody's words.
 */
function leavesWordsAlone(before: Statement, after: Statement, paragraphs: Statement[]): boolean {
	if (becameAnswer(before)) return false;
	if (hasSameWords(answerFullText(before), answerFullText(after, paragraphs))) return true;

	return (
		changedOnlyDescription(before, after) &&
		descriptionOrigin(after.description, paragraphs) === 'partial-copy'
	);
}

/**
 * The sync rewriting a full copy on a restored answer, when no visible paragraph
 * has been written since the host restored it: those are the words the host
 * ruled on. Comparing `before` cannot prove this, because a preview that omits
 * an edited paragraph still matches the paragraphs after the edit, so it takes
 * the server's own write times. A restore dated after this event is not trusted.
 */
function isUntouchedSinceRestore(
	{ before, after, event }: { before: Statement; after: Statement; event: CheckEvent },
	snapshot: QuerySnapshot,
): boolean {
	const restoredAt = after.answerModeration?.restoredAt;
	if (restoredAt === undefined || restoredAt >= Date.parse(event.time)) return false;
	if (becameAnswer(before) || !changedOnlyDescription(before, after)) return false;
	if (descriptionOrigin(after.description, paragraphsIn(snapshot)) !== 'full-copy') return false;

	return snapshot.docs.every(
		(doc) => doc.data().hide === true || doc.updateTime.toMillis() <= restoredAt,
	);
}

export async function moderateNewAnswer(event: AnswerCreatedEvent): Promise<void> {
	const answer = event.data?.data() as Statement | undefined;
	if (!answer || !isMainAppAnswer(answer)) return;

	await checkAnswer(answer, event);
}

export async function moderateEditedAnswer(event: AnswerUpdatedEvent): Promise<void> {
	const before = event.data?.before.data() as Statement | undefined;
	const after = event.data?.after.data() as Statement | undefined;
	if (!before || !after || !needsLanguageCheck(before, after)) return;

	const snapshot = await paragraphChildrenQuery(after.statementId).get();
	const paragraphs = paragraphsIn(snapshot);
	if (leavesWordsAlone(before, after, paragraphs)) return;
	if (isUntouchedSinceRestore({ before, after, event }, snapshot)) return;

	await checkAnswer(after, event, paragraphs);
}
