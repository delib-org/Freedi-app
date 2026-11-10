import { Collections, SourceApp, StatementType } from '@freedi/shared-types';
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

import { moderateEditedAnswer } from '../fn_moderateNewAnswer';
import { answerHiddenNoticeId } from '../answerHiddenNotice';
import {
	ANSWER,
	CLEAN_TEXT,
	editedAnswerFixture,
	Event,
	EVENT_ID,
	Fields,
	HELD_MARK,
	OFFENSIVE_TEXT,
	QUESTION,
	RESTORED_MARK,
} from './editedAnswerFixture';

const { updated, answerRef, stored, notice, marker, expectHeldBy, expectLeftVisible } =
	editedAnswerFixture(() => fake);

beforeEach(() => {
	fake = createFakeDb();
	assessLanguage.mockReset();
	logError.mockReset();
	fake.seed(Collections.statements, QUESTION, { statement: 'The question?' });
});

describe('moderateEditedAnswer: what gets checked', () => {
	it('holds an answer whose title was edited to something offensive', async () => {
		assessLanguage.mockResolvedValue(true);

		await moderateEditedAnswer(updated({}, { statement: OFFENSIVE_TEXT }));

		expect(assessLanguage).toHaveBeenCalledWith(OFFENSIVE_TEXT);
		expectHeldBy(EVENT_ID);
		expect(stored()?.statement).toBe(OFFENSIVE_TEXT);
	});

	it('holds an answer whose own description, with no paragraphs, was edited', async () => {
		assessLanguage.mockResolvedValue(true);

		await moderateEditedAnswer(
			updated({ description: 'first words' }, { description: 'offensive words' }),
		);

		expect(assessLanguage).toHaveBeenCalledWith(`${CLEAN_TEXT}\noffensive words`);
		expectHeldBy(EVENT_ID);
	});

	it('holds an answer whose paragraphs list was edited', async () => {
		assessLanguage.mockResolvedValue(true);

		await moderateEditedAnswer(
			updated({ paragraphs: [] }, { paragraphs: [{ content: 'offensive paragraph' }] }),
		);

		expect(assessLanguage).toHaveBeenCalledWith(`${CLEAN_TEXT}\noffensive paragraph`);
		expectHeldBy(EVENT_ID);
	});

	it('holds a chat message turned into an answer, with its words unchanged', async () => {
		assessLanguage.mockResolvedValue(true);

		await moderateEditedAnswer(
			updated(
				{ statement: OFFENSIVE_TEXT, statementType: StatementType.statement },
				{ statement: OFFENSIVE_TEXT },
			),
		);

		expect(assessLanguage).toHaveBeenCalledTimes(1);
		expectHeldBy(EVENT_ID);
	});

	it('leaves a clean edit visible and sends nothing', async () => {
		assessLanguage.mockResolvedValue(false);

		await moderateEditedAnswer(updated({}, { statement: 'another kind answer' }));

		expect(assessLanguage).toHaveBeenCalledTimes(1);
		expectLeftVisible();
	});

	it('keeps the edit visible and logs when the check fails', async () => {
		assessLanguage.mockRejectedValue(new Error('model down'));

		await moderateEditedAnswer(updated({}, { statement: OFFENSIVE_TEXT }));

		expectLeftVisible();
		expect(logError).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(logError.mock.calls[0][1])).not.toContain(OFFENSIVE_TEXT);
	});
});

describe('moderateEditedAnswer: what returns with no AI call', () => {
	it.each<[string, Fields, Fields]>([
		['a counter', { totalEvaluators: 1 }, { totalEvaluators: 2 }],
		['consensus', { consensus: 0.1 }, { consensus: 0.9 }],
		['lastUpdate', { lastUpdate: 1 }, { lastUpdate: 2 }],
		['an author hiding the answer', {}, { hide: true }],
		['the moderation write itself', {}, { hide: true, answerModeration: HELD_MARK, lastUpdate: 9 }],
		[
			'the title split',
			{ statement: 'first\nsecond\nthird' },
			{ statement: 'first', description: 'second | third' },
		],
		[
			'the paragraph sync reformatting the description',
			{ statement: 'first', description: 'second | third' },
			{ statement: 'first', description: 'second\n\nthird' },
		],
	])('ignores %s', async (_label, before, after) => {
		await moderateEditedAnswer(updated(before, after));

		expect(assessLanguage).not.toHaveBeenCalled();
		expect(notice()).toBeUndefined();
	});

	it.each<[string, Fields]>([
		['a chat message', { statementType: StatementType.statement }],
		['a question', { statementType: StatementType.question }],
		['a paragraph child', { statementType: StatementType.paragraph }],
		['an option from another app', { sourceApp: SourceApp.MASS_CONSENSUS }],
		['an option with no app recorded', { sourceApp: undefined }],
	])('ignores an edit of %s', async (_label, fields) => {
		await moderateEditedAnswer(updated(fields, { ...fields, statement: OFFENSIVE_TEXT }));

		expect(assessLanguage).not.toHaveBeenCalled();
		expect(stored()?.hide).toBeUndefined();
	});

	it('does not read the database on a non-text update', async () => {
		const collection = jest.spyOn(fake.db, 'collection');

		await moderateEditedAnswer(updated({ consensus: 0.1 }, { consensus: 0.9 }));

		expect(collection).not.toHaveBeenCalled();
	});

	it('does nothing without both snapshots', async () => {
		await moderateEditedAnswer({ id: EVENT_ID, data: undefined } as unknown as Event);

		expect(assessLanguage).not.toHaveBeenCalled();
	});

	it('treats text that grows out of an ellipsis as an edit', async () => {
		assessLanguage.mockResolvedValue(true);

		await moderateEditedAnswer(
			updated(
				{ statement: 'first', description: 'second...' },
				{ statement: 'first', description: 'second and offensive' },
			),
		);

		expect(assessLanguage).toHaveBeenCalledTimes(1);
		expectHeldBy(EVENT_ID);
	});
});

