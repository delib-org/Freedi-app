import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Statement } from '@freedi/shared-types';

const store = vi.hoisted(() => ({ main: null as unknown }));

vi.mock('mithril', () => ({ default: { redraw: vi.fn() } }));
vi.mock('@/lib/firebase', () => ({
	db: {},
	doc: vi.fn(),
	getDoc: vi.fn(() => new Promise(() => undefined)),
}));
vi.mock('@/lib/store', () => ({ getMainStatement: () => store.main }));
vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }));

import { planBack } from '../consoleBack';

function lesson(statementId: string, planId?: string): Statement {
	return {
		statementId,
		statement: `lesson ${statementId}`,
		statementSettings: planId ? { classLesson: { planId, gameId: 'g1' } } : {},
	} as unknown as Statement;
}

describe('planBack', () => {
	beforeEach(() => {
		store.main = null;
	});

	it('with no lesson loaded: the home, named by the plan fallback', () => {
		expect(planBack('a')).toEqual({ href: '/t', label: 'classPlan.parent' });
	});

	it("a lesson that is not the route's lesson counts as not loaded", () => {
		store.main = lesson('A', 'planA');
		expect(planBack('B')).toEqual({ href: '/t', label: 'classPlan.parent' });
	});

	it("the route's own lesson goes to its plan, named by the fallback until the title loads", () => {
		store.main = lesson('B', 'planB');
		expect(planBack('B')).toEqual({ href: '/t/plans/planB', label: 'classPlan.parent' });
	});

	it('an old lesson is its own plan and is named after itself', () => {
		store.main = lesson('old');
		expect(planBack('old')).toEqual({ href: '/t/plans/old', label: 'lesson old' });
	});

	it('without a route mid, whatever is loaded counts (the end-of-lesson choice)', () => {
		store.main = lesson('B', 'planB');
		expect(planBack().href).toBe('/t/plans/planB');
	});

	it('never uses the retired classPlan.back key', () => {
		expect(planBack('x').label).not.toBe('classPlan.back');
	});
});
