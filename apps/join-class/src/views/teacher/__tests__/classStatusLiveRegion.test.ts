// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';

vi.mock('@/lib/i18n', () => ({
	t: (key: string, params?: Record<string, string | number>): string =>
		params ? `${key} ${JSON.stringify(params)}` : key,
}));

import type { ClassStatusInput } from '@/lib/classroom/classStatus';
import { mountSmoke } from '@/views/__tests__/mountSmoke';
import { ClassStatusLine } from '../ClassStatusLine';

const SIDE: ClassStatusInput = {
	status: 'live',
	stepKey: 'side',
	joined: 6,
	classSize: 6,
	projectorWhat: '',
	chose: 2,
	sideTotal: 6,
	tableCount: 0,
	unseated: 0,
	tablesDone: 0,
	tablesRating: 0,
	allRated: null,
	ballotFrozen: false,
	ballotPaused: false,
	ballotClosed: false,
	voted: 0,
	present: 6,
	resultsShown: false,
	stuckTables: [],
};

const draw = (input: ClassStatusInput, primaryLabel: string) => () =>
	m(ClassStatusLine, { input, words: { stepName: 'Side', primaryLabel } });

afterEach(() => vi.useRealTimers());

describe('the hidden live region of the status line', () => {
	it('names the primary button as it reads when the pause is over, not as it read when "ready" turned on', () => {
		vi.useFakeTimers();
		const mounted = mountSmoke(draw(SIDE, 'Close vote'));
		mounted.update(draw({ ...SIDE, chose: 6 }, 'Close vote'));
		// the write that closes the vote lands during the pause: the button now reads something else
		mounted.update(draw({ ...SIDE, chose: 6 }, 'Show results'));
		vi.advanceTimersByTime(1500);
		mounted.redraw();
		const spoken = mounted.root.querySelector('[role="status"]')?.textContent ?? '';

		expect(spoken).toContain('console.ready_live');
		expect(spoken).toContain('Show results');
		expect(spoken).not.toContain('Close vote');
		mounted.unmount();
	});
});
