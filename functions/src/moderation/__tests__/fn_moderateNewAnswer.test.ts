import { Collections, SourceApp, Statement, StatementType } from '@freedi/shared-types';
import { createFakeDb, FakeDb } from '../../progress/__tests__/fakeDb';

let fake: FakeDb = createFakeDb();

jest.mock('../../db', () => ({
	get db() {
		return fake.db;
	},
}));

const assessLanguage = jest.fn<Promise<boolean>, [string]>();
jest.mock('../../fn_profanityChecker', () => ({
	assessLanguage: (text: string) => assessLanguage(text),
}));

const logError = jest.fn();
jest.mock('../../utils/errorHandling', () => ({
	logError: (...args: unknown[]) => logError(...args),
}));

import { answerTextToCheck, moderateNewAnswer } from '../fn_moderateNewAnswer';
import { answerHiddenNoticeId, pickAnswerHiddenLanguage } from '../answerHiddenNotice';

const ANSWER = 'answer-1';
const QUESTION = 'question-1';
const AUTHOR = 'author-1';
const OFFENSIVE_TEXT = 'some offensive words';

type Event = Parameters<typeof moderateNewAnswer>[0];

function answerDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		statementId: ANSWER,
		statement: OFFENSIVE_TEXT,
		statementType: StatementType.option,
		sourceApp: SourceApp.MAIN,
		parentId: QUESTION,
		topParentId: QUESTION,
		creatorId: AUTHOR,
		...overrides,
	};
}

/** The event as Firestore sends it: the creation snapshot, the same on every delivery. */
function eventFor(data: Record<string, unknown>, id = 'event-1'): Event {
	return { id, data: { data: () => data }, params: { statementId: ANSWER } } as unknown as Event;
}

/** Seeds the document and builds its creation event. */
function created(overrides: Record<string, unknown> = {}): Event {
	const data = answerDoc(overrides);
	fake.seed(Collections.statements, ANSWER, data);

	return eventFor(data);
}

const stored = (): Record<string, unknown> | undefined => fake.read(Collections.statements, ANSWER);
const notice = (): Record<string, unknown> | undefined =>
	fake.read(Collections.inAppNotifications, answerHiddenNoticeId(ANSWER));
const marker = (): { hiddenAt: number; eventId: string } =>
	stored()?.answerModeration as { hiddenAt: number; eventId: string };

beforeEach(() => {
	fake = createFakeDb();
	assessLanguage.mockReset();
	logError.mockReset();
	fake.seed(Collections.statements, QUESTION, { statement: 'The question?' });
});

