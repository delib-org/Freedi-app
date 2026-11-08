import { isSummaryObsolete } from '../summaryObsolete';

type Input = Parameters<typeof isSummaryObsolete>[0];
const results = (ids: string[]): Input['results'] =>
	ids.map((statementId) => ({ statementId })) as Input['results'];

describe('isSummaryObsolete', () => {
	it('is false when the selection is the same, in any order', () => {
		expect(
			isSummaryObsolete({ summarySelectedIds: ['a', 'b'], results: results(['b', 'a']) }),
		).toBe(false);
	});

	it('is true when an option was added, removed or swapped', () => {
		expect(isSummaryObsolete({ summarySelectedIds: ['a'], results: results(['a', 'b']) })).toBe(
			true,
		);
		expect(isSummaryObsolete({ summarySelectedIds: ['a', 'b'], results: results(['a']) })).toBe(
			true,
		);
		expect(isSummaryObsolete({ summarySelectedIds: ['a'], results: results(['c']) })).toBe(true);
	});

	it('is false for old summaries without summarySelectedIds', () => {
		expect(isSummaryObsolete({ results: results(['a']) })).toBe(false);
	});

	it('is false while the selection is not loaded', () => {
		expect(isSummaryObsolete({ summarySelectedIds: ['a'] })).toBe(false);
	});
});
