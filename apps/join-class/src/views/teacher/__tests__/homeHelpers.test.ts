import { describe, it, expect } from 'vitest';
import { filterLessons, foldForSearch, gameChipsOf, statusChipOf } from '../homeHelpers';

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

describe('gameChipsOf', () => {
	const game = (gameId: string, title: string, order: number, removedAt?: number) => ({
		gameId,
		title,
		order,
		...(removedAt === undefined ? {} : { removedAt }),
	});

	it('lists the games in the plan order, whatever order they were read in', () => {
		const chips = gameChipsOf([game('b', 'Second', 1), game('a', 'First', 0)]);

		expect(chips).toEqual([
			{ id: 'a', title: 'First' },
			{ id: 'b', title: 'Second' },
		]);
	});

	it('leaves out a removed game, as the count on the card does', () => {
		expect(gameChipsOf([game('a', 'Kept', 0), game('b', 'Removed', 1, 1700000000000)])).toEqual([
			{ id: 'a', title: 'Kept' },
		]);
	});

	it('leaves out a game with no name and trims the others', () => {
		expect(gameChipsOf([game('a', '   ', 0), game('b', '  Named  ', 1)])).toEqual([
			{ id: 'b', title: 'Named' },
		]);
	});

	it('is empty while the games have not been read yet', () => {
		expect(gameChipsOf(undefined)).toEqual([]);
		expect(gameChipsOf([])).toEqual([]);
	});

	it('does not reorder the list it was given', () => {
		const games = [game('b', 'Second', 1), game('a', 'First', 0)];
		gameChipsOf(games);

		expect(games.map((g) => g.gameId)).toEqual(['b', 'a']);
	});
});
