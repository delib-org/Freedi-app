import { describe, expect, it, vi } from 'vitest';
import {
	currentNavKey,
	readSidebarState,
	SIDEBAR_STORAGE_KEY,
	writeSidebarState,
	type NavRouteLookup,
} from '../teacherSidebar';

describe('remembered side bar state', () => {
	it('reads "folded" when that is what was stored', () => {
		const getItem = vi.fn().mockReturnValue('folded');

		expect(readSidebarState({ getItem })).toBe('folded');
		expect(getItem).toHaveBeenCalledWith(SIDEBAR_STORAGE_KEY);
	});

	it('is open the first time on a device', () => {
		expect(readSidebarState({ getItem: () => null })).toBe('open');
	});

	it('is open for a value it does not know', () => {
		expect(readSidebarState({ getItem: () => 'collapsed' })).toBe('open');
	});

	it('is open when the storage throws', () => {
		const getItem = (): string => {
			throw new Error('blocked');
		};

		expect(readSidebarState({ getItem })).toBe('open');
	});

	it('is open when there is no storage at all', () => {
		expect(readSidebarState(null)).toBe('open');
	});

	it('writes under the agreed key', () => {
		const setItem = vi.fn();
		writeSidebarState('folded', { setItem });

		expect(setItem).toHaveBeenCalledWith('agora_teacher_sidebar', 'folded');
	});

	it('does not throw when the storage refuses a write', () => {
		const setItem = (): void => {
			throw new Error('quota');
		};

		expect(() => writeSidebarState('open', { setItem })).not.toThrow();
		expect(() => writeSidebarState('open', null)).not.toThrow();
	});
});

describe('which row is current', () => {
	const lookup: NavRouteLookup = {
		hasClass: (id) => id === 'c1',
		isLiveSession: (id) => id === 's1',
		sessionClassId: (id) =>
			id === 'past-in-c1' ? 'c1' : id === 'past-in-gone' ? 'gone' : undefined,
	};
	const at = (route: string): string | null => currentNavKey(route, lookup);

	it('maps the teachers room and its help link apart', () => {
		expect(at('/teach')).toBe('home');
		expect(at('/teach?help=1')).toBe('help');
		expect(at('/teach?x=2')).toBe('home');
	});

	it('maps scenarios and their sub-routes to My scenarios', () => {
		expect(at('/teach/scenarios')).toBe('scenarios');
		expect(at('/teach/scenarios/new')).toBe('scenarios');
		expect(at('/teach/scenarios/abc')).toBe('scenarios');
	});

	it('maps the library, its scenarios and its admin separately', () => {
		expect(at('/teach/library')).toBe('library');
		expect(at('/teach/library/xyz')).toBe('library');
		expect(at('/teach/library/admin')).toBe('library-admin');
	});

	it('maps start, lessons, activity and words to their own rows', () => {
		expect(at('/teach/start')).toBe('start');
		expect(at('/teach/lessons')).toBe('lessons');
		expect(at('/teach/activity')).toBe('activity');
		expect(at('/teach/words')).toBe('words');
	});

	it('maps a class and its students to that class', () => {
		expect(at('/teach/class/c1')).toBe('class:c1');
		expect(at('/teach/class/c1/student/m9')).toBe('class:c1');
	});

	it('marks nothing for a class the teacher does not list', () => {
		expect(at('/teach/class/other')).toBeNull();
	});

	it('maps a live lesson and its class view to the live row', () => {
		expect(at('/teach/session/s1')).toBe('live:s1');
		expect(at('/teach/session/s1/class')).toBe('live:s1');
		expect(at('/teach/session/done')).toBeNull();
	});

	it('maps a report to its class, or to past lessons when the class is not listed', () => {
		expect(at('/teach/report/past-in-c1')).toBe('class:c1');
		expect(at('/teach/report/past-in-gone')).toBe('lessons');
		expect(at('/teach/report/unknown')).toBe('lessons');
	});

	it('maps every supervision page to the supervision row', () => {
		expect(at('/supervise')).toBe('supervise');
		expect(at('/supervise/class/c1')).toBe('supervise');
		expect(at('/supervise/teacher/s/u')).toBe('supervise');
	});

	it('marks nothing outside the teacher area', () => {
		expect(at('/join/123')).toBeNull();
		expect(at('/')).toBeNull();
	});
});
