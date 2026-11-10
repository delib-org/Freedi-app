import { describe, it, expect, beforeEach } from '@jest/globals';
import { Collections, Statement, StatementType } from '@freedi/shared-types';
import { FakeFirestore } from '../userFeed/__tests__/fakeFirestore';

let mockDb = new FakeFirestore();

jest.mock('../index', () => ({
	get db() {
		return mockDb;
	},
}));
jest.mock('firebase-functions', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../statements/history/writeHistoryEntry', () => ({
	writeHistoryEntry: jest.fn(() => Promise.resolve()),
}));
jest.mock('../statements/history/isResearchEnabled', () => ({
	isResearchEnabledForTopParent: jest.fn(() => Promise.resolve(false)),
}));
jest.mock('../evaluation/topAnswerSync', () => ({
	syncTopAnswersOnOptionUpdated: jest.fn(() => Promise.resolve()),
	syncTopAnswersOnOptionDeleted: jest.fn(() => Promise.resolve()),
}));

import { updateParentOnChildUpdate } from '../fn_statement_updates';
import { descriptionOrigin } from '../moderation/answerText';

const QUESTION = 'question-1';
const OPTION = 'option-1';
const REPLY = 'reply-1';

type Doc = Record<string, unknown>;
type Handler = (event: unknown) => Promise<void>;

function paragraph(index: number, overrides: Doc = {}): Doc {
	return {
		statementId: `paragraph-${index}`,
		statement: `paragraph number ${index}`,
		statementType: StatementType.paragraph,
		parentId: OPTION,
		createdAt: index,
		...overrides,
	};
}

function seedParagraphs(paragraphs: Doc[]): void {
	paragraphs.forEach((doc) => {
		mockDb.seed(Collections.statements, doc.statementId as string, doc);
	});
}

function reply(statement: string): Doc {
	return {
		statementId: REPLY,
		statement,
		statementType: StatementType.statement,
		parentId: OPTION,
		topParentId: QUESTION,
		parents: [QUESTION, OPTION],
		creatorId: 'someone',
		creator: { uid: 'someone', displayName: 'Someone' },
		createdAt: 100,
		lastUpdate: 100,
	};
}

/** A stranger edits their reply under the answer, which refreshes the answer's preview. */
async function editReply(): Promise<string> {
	mockDb.seed(Collections.statements, REPLY, reply('after'));
	await (updateParentOnChildUpdate as unknown as Handler)({
		data: {
			before: { data: () => reply('before') },
			after: { data: () => reply('after') },
		},
	});
	const parent = await mockDb.collection(Collections.statements).doc(OPTION).get();

	return (parent.data() as Doc).description as string;
}

beforeEach(() => {
	mockDb = new FakeFirestore();
	mockDb.seed(Collections.statements, QUESTION, { statementId: QUESTION, parentId: 'top' });
	mockDb.seed(Collections.statements, OPTION, {
		statementId: OPTION,
		statement: 'Plant trees',
		statementType: StatementType.option,
		parentId: QUESTION,
		topParentId: QUESTION,
	});
});

describe('updateParentOnChildUpdate: the description preview', () => {
	it('is built from the newest three paragraphs', async () => {
		seedParagraphs([1, 2, 3, 4].map((index) => paragraph(index)));

		expect(await editReply()).toBe('paragraph number 2 | paragraph number 3 | paragraph number 4');
	});

	it('leaves a hidden paragraph out and reaches back for the next visible one', async () => {
		seedParagraphs([paragraph(1), paragraph(2), paragraph(3), paragraph(4, { hide: true })]);

		expect(await editReply()).toBe('paragraph number 1 | paragraph number 2 | paragraph number 3');
	});

	const hiddenRange = (from: number, to: number): Doc[] =>
		Array.from({ length: to - from + 1 }, (_unused, offset) =>
			paragraph(from + offset, { hide: true }),
		);

	it('finds a visible paragraph behind hidden ones, within the scan limit', async () => {
		seedParagraphs([paragraph(1), ...hiddenRange(2, 50)]);

		expect(await editReply()).toBe('paragraph number 1');
	});

	it('reads no further than the scan limit', async () => {
		seedParagraphs([paragraph(1), ...hiddenRange(2, 51)]);

		expect(await editReply()).toBe('');
	});

	it('writes what the language check accepts as a copy of the paragraphs', async () => {
		const paragraphs = [
			paragraph(1),
			paragraph(2),
			paragraph(3),
			paragraph(4),
			paragraph(5, { hide: true }),
		];
		seedParagraphs(paragraphs);

		const description = await editReply();

		expect(descriptionOrigin(description, paragraphs as unknown as Statement[])).toBe(
			'partial-copy',
		);
	});
});
