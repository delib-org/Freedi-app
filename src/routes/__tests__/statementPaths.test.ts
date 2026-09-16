import {
	buildStatementPath,
	canonicalView,
	canonicalizeStatementPath,
	parseStatementPath,
	resolveTabView,
} from '../statementPaths';

describe('question tabs in the current shell', () => {
	it.each([
		'background',
		'chat',
		'options',
		'questions',
		'results',
		'maps',
		'covenant',
		'themes',
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

	it('preserves unrelated query parameters', () => {
		expect(
			buildStatementPath({
				statementId: 'q1',
				view: 'chat',
				query: new URLSearchParams('source=notification'),
			}),
		).toBe('/statement/q1?source=notification&tab=chat');
	});

	it('keeps map screens on the screen route', () => {
		expect(buildStatementPath({ statementId: 'q1', view: 'mind-map' })).toBe(
			'/statement-screen/q1/mind-map',
		);
		expect(canonicalizeStatementPath('/statement/q1/cluster-board')).toBe(
			'/statement-screen/q1/cluster-board',
		);
	});
});

describe('legacy aliases', () => {
	it.each([
		['/statement/q1?tab=overview', '/statement/q1?tab=results'],
		['/statement/q1?tab=summary', '/statement/q1?tab=results'],
		['/statement/q1?tab=covenant', '/statement/q1?tab=covenant'],
		['/statement/q1?tab=themes', '/statement/q1?tab=themes'],
		['/statement/q1/overview', '/statement/q1?tab=results'],
		['/statement/q1/summary', '/statement/q1?tab=results'],
		['/statement/q1/results', '/statement/q1?tab=results'],
		['/statement/q1/agreement', '/statement/q1?tab=covenant'],
		['/statement/q1/covenant', '/statement/q1?tab=covenant'],
		['/statement/q1/themes', '/statement/q1?tab=themes'],
		['/statement/q1/maps', '/statement/q1?tab=maps'],
	])('%s → %s', (legacy, canonical) => {
		expect(canonicalizeStatementPath(legacy)).toBe(canonical);
	});

	it('builds retired views under their new names', () => {
		expect(buildStatementPath({ statementId: 'q1', view: 'overview' })).toBe(
			'/statement/q1?tab=results',
		);
		expect(buildStatementPath({ statementId: 'q1', view: 'agreement' })).toBe(
			'/statement/q1?tab=covenant',
		);
	});

	it('parses retired tabs as their new view', () => {
		expect(parseStatementPath('/statement/q1', '?tab=overview')?.view).toBe('results');
		expect(parseStatementPath('/statement/q1', '?tab=summary')?.view).toBe('results');
	});

	it('canonicalView is idempotent', () => {
		expect(canonicalView(canonicalView('overview'))).toBe('results');
		expect(canonicalView('chat')).toBe('chat');
		expect(canonicalView(undefined)).toBeUndefined();
	});

	it('canonicalizing twice changes nothing', () => {
		const once = canonicalizeStatementPath('/statement/q1/overview?x=1');
		expect(canonicalizeStatementPath(once ?? '')).toBe(once);
	});
});

describe('resolveTabView', () => {
	it.each([
		['results', 'results'],
		['overview', 'results'],
		['covenant', 'results'],
		['themes', 'maps'],
		['vote', 'options'],
		['background', 'background'],
	] as const)('%s highlights %s', (view, tab) => {
		expect(resolveTabView(view, undefined)).toBe(tab);
	});

	it('falls back to the default view, legacy names included', () => {
		expect(resolveTabView(undefined, 'options')).toBe('options');
		expect(resolveTabView(undefined, 'overview')).toBe('results');
		expect(resolveTabView('mind-map', undefined)).toBe('chat');
	});
});
