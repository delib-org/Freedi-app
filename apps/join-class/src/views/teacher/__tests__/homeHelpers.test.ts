import { describe, it, expect } from 'vitest';
import { filterLessons, foldForSearch, statusChipOf } from '../homeHelpers';

describe('statusChipOf', () => {
	it('a live lesson on step 0 has not started', () => {
		expect(statusChipOf('live', 0)).toEqual({
			mark: 'not-started',
			key: 'teacher.row.not_started',
		});
	});

	it('a live lesson past step 0 shows its step', () => {
		expect(statusChipOf('live', 3)).toEqual({ mark: 'live', key: 'lesson.step_of' });
	});

	it('paused, open and ended each have their own mark and words', () => {
		expect(statusChipOf('paused', 4)).toEqual({ mark: 'paused', key: 'teacher.row.paused' });
		expect(statusChipOf('open', 7)).toEqual({ mark: 'open', key: 'teacher.row.open_after' });
		expect(statusChipOf('ended', 7)).toEqual({ mark: 'ended', key: 'teacher.row.ended' });
	});
});

describe('filterLessons', () => {
	const lessons = [
		{ title: 'האיסור על טלפונים' },
		{ title: 'Uniform Dress Code' },
		{ title: 'שִׁיעוּרֵי בַּיִת' },
	];

	it('returns everything for an empty filter', () => {
		expect(filterLessons(lessons, '  ')).toHaveLength(3);
	});

	it('matches case-insensitively', () => {
		expect(filterLessons(lessons, 'dress')).toEqual([lessons[1]]);
	});

	it('matches Hebrew through niqqud', () => {
		expect(filterLessons(lessons, 'שיעורי')).toEqual([lessons[2]]);
		expect(foldForSearch('שִׁיעוּרֵי')).toBe('שיעורי');
	});

	it('returns nothing when no name matches', () => {
		expect(filterLessons(lessons, 'zzz')).toEqual([]);
	});
});
