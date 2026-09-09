import {
	buildStatementPath,
	canonicalizeStatementPath,
	parseStatementPath,
} from '../statementPaths';

describe('UX branch links in the current shell', () => {
	it.each([
		'overview',
		'chat',
		'options',
		'questions',
		'themes',
		'covenant',
		'summary',
		'maps',
		'vote',
	] as const)('keeps the %s tab', (view) => {
		const path = buildStatementPath({ statementId: 'q1', view });
		expect(path).toBe(`/statement/q1?tab=${view}`);
		expect(parseStatementPath(path)?.view).toBe(view);
	});
	it('opens host sections through the current settings route', () => {
		expect(canonicalizeStatementPath('/statement/q1/settings?section=people')).toBe(
			'/statement-screen/q1/settings?section=people',
		);
	});
	it('uses this branch’s agreement and result screens', () => {
		expect(canonicalizeStatementPath('/statement/q1/agreement')).toBe('/statement/q1?tab=covenant');
		expect(canonicalizeStatementPath('/statement/q1/results')).toBe('/statement/q1?tab=summary');
	});
	it('preserves unrelated query parameters', () => {
		expect(
			buildStatementPath({
				statementId: 'q1',
				view: 'chat',
				query: new URLSearchParams('source=notification'),
			}),
		).toBe('/statement/q1?source=notification&tab=chat');
	});
});
