import { SortType, Statement } from '@freedi/shared-types';
import { applyManualOrder, sortStatements } from '../suggestionOrdering';

function option(id: string, overrides: Partial<Statement> = {}): Statement {
	return {
		statementId: id,
		statement: id,
		createdAt: 0,
		lastUpdate: 0,
		...overrides,
	} as Statement;
}

describe('applyManualOrder', () => {
	it('places answers in the saved order', () => {
		const options = [option('a'), option('b'), option('c')];

		const ordered = applyManualOrder(options, ['c', 'a', 'b']);

		expect(ordered.map((o) => o.statementId)).toEqual(['c', 'a', 'b']);
	});

	it('appends answers that arrived after the order was saved', () => {
		// A new answer must never be silently dropped just because the admin
		// placed the list before it existed.
		const options = [option('a'), option('new'), option('b')];

		const ordered = applyManualOrder(options, ['b', 'a']);

		expect(ordered.map((o) => o.statementId)).toEqual(['b', 'a', 'new']);
	});

	it('ignores ids in the saved order that no longer exist', () => {
		const options = [option('a'), option('b')];

		const ordered = applyManualOrder(options, ['deleted', 'b', 'a']);

		expect(ordered.map((o) => o.statementId)).toEqual(['b', 'a']);
	});

	it('does not mutate the input array', () => {
		const options = [option('a'), option('b')];

		applyManualOrder(options, ['b', 'a']);

		expect(options.map((o) => o.statementId)).toEqual(['a', 'b']);
	});
});

describe('sortStatements', () => {
	it('ranks by average rating', () => {
		// This case previously fell through to `default` and returned the list
		// untouched, so the Join app's "by average" sort did nothing here.
		const options = [
			option('low', { evaluation: { averageEvaluation: 0.1 } as Statement['evaluation'] }),
			option('high', { evaluation: { averageEvaluation: 0.9 } as Statement['evaluation'] }),
			option('mid', { evaluation: { averageEvaluation: 0.5 } as Statement['evaluation'] }),
		];

		const sorted = sortStatements(options, SortType.averageEvaluation, 0);

		expect(sorted.map((o) => o.statementId)).toEqual(['high', 'mid', 'low']);
	});

	it('treats a missing average as the lowest rank rather than dropping the answer', () => {
		const options = [
			option('none'),
			option('rated', { evaluation: { averageEvaluation: 0.4 } as Statement['evaluation'] }),
		];

		const sorted = sortStatements(options, SortType.averageEvaluation, 0);

		expect(sorted.map((o) => o.statementId)).toEqual(['rated', 'none']);
	});

	it('ranks newest first by creation time', () => {
		const options = [option('old', { createdAt: 1 }), option('new', { createdAt: 9 })];

		expect(sortStatements(options, SortType.newest, 0).map((o) => o.statementId)).toEqual([
			'new',
			'old',
		]);
	});

	it('gives every viewer the same shuffle for a shared random seed', () => {
		const options = [option('a'), option('b'), option('c'), option('d')];

		const first = sortStatements(options, SortType.random, 12345).map((o) => o.statementId);
		const second = sortStatements(options, SortType.random, 12345).map((o) => o.statementId);

		expect(first).toEqual(second);
	});

	it('leaves a backend-ordered list untouched', () => {
		const options = [option('b'), option('a')];

		expect(sortStatements(options, SortType.backendOrder, 0).map((o) => o.statementId)).toEqual([
			'b',
			'a',
		]);
	});

	it('does not mutate the input array', () => {
		const options = [option('old', { createdAt: 1 }), option('new', { createdAt: 9 })];

		sortStatements(options, SortType.newest, 0);

		expect(options.map((o) => o.statementId)).toEqual(['old', 'new']);
	});
});
