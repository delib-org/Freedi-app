// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import m from 'mithril';
import type { ClassTable } from '@freedi/shared-types';

vi.mock('@/lib/firebase', () => ({}));
vi.mock('@/lib/store', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/lib/store')>()),
	getMainStatement: () => ({ statementId: 'm', statement: 'Lesson', statementSettings: {} }),
}));

import type { RosterStudent } from '@/lib/classroom/consoleHelpers';
import { mountSmoke } from '@/views/__tests__/mountSmoke';
import { TableCard } from '../TableCard';

/**
 * The card's "now" line carries `table-card__now--done` once the table has finished, so the
 * look can draw the "ready" mark on it (redesign port spec). The words are the cue; the
 * modifier only follows them, and a table that is still working never gets it.
 */

const students = new Map<string, RosterStudent>([
	['a', { uid: 'a', name: 'Noa', chosen: false, tableId: 'm--1' }],
	['b', { uid: 'b', name: 'Avi', chosen: false, tableId: 'm--1' }],
]);

function table(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--1',
		mainId: 'm',
		n: 1,
		memberUids: ['a', 'b'],
		noDeviceMembers: [],
		step: 'pick',
		askerUid: null,
		turn: 1,
		writingMode: 'each',
		writingLocked: false,
		spokenUids: [],
		usedQuestionIds: [],
		updatedAt: 0,
		...overrides,
	};
}

function nowLine(overrides: Partial<ClassTable>, tableTalk: boolean): Element | null {
	const mounted = mountSmoke(() =>
		m(TableCard, {
			table: table(overrides),
			students,
			mainId: 'm',
			tableNumbers: [1, 2],
			plenum: false,
			tableTalk,
		}),
	);
	const line = mounted.root.querySelector('.table-card__now')?.cloneNode(true) as Element | null;
	mounted.unmount();

	return line ?? null;
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('the "now" line of a table card', () => {
	it('is marked done at Table talk once everyone has asked, with the words "all done"', () => {
		const line = nowLine({ askedUids: ['a', 'b'] }, true);

		expect(line?.classList.contains('table-card__now--done')).toBe(true);
		expect(line?.textContent).toBe('console.all_done');
	});

	it('counts a tablemate who passed on asking as done too', () => {
		const line = nowLine({ askedUids: ['a'], passedAskingUids: ['b'] }, true);

		expect(line?.classList.contains('table-card__now--done')).toBe(true);
	});

	it('is not marked done while the table is still choosing a question', () => {
		const line = nowLine({ askedUids: ['a'] }, true);

		expect(line).not.toBeNull();
		expect(line?.classList.contains('table-card__now--done')).toBe(false);
		expect(line?.textContent).toBe('console.now_pick');
	});

	it('has no "now" line at Proposals while the table still works: the step marker says it', () => {
		const line = nowLine({ step: 'rate' }, false);

		expect(line).toBeNull();
	});
});
