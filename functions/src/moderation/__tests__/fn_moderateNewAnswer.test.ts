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

import { moderateNewAnswer } from '../fn_moderateNewAnswer';
import { answerFullText } from '../answerText';
import { answerHiddenNoticeId } from '../answerHiddenNotice';

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

describe('moderateNewAnswer when the document moved on during the check', () => {
	const answerRef = () => fake.db.collection(Collections.statements).doc(ANSWER);

	/** The check flags, after this change lands. */
	const flagAfter = (change: Record<string, unknown>): void => {
		assessLanguage.mockImplementationOnce(async () => {
			await answerRef().update(change);

			return true;
		});
	};

	const expectHeld = (): void => {
		expect(stored()?.hide).toBe(true);
		expect(marker().eventId).toBe('event-1');
		expect(notice()?.userId).toBe(AUTHOR);
	};

	const expectLeftVisible = (): void => {
		expect(stored()?.hide).toBeUndefined();
		expect(stored()?.answerModeration).toBeUndefined();
		expect(notice()).toBeUndefined();
	};

	describe('the title split', () => {
		const MULTI_LINE = 'first line\nabusive second line';
		const SPLIT = { statement: 'first line', description: 'abusive second line' };

		it('holds a multi-line abusive answer after the split, with no second AI call', async () => {
			const event = created({ statement: MULTI_LINE });
			flagAfter(SPLIT);

			await moderateNewAnswer(event);

			expectHeld();
			expect(assessLanguage).toHaveBeenCalledTimes(1);
		});

		it('recognises a title the split trimmed', async () => {
			const event = created({ statement: '  first line  \nsecond' });
			flagAfter({ statement: 'first line', description: 'second' });

			await moderateNewAnswer(event);

			expectHeld();
			expect(assessLanguage).toHaveBeenCalledTimes(1);
		});

		it('recognises the description the split joins with a bar', async () => {
			const event = created({ statement: 'first\nsecond\nthird' });
			flagAfter({ statement: 'first', description: 'second | third' });

			await moderateNewAnswer(event);

			expectHeld();
			expect(assessLanguage).toHaveBeenCalledTimes(1);
		});

		it('recognises a description the split shortened', async () => {
			const event = created({ statement: 'first\nsecond line that runs on' });
			fake.seed(Collections.statements, 'paragraph-1', {
				statementId: 'paragraph-1',
				statement: 'second line that runs on',
				statementType: StatementType.paragraph,
				parentId: ANSWER,
				createdAt: 1,
			});
			flagAfter({ statement: 'first', description: 'second line that runs on' });

			await moderateNewAnswer(event);

			expectHeld();
			expect(assessLanguage).toHaveBeenCalledTimes(1);
		});
	});

	describe('a real edit', () => {
		it.each([
			['a new title', { statement: 'a kind rewording' }],
			['a shortened title', { statement: 'some offensive' }],
			['a new description', { description: 'new words' }],
			['new paragraphs', { paragraphs: [{ content: 'new words' }] }],
		])('leaves the verdict to the event of %s', async (_label, change) => {
			const event = created();
			flagAfter(change);

			await moderateNewAnswer(event);

			expect(assessLanguage).toHaveBeenCalledTimes(1);
			expectLeftVisible();
		});

		it('treats equal paragraphs in another key order as unchanged', async () => {
			const event = created({ paragraphs: [{ content: 'a', order: 0 }] });
			flagAfter({ paragraphs: [{ order: 0, content: 'a' }] });

			await moderateNewAnswer(event);

			expectHeld();
			expect(assessLanguage).toHaveBeenCalledTimes(1);
		});
	});

	describe('hide or integration during the wait', () => {
		it('holds an answer synthesis absorbed, so a later reversal cannot publish it', async () => {
			const event = created();
			flagAfter({ hide: true, integratedInto: 'cluster-1' });

			await moderateNewAnswer(event);

			expectHeld();
			expect(stored()?.integratedInto).toBe('cluster-1');
		});

		it('holds an answer that was hidden during the wait and tells the author once', async () => {
			const event = created();
			flagAfter({ hide: true });

			await moderateNewAnswer(event);

			expectHeld();
		});

		it('holds an answer the author hid and unhid during the wait', async () => {
			const event = created();
			flagAfter({ hide: false });

			await moderateNewAnswer(event);

			expectHeld();
		});

		it('still acts on a hide the client wrote at creation', async () => {
			assessLanguage.mockResolvedValue(true);

			await moderateNewAnswer(created({ hide: true }));

			expectHeld();
		});
	});

	describe('a retried event', () => {
		it('stays harmless once a host recorded the restore', async () => {
			assessLanguage.mockResolvedValue(true);
			const event = created();
			await moderateNewAnswer(event);
			await answerRef().update({ hide: false, 'answerModeration.restoredAt': 5 });

			await moderateNewAnswer(event);

			expect(stored()?.hide).toBe(false);
			expect(stored()?.answerModeration).toMatchObject({ eventId: 'event-1', restoredAt: 5 });
		});
	});
});

describe('moderateNewAnswer on very long answers', () => {
	it('checks the first 5,000 characters and logs the lengths, never the text', async () => {
		const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
		assessLanguage.mockResolvedValue(false);

		await moderateNewAnswer(created({ statement: 'x'.repeat(5_001) }));

		expect(assessLanguage.mock.calls[0][0]).toHaveLength(5_000);
		expect(info).toHaveBeenCalledWith(expect.stringContaining('long answer'), {
			statementId: ANSWER,
			totalCharacters: 5_001,
			checkedCharacters: 5_000,
		});
		expect(JSON.stringify(info.mock.calls)).not.toContain('xxx');
		info.mockRestore();
	});

	it('does not log an answer at the limit', async () => {
		const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
		assessLanguage.mockResolvedValue(false);

		await moderateNewAnswer(created({ statement: 'x'.repeat(5_000) }));

		expect(info).not.toHaveBeenCalled();
		info.mockRestore();
	});
});

describe('answerFullText', () => {
	it('joins the title, description and paragraphs for one AI call', () => {
		const answer = answerDoc({
			statement: 'Title',
			description: 'Body',
			paragraphs: [{ content: 'First' }, { content: 'Second' }],
		}) as unknown as Statement;

		expect(answerFullText(answer)).toBe('Title\nBody\nFirst\nSecond');
	});

	it.each([
		['a string', 'not a list'],
		['a list with a null in it', [null]],
	])('still returns the title when paragraphs is %s', (_label, paragraphs) => {
		const answer = answerDoc({ statement: 'Title', paragraphs }) as unknown as Statement;

		expect(answerFullText(answer)).toBe('Title');
	});
});
