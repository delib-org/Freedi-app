import { Collections, StatementType } from '@freedi/shared-types';
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
import {
	ANSWER,
	CLEAN_TEXT,
	editedAnswerFixture,
	EVENT_ID,
	EVENT_TIME,
	Fields,
	OFFENSIVE_TEXT,
	QUESTION,
	RESTORED_MARK,
} from './editedAnswerFixture';

const { updated, answerRef, stored, notice, marker, expectHeldBy } = editedAnswerFixture(
	() => fake,
);

beforeEach(() => {
	fake = createFakeDb();
	assessLanguage.mockReset();
	logError.mockReset();
	fake.seed(Collections.statements, QUESTION, { statement: 'The question?' });
});

describe('moderateEditedAnswer: description is only a copy of the paragraphs', () => {
	const ABUSIVE_P1 = 'abusive opening paragraph';
	const PARAGRAPHS = [ABUSIVE_P1, 'second paragraph', 'third paragraph', 'fourth paragraph'];
	/** What fn_syncParagraphChildrenToDescription writes. */
	const FULL_COPY = PARAGRAPHS.join('\n\n');
	/** What updateParentOnChildUpdate writes: the newest 3 only, joined with a bar. */
	const NEWEST_THREE = PARAGRAPHS.slice(1).join(' | ');

	function seedParagraphs(texts: string[]): void {
		texts.forEach((statement, index) => {
			fake.seed(Collections.statements, `paragraph-${index}`, {
				statementId: `paragraph-${index}`,
				statement,
				statementType: StatementType.paragraph,
				parentId: ANSWER,
				createdAt: index + 1,
			});
		});
	}

	const previewWrite = (description: string): Fields => ({
		lastSubStatements: [],
		lastUpdate: 7,
		lastChildUpdate: 7,
		description,
	});

	it('gives the full words a verdict and keeps it when the preview lands during the check', async () => {
		seedParagraphs(PARAGRAPHS);
		const syncEvent = updated({ description: 'older words' }, { description: FULL_COPY });
		assessLanguage.mockImplementationOnce(async () => {
			await answerRef().update(previewWrite(NEWEST_THREE));

			return true;
		});

		await moderateEditedAnswer(syncEvent);

		expect(assessLanguage.mock.calls[0][0]).toBe(`${CLEAN_TEXT}\n${PARAGRAPHS.join('\n')}`);
		expectHeldBy(EVENT_ID);
	});

	it('makes no AI call for the preview write itself', async () => {
		seedParagraphs(PARAGRAPHS);

		await moderateEditedAnswer(updated({ description: FULL_COPY }, previewWrite(NEWEST_THREE)));

		expect(assessLanguage).not.toHaveBeenCalled();
	});

	it('checks the full words when the preview lands before the sync', async () => {
		seedParagraphs(PARAGRAPHS);
		assessLanguage.mockResolvedValue(true);
		await moderateEditedAnswer(
			updated({ description: 'older words' }, previewWrite(NEWEST_THREE), 'event-preview'),
		);
		expect(assessLanguage).not.toHaveBeenCalled();

		await moderateEditedAnswer(
			updated(previewWrite(NEWEST_THREE), { description: FULL_COPY }, 'event-sync'),
		);

		expect(assessLanguage.mock.calls[0][0]).toContain(ABUSIVE_P1);
		expectHeldBy('event-sync');
	});

	it('does not re-hold a restored answer when a reply edit rewrites the preview', async () => {
		seedParagraphs(PARAGRAPHS);
		const restored = { hide: false, answerModeration: RESTORED_MARK };

		await moderateEditedAnswer(
			updated(
				{ ...restored, description: FULL_COPY },
				{ ...restored, ...previewWrite(NEWEST_THREE) },
			),
		);

		expect(assessLanguage).not.toHaveBeenCalled();
		expect(stored()?.hide).toBe(false);
		expect(notice()).toBeUndefined();
	});

	it('does not re-hold a restored answer when the preview is cleared', async () => {
		const restored = { hide: false, answerModeration: RESTORED_MARK };
		const collection = jest.spyOn(fake.db, 'collection');

		await moderateEditedAnswer(
			updated({ ...restored, description: 'older copy' }, { ...restored, ...previewWrite('') }),
		);

		expect(collection).not.toHaveBeenCalled();
		expect(assessLanguage).not.toHaveBeenCalled();
		expect(stored()?.hide).toBe(false);
	});

	it('still checks a title edit that arrives with a cleared description', async () => {
		assessLanguage.mockResolvedValue(true);

		await moderateEditedAnswer(
			updated({ description: 'older copy' }, { statement: OFFENSIVE_TEXT, description: '' }),
		);

		expect(assessLanguage).toHaveBeenCalledWith(OFFENSIVE_TEXT);
		expectHeldBy(EVENT_ID);
	});

	it('treats words found in no paragraph as an edit, even on an answer with paragraphs', async () => {
		seedParagraphs(PARAGRAPHS.slice(1));
		assessLanguage.mockResolvedValue(true);

		await moderateEditedAnswer(
			updated({ description: NEWEST_THREE }, { description: 'second idiot...' }),
		);

		expect(assessLanguage.mock.calls[0][0]).toContain('second idiot...');
		expectHeldBy(EVENT_ID);
	});

	it('does not read paragraph text from the shortened description on a title edit', async () => {
		seedParagraphs(PARAGRAPHS);
		assessLanguage.mockResolvedValue(false);

		await moderateEditedAnswer(
			updated({ description: NEWEST_THREE }, { statement: 'new title', description: NEWEST_THREE }),
		);

		expect(assessLanguage.mock.calls[0][0]).toBe(`new title\n${PARAGRAPHS.join('\n')}`);
	});
});

describe('moderateEditedAnswer: restores and the type flip', () => {
	it('re-checks a restored answer flipped to chat and back, closing the flip-edit-flip route', async () => {
		assessLanguage.mockResolvedValue(true);
		const restored = { hide: false, answerModeration: RESTORED_MARK };

		await moderateEditedAnswer(
			updated(
				{ ...restored, statement: OFFENSIVE_TEXT, statementType: StatementType.statement },
				{ ...restored, statement: OFFENSIVE_TEXT },
			),
		);

		expect(assessLanguage).toHaveBeenCalledTimes(1);
		expectHeldBy(EVENT_ID);
	});

	it('does not undo a restore that came after the write being judged', async () => {
		const event = updated({}, { statement: OFFENSIVE_TEXT }, 'event-in-flight');
		const restoredLater = { ...RESTORED_MARK, restoredAt: EVENT_TIME + 1 };
		assessLanguage.mockImplementationOnce(async () => {
			await answerRef().update({ hide: false, answerModeration: restoredLater });

			return true;
		});

		await moderateEditedAnswer(event);

		expect(stored()?.hide).toBe(false);
		expect(marker()).toEqual(restoredLater);
		expect(notice()).toBeUndefined();
	});

	it('holds again when the restore came before the write being judged', async () => {
		assessLanguage.mockResolvedValue(true);
		const restored = {
			hide: false,
			answerModeration: { ...RESTORED_MARK, restoredAt: EVENT_TIME - 1 },
		};

		await moderateEditedAnswer(
			updated({ ...restored }, { ...restored, statement: OFFENSIVE_TEXT }),
		);

		expectHeldBy(EVENT_ID);
	});
});
