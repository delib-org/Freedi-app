import { Statement, StatementType } from '@freedi/shared-types';
import {
	answerFullText,
	changedOnlyDescription,
	descriptionOrigin,
	hasSameWords,
} from '../answerText';

const statementOf = (fields: Record<string, unknown>): Statement => fields as unknown as Statement;

const paragraph = (statement: string, createdAt: number, hide?: boolean): Statement =>
	statementOf({ statement, createdAt, hide, statementType: StatementType.paragraph });

const PARAGRAPHS = [paragraph('alpha one', 1), paragraph('beta two', 2), paragraph('gamma', 3)];

describe('descriptionOrigin', () => {
	it.each<[string, string | undefined, Statement[], string]>([
		['no description', undefined, PARAGRAPHS, 'own-words'],
		['no paragraphs', 'alpha one', [], 'own-words'],
		['the sync form', 'alpha one\n\nbeta two\n\ngamma', PARAGRAPHS, 'full-copy'],
		['the same words with bars', 'alpha one | beta two | gamma', PARAGRAPHS, 'full-copy'],
		['a preview of some paragraphs', 'beta two | gamma', PARAGRAPHS, 'partial-copy'],
		['a preview cut mid-word', 'alpha one | beta t...', PARAGRAPHS, 'partial-copy'],
		['the sync form cut short', 'alpha one\n\n…[truncated]', PARAGRAPHS, 'full-copy'],
		['a foreign word', 'alpha idiot', PARAGRAPHS, 'own-words'],
		['a foreign word posing as a cut one', 'alpha idiot...', PARAGRAPHS, 'own-words'],
	])('reads %s', (_label, description, paragraphs, expected) => {
		expect(descriptionOrigin(description, paragraphs)).toBe(expected);
	});

	it('counts a preview that still shows a hidden paragraph as a copy', () => {
		const paragraphs = [paragraph('seen', 1), paragraph('hidden', 2, true)];

		expect(descriptionOrigin('seen | hidden', paragraphs)).toBe('partial-copy');
	});
});

describe('answerFullText with paragraph children', () => {
	it('uses the children in place of a description that copies them', () => {
		const answer = statementOf({ statement: 'Title', description: 'beta two | gamma' });

		expect(answerFullText(answer, PARAGRAPHS)).toBe('Title\nalpha one\nbeta two\ngamma');
	});

	it('keeps a description holding words of its own', () => {
		const answer = statementOf({ statement: 'Title', description: 'other words' });

		expect(answerFullText(answer, [paragraph('alpha', 1)])).toBe('Title\nother words\nalpha');
	});

	it('leaves out hidden children and follows their order', () => {
		const paragraphs = [
			statementOf({ statement: 'second', order: 2, createdAt: 1 }),
			statementOf({ statement: 'first', order: 1, createdAt: 2 }),
			paragraph('hidden', 3, true),
		];

		expect(answerFullText(statementOf({ statement: 'Title' }), paragraphs)).toBe(
			'Title\nfirst\nsecond',
		);
	});
});

describe('hasSameWords', () => {
	it.each<[string, string, string, boolean]>([
		['a layout change', 'a\nb', 'a | b', true],
		['a shortened copy', 'a long text', 'a lo...', true],
		['text growing out of an ellipsis', 'a lo...', 'a long text', false],
		['new words', 'a b', 'a c', false],
	])('judges %s', (_label, earlier, later, expected) => {
		expect(hasSameWords(earlier, later)).toBe(expected);
	});
});

describe('changedOnlyDescription', () => {
	const before = statementOf({ statement: 'Title', description: 'old' });

	it('is true when only the description moved', () => {
		expect(changedOnlyDescription(before, { ...before, description: 'new' })).toBe(true);
	});

	it('is false when nothing moved', () => {
		expect(changedOnlyDescription(before, { ...before })).toBe(false);
	});

	it('is false when the title moved too', () => {
		expect(
			changedOnlyDescription(before, { ...before, statement: 'Other', description: 'new' }),
		).toBe(false);
	});
});