describe('moderateNewAnswer', () => {
	it('hides a flagged answer, marks it and tells the author once', async () => {
		assessLanguage.mockResolvedValue(true);
		fake.seed(Collections.users, AUTHOR, { defaultLanguage: 'he' });

		await moderateNewAnswer(created());

		expect(stored()?.hide).toBe(true);
		expect(stored()?.answerModeration).toEqual({
			reason: 'inappropriate-language',
			hiddenAt: expect.any(Number),
			eventId: 'event-1',
		});
		expect(stored()?.statement).toBe(OFFENSIVE_TEXT);
		expect(notice()?.userId).toBe(AUTHOR);
		expect(notice()?.text).toContain('הבדיקה האוטומטית');
		expect(notice()?.parentStatement).toBe('The question?');
	});

	it('keeps the offending text out of the marker and the notice', async () => {
		assessLanguage.mockResolvedValue(true);

		await moderateNewAnswer(created());

		expect(JSON.stringify(marker())).not.toContain(OFFENSIVE_TEXT);
		expect(JSON.stringify(notice())).not.toContain(OFFENSIVE_TEXT);
	});

	it('leaves a clean answer visible and sends nothing', async () => {
		assessLanguage.mockResolvedValue(false);

		await moderateNewAnswer(created());

		expect(stored()?.hide).toBeUndefined();
		expect(stored()?.answerModeration).toBeUndefined();
		expect(notice()).toBeUndefined();
		expect(assessLanguage).toHaveBeenCalledTimes(1);
	});

	it('keeps the answer visible and logs without the text when the AI call fails', async () => {
		assessLanguage.mockRejectedValue(new Error('model down'));

		await moderateNewAnswer(created());

		expect(stored()?.hide).toBeUndefined();
		expect(notice()).toBeUndefined();
		expect(logError).toHaveBeenCalledTimes(1);
		expect(logError.mock.calls[0][1]).toMatchObject({
			operation: 'moderation.moderateNewAnswer',
			statementId: ANSWER,
			userId: AUTHOR,
		});
		expect(JSON.stringify(logError.mock.calls[0][1])).not.toContain(OFFENSIVE_TEXT);
	});

	it('keeps the answer visible when the AI call never returns', async () => {
		jest.useFakeTimers();
		try {
			assessLanguage.mockReturnValue(new Promise(() => undefined));
			const running = moderateNewAnswer(created());
			await jest.advanceTimersByTimeAsync(30_000);
			await running;
		} finally {
			jest.useRealTimers();
		}

		expect(stored()?.hide).toBeUndefined();
		expect(logError).toHaveBeenCalledTimes(1);
	});

	it('does nothing a second time on a redelivered event', async () => {
		assessLanguage.mockResolvedValue(true);
		const event = created();
		await moderateNewAnswer(event);
		const firstHiddenAt = marker().hiddenAt;
		await fake.db
			.collection(Collections.inAppNotifications)
			.doc(answerHiddenNoticeId(ANSWER))
			.update({ read: true });

		await moderateNewAnswer(event);

		expect(marker().hiddenAt).toBe(firstHiddenAt);
		expect(notice()?.read).toBe(true);
	});

	it('keeps a host restore when the event is redelivered afterwards', async () => {
		assessLanguage.mockResolvedValue(true);
		const event = created();
		await moderateNewAnswer(event);
		await fake.db.collection(Collections.statements).doc(ANSWER).update({ hide: false });

		await moderateNewAnswer(event);

		expect(stored()?.hide).toBe(false);
		expect(stored()?.answerModeration).toBeDefined();
	});

	it('is not switched off by a mark the client wrote at creation', async () => {
		assessLanguage.mockResolvedValue(true);

		await moderateNewAnswer(created({ answerModeration: { eventId: 'forged' } }));

		expect(assessLanguage).toHaveBeenCalledTimes(1);
		expect(stored()?.hide).toBe(true);
		expect(marker().eventId).toBe('event-1');
	});

	it('does not bring back an answer deleted while the check ran', async () => {
		const event = created();
		assessLanguage.mockImplementation(async () => {
			fake.store.get(Collections.statements)?.delete(ANSWER);

			return true;
		});

		await moderateNewAnswer(event);

		expect(stored()).toBeUndefined();
		expect(notice()).toBeUndefined();
	});

	it.each([
		['a chat message', { statementType: StatementType.statement }],
		['a question', { statementType: StatementType.question }],
		['an option from another app', { sourceApp: SourceApp.MASS_CONSENSUS }],
		['an option with no app recorded', { sourceApp: undefined }],
	])('ignores %s without an AI call', async (_label, overrides) => {
		await moderateNewAnswer(created(overrides));

		expect(assessLanguage).not.toHaveBeenCalled();
		expect(stored()?.hide).toBeUndefined();
	});

	it('logs and leaves the answer alone when the hide cannot be written', async () => {
		assessLanguage.mockResolvedValue(true);
		const event = created();
		jest.spyOn(fake.db, 'runTransaction').mockRejectedValueOnce(new Error('contention'));

		await moderateNewAnswer(event);

		expect(stored()?.hide).toBeUndefined();
		expect(logError.mock.calls[0][1]).toMatchObject({
			metadata: { outcome: 'flagged-but-hide-failed' },
		});
	});
});

describe('answerTextToCheck', () => {
	it('joins the title and the description paragraphs for one AI call', () => {
		const answer = answerDoc({
			statement: 'Title',
			paragraphs: [{ content: 'First' }, { content: 'Second' }],
		}) as unknown as Statement;

		expect(answerTextToCheck(answer)).toBe('Title\nFirst\nSecond');
	});
});

describe('pickAnswerHiddenLanguage', () => {
	it.each([
		['he', 'he'],
		['ar', 'ar'],
		['fa-IR', 'fa'],
		['es', 'es'],
		['de', 'de'],
		['NL', 'nl'],
		['en-US', 'en'],
		['fr', 'en'],
	])('uses the stored language %s', (storedLanguage, expected) => {
		expect(pickAnswerHiddenLanguage(storedLanguage, 'שלום')).toBe(expected);
	});

	it('falls back to the script of the text', () => {
		expect(pickAnswerHiddenLanguage(undefined, 'שלום hello')).toBe('he');
		expect(pickAnswerHiddenLanguage(undefined, 'مرحبا')).toBe('ar');
		expect(pickAnswerHiddenLanguage(undefined, 'hello')).toBe('en');
		expect(pickAnswerHiddenLanguage(undefined, '123')).toBe('he');
	});
});