describe('moderateEditedAnswer: held and restored answers', () => {
	it('does not re-hold a restored answer when its text did not change', async () => {
		await moderateEditedAnswer(
			updated(
				{ statement: OFFENSIVE_TEXT, hide: true, answerModeration: HELD_MARK },
				{ statement: OFFENSIVE_TEXT, hide: false, answerModeration: RESTORED_MARK },
			),
		);

		expect(assessLanguage).not.toHaveBeenCalled();
		expect(stored()?.hide).toBe(false);
		expect(marker().restoredAt).toBe(2);
	});

	it('leaves a restored answer alone on later non-text updates', async () => {
		const restored = { statement: OFFENSIVE_TEXT, hide: false, answerModeration: RESTORED_MARK };

		await moderateEditedAnswer(
			updated({ ...restored, consensus: 0.1 }, { ...restored, consensus: 0.9 }),
		);

		expect(assessLanguage).not.toHaveBeenCalled();
		expect(stored()?.hide).toBe(false);
	});

	it('checks a restored answer again once its text changes, and holds it afresh', async () => {
		assessLanguage.mockResolvedValue(true);
		const restored = { hide: false, answerModeration: RESTORED_MARK };

		await moderateEditedAnswer(
			updated({ ...restored }, { ...restored, statement: OFFENSIVE_TEXT }),
		);

		expect(assessLanguage).toHaveBeenCalledTimes(1);
		expectHeldBy(EVENT_ID);
	});

	it('keeps a restored answer visible when its new text is clean', async () => {
		assessLanguage.mockResolvedValue(false);
		const restored = { hide: false, answerModeration: RESTORED_MARK };

		await moderateEditedAnswer(
			updated({ ...restored }, { ...restored, statement: 'another kind answer' }),
		);

		expect(stored()?.hide).toBe(false);
		expect(marker().restoredAt).toBe(2);
	});

	it('keeps a held answer held, with no AI call, when an edit cleans it', async () => {
		const held = { hide: true, answerModeration: HELD_MARK };

		await moderateEditedAnswer(
			updated({ ...held, statement: OFFENSIVE_TEXT }, { ...held, statement: CLEAN_TEXT }),
		);

		expect(assessLanguage).not.toHaveBeenCalled();
		expect(stored()?.hide).toBe(true);
		expect(marker().eventId).toBe('event-old');
	});

	it('does not tell the author twice when another event held the answer first', async () => {
		const event = updated({}, { statement: OFFENSIVE_TEXT });
		assessLanguage.mockImplementationOnce(async () => {
			await answerRef().update({ hide: true, answerModeration: HELD_MARK });

			return true;
		});

		await moderateEditedAnswer(event);

		expect(marker().eventId).toBe('event-old');
		expect(notice()).toBeUndefined();
	});
});

describe('moderateEditedAnswer: words moving on and redelivery', () => {
	it('does not apply a verdict to words edited during the check', async () => {
		const event = updated({}, { statement: OFFENSIVE_TEXT });
		assessLanguage.mockImplementationOnce(async () => {
			await answerRef().update({ statement: 'a later clean version' });

			return true;
		});

		await moderateEditedAnswer(event);

		expectLeftVisible();
	});

	it('holds on the event of the last edit when an earlier check went stale', async () => {
		const firstEdit = updated({}, { statement: 'first offensive version' }, 'event-first');
		assessLanguage.mockImplementationOnce(async () => {
			await answerRef().update({ statement: 'second offensive version' });

			return true;
		});
		await moderateEditedAnswer(firstEdit);
		assessLanguage.mockResolvedValueOnce(true);

		await moderateEditedAnswer(
			updated(
				{ statement: 'first offensive version' },
				{ statement: 'second offensive version' },
				'event-second',
			),
		);

		expectHeldBy('event-second');
	});

	it('does nothing a second time on a redelivered event', async () => {
		assessLanguage.mockResolvedValue(true);
		const event = updated({}, { statement: OFFENSIVE_TEXT });
		await moderateEditedAnswer(event);
		const firstHiddenAt = marker().hiddenAt;
		await fake.db
			.collection(Collections.inAppNotifications)
			.doc(answerHiddenNoticeId(ANSWER))
			.update({ read: true });

		await moderateEditedAnswer(event);

		expect(marker().hiddenAt).toBe(firstHiddenAt);
		expect(notice()?.read).toBe(true);
	});

	it('keeps a host restore when the event is redelivered afterwards', async () => {
		assessLanguage.mockResolvedValue(true);
		const event = updated({}, { statement: OFFENSIVE_TEXT });
		await moderateEditedAnswer(event);
		await answerRef().update({ hide: false, 'answerModeration.restoredAt': 5 });

		await moderateEditedAnswer(event);

		expect(stored()?.hide).toBe(false);
		expect(marker()).toMatchObject({ eventId: EVENT_ID, restoredAt: 5 });
	});

	it('logs and leaves the answer alone when the hide cannot be written', async () => {
		assessLanguage.mockResolvedValue(true);
		const event = updated({}, { statement: OFFENSIVE_TEXT });
		jest.spyOn(fake.db, 'runTransaction').mockRejectedValueOnce(new Error('contention'));

		await moderateEditedAnswer(event);

		expect(stored()?.hide).toBeUndefined();
		expect(logError.mock.calls[0][1]).toMatchObject({
			metadata: { outcome: 'flagged-but-hide-failed' },
		});
	});
});
