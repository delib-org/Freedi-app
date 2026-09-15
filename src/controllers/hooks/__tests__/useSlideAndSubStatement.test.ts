import {
	getNavigationLevel,
	levelTransitionClass,
	resolveLevelTransition,
	statementIdFromPath,
} from '../useSlideAndSubStatement';

jest.mock('@/controllers/hooks/reduxHooks', () => ({ useAppSelector: jest.fn() }));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ dir: 'rtl', t: (key: string) => key }),
}));

describe('getNavigationLevel', () => {
	it('puts home, inbox and me at the tab level', () => {
		expect(getNavigationLevel('/home')).toBe(0);
		expect(getNavigationLevel('/')).toBe(0);
		expect(getNavigationLevel('/my')).toBe(0);
		expect(getNavigationLevel('/my/engagement')).toBe(0);
	});

	it('puts questions one level deeper', () => {
		expect(getNavigationLevel('/statement/q1')).toBe(1);
		expect(getNavigationLevel('/stage/q1')).toBe(1);
		expect(getNavigationLevel('/statement-screen/q1/settings')).toBe(1);
		expect(getNavigationLevel('/my-suggestions/statement/q1')).toBe(1);
	});

	it('puts full-screen maps deepest', () => {
		expect(getNavigationLevel('/map/q1')).toBe(2);
		expect(getNavigationLevel('/statement-screen/q1/mind-map')).toBe(2);
	});
});

describe('statementIdFromPath', () => {
	it('reads the statement id from every statement family', () => {
		expect(statementIdFromPath('/statement/q1')).toBe('q1');
		expect(statementIdFromPath('/statement-screen/q%201/mind-map')).toBe('q 1');
		expect(statementIdFromPath('/home')).toBeUndefined();
		expect(statementIdFromPath(null)).toBeUndefined();
	});
});

describe('resolveLevelTransition', () => {
	it('does nothing on first load or for the same path', () => {
		expect(resolveLevelTransition({ fromPath: null, toPath: '/home', navigationType: 'POP' })).toBe(
			'none',
		);
		expect(
			resolveLevelTransition({
				fromPath: '/statement/q1',
				toPath: '/statement/q1',
				navigationType: 'PUSH',
			}),
		).toBe('none');
	});

	it('pushes when going deeper', () => {
		expect(
			resolveLevelTransition({
				fromPath: '/home',
				toPath: '/statement/q1',
				navigationType: 'PUSH',
			}),
		).toBe('push');
		expect(
			resolveLevelTransition({
				fromPath: '/statement/q1',
				toPath: '/map/q1',
				navigationType: 'PUSH',
			}),
		).toBe('push');
	});

	it('pops when going up, by back button or by link', () => {
		expect(
			resolveLevelTransition({ fromPath: '/statement/q1', toPath: '/home', navigationType: 'POP' }),
		).toBe('pop');
		expect(
			resolveLevelTransition({
				fromPath: '/map/q1',
				toPath: '/statement/q1',
				navigationType: 'POP',
			}),
		).toBe('pop');
		expect(
			resolveLevelTransition({ fromPath: '/statement/q1', toPath: '/my', navigationType: 'PUSH' }),
		).toBe('pop');
	});

	it('does not animate between tabs', () => {
		expect(
			resolveLevelTransition({ fromPath: '/home', toPath: '/my', navigationType: 'PUSH' }),
		).toBe('none');
	});

	it('does not animate between views of one question', () => {
		expect(
			resolveLevelTransition({
				fromPath: '/statement/q1',
				toPath: '/statement-screen/q1/settings',
				navigationType: 'PUSH',
			}),
		).toBe('none');
	});

	it('pushes to another question and pops on back or to the parent', () => {
		expect(
			resolveLevelTransition({
				fromPath: '/statement/q1',
				toPath: '/statement/q2',
				navigationType: 'PUSH',
			}),
		).toBe('push');
		expect(
			resolveLevelTransition({
				fromPath: '/statement/q2',
				toPath: '/statement/q1',
				navigationType: 'POP',
			}),
		).toBe('pop');
		expect(
			resolveLevelTransition({
				fromPath: '/statement/child',
				toPath: '/statement/parent',
				navigationType: 'PUSH',
				toIsParentOfFrom: true,
			}),
		).toBe('pop');
	});
});

describe('levelTransitionClass', () => {
	it('builds BEM classes per direction and reading direction', () => {
		expect(levelTransitionClass('none', 'rtl')).toBe('');
		expect(levelTransitionClass('push', 'rtl')).toBe(
			'level-transition level-transition--push level-transition--rtl',
		);
		expect(levelTransitionClass('pop', 'ltr')).toBe(
			'level-transition level-transition--pop level-transition--ltr',
		);
	});
});
