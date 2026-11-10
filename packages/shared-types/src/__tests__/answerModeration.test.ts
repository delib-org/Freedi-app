import { safeParse } from 'valibot';
import { StatementSchema } from '../models/statement/StatementTypes';
import { isAnswerHeldByModeration } from '../models/statement/answerModeration';
import { StatementType } from '../models/TypeEnums';

const MARKER = { reason: 'inappropriate-language', hiddenAt: 1, eventId: 'event-1' };

function answer(fields: object): unknown {
	return {
		statementId: 'answer-1',
		statement: 'An answer',
		statementType: StatementType.option,
		parentId: 'question-1',
		topParentId: 'question-1',
		parents: ['question-1'],
		creatorId: 'author-1',
		creator: { uid: 'author-1', displayName: 'Author' },
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
		...fields,
	};
}

describe('answerModeration on StatementSchema', () => {
	it('keeps the mark through the real parse, so clients can read it', () => {
		const parsed = safeParse(StatementSchema, answer({ hide: true, answerModeration: MARKER }));

		expect(parsed.issues).toBeUndefined();
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.output.answerModeration).toEqual(MARKER);
			expect(isAnswerHeldByModeration(parsed.output)).toBe(true);
		}
	});

	it('accepts a reason this version has never heard of', () => {
		const parsed = safeParse(
			StatementSchema,
			answer({ answerModeration: { ...MARKER, reason: 'a-future-reason' } }),
		);

		expect(parsed.success).toBe(true);
	});
});

describe('isAnswerHeldByModeration', () => {
	it('stops holding once a host restored the answer', () => {
		expect(
			isAnswerHeldByModeration({ hide: true, answerModeration: { ...MARKER, restoredAt: 2 } }),
		).toBe(false);
	});

	it('does not hold an answer that is visible', () => {
		expect(isAnswerHeldByModeration({ hide: false, answerModeration: MARKER })).toBe(false);
	});

	it('does not hold an answer hidden by hand', () => {
		expect(isAnswerHeldByModeration({ hide: true })).toBe(false);
	});
});
