import { describe, expect, it, vi } from 'vitest';
import type { SupportBySide } from '@freedi/shared-types';

vi.mock('../api', () => ({ classRegistrationSupport: vi.fn() }));

import {
	SUPPORT_REFRESH_MS,
	fetchIsDue,
	supportViewOf,
	type RegistrationSupportState,
} from '../registrationSupport';

const SUPPORT: SupportBySide = {
	a: { mean: 0.5, n: 3, m: 4 },
	center: { mean: 0, n: 0, m: 0 },
	b: { mean: 0.2, n: 2, m: 2 },
	verdict: 'closer',
};

function state(overrides: Partial<RegistrationSupportState> = {}): RegistrationSupportState {
	return { mainId: null, data: null, loading: false, failed: false, fetchedAt: 0, ...overrides };
}

const ASKED = {
	statementSettings: {
		classRegistration: { tableAssignmentId: 'r', connectedAt: 1, sideStepRemoved: true },
	},
};
const NOT_ASKED = {
	statementSettings: { classRegistration: { tableAssignmentId: 'r', connectedAt: 1 } },
};

describe('supportViewOf', () => {
	it('leaves a lesson whose registration asked no position to its own Side step', () => {
		expect(supportViewOf(NOT_ASKED, state(), 'm1')).toEqual({ kind: 'own' });
		expect(supportViewOf(null, state(), 'm1')).toEqual({ kind: 'own' });
	});

	it('waits while the totals load, and says so when they fail', () => {
		expect(supportViewOf(ASKED, state(), 'm1')).toEqual({ kind: 'loading' });
		expect(supportViewOf(ASKED, state({ mainId: 'm1', failed: true }), 'm1')).toEqual({
			kind: 'failed',
		});
		// a failure of another lesson is not this lesson's
		expect(supportViewOf(ASKED, state({ mainId: 'other', failed: true }), 'm1')).toEqual({
			kind: 'loading',
		});
	});

	it('names the two sides by the registration poles', () => {
		const ready = supportViewOf(
			ASKED,
			state({ mainId: 'm1', data: { poleA: 'Pro', poleB: 'Con', support: SUPPORT } }),
			'm1',
		);
		expect(ready).toEqual({ kind: 'ready', result: SUPPORT, names: { a: 'Pro', b: 'Con' } });
	});
});

describe('fetchIsDue', () => {
	it('asks at once for a lesson it has not asked about', () => {
		expect(fetchIsDue(state(), 'm1', 1000)).toBe(true);
		expect(fetchIsDue(state({ mainId: 'other', fetchedAt: 999 }), 'm1', 1000)).toBe(true);
	});

	it('does not ask while a call is in flight', () => {
		expect(fetchIsDue(state({ loading: true }), 'm1', 1000)).toBe(false);
	});

	it('asks again only once the answer is stale', () => {
		const fresh = state({ mainId: 'm1', fetchedAt: 1000 });
		expect(fetchIsDue(fresh, 'm1', 1000 + SUPPORT_REFRESH_MS - 1)).toBe(false);
		expect(fetchIsDue(fresh, 'm1', 1000 + SUPPORT_REFRESH_MS)).toBe(true);
	});
});
