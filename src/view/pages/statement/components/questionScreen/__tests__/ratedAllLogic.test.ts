import { UI } from '@/constants/common';
import { RatingProgress, shouldAnnounceRatedAll } from '../ratedAllLogic';

const OPENED_AT = 1000;

function progress(overrides: Partial<RatingProgress> = {}): RatingProgress {
	return {
		ratedCount: 2,
		rateableCount: 3,
		answersComplete: true,
		lastRatedAt: OPENED_AT + 1,
		...overrides,
	};
}

const finished = (overrides: Partial<RatingProgress> = {}): RatingProgress =>
	progress({ ratedCount: 3, ...overrides });

function announce(
	previous: RatingProgress,
	current: RatingProgress,
	ratedAtLastNotice?: number,
): boolean {
	return shouldAnnounceRatedAll({ previous, current, openedAt: OPENED_AT, ratedAtLastNotice });
}

describe('shouldAnnounceRatedAll', () => {
	it('announces the moment the last answer is rated', () => {
		expect(announce(progress(), finished())).toBe(true);
	});

	it('stays silent for a rating that does not finish the set', () => {
		expect(announce(progress({ ratedCount: 1 }), progress({ ratedCount: 2 }))).toBe(false);
	});

	it('never claims "all" while only part of the answers is loaded', () => {
		expect(announce(progress(), finished({ answersComplete: false }))).toBe(false);
	});

	it('stays silent while older ratings load when the question opens', () => {
		expect(announce(progress(), finished({ lastRatedAt: OPENED_AT - 1 }))).toBe(false);
	});

	it('stays silent when the full list arrives without a new rating', () => {
		const partial = finished({ answersComplete: false });

		expect(announce(partial, finished())).toBe(false);
	});

	it('stays silent when an answer disappears and the rest happen to be rated', () => {
		expect(announce(progress(), progress({ rateableCount: 2 }))).toBe(false);
	});

	it('stays silent on a repeat render of the finished state', () => {
		expect(announce(finished(), finished())).toBe(false);
	});

	it('stays silent with nothing to rate', () => {
		const none = { ratedCount: 0, rateableCount: 0 };

		expect(announce(progress(none), progress(none))).toBe(false);
	});

	it('waits for a real new batch before saying it again', () => {
		const batch = UI.RATED_ALL_REPEAT_MIN_RATINGS;
		const previous = progress({ ratedCount: 2 + batch, rateableCount: 3 + batch });
		const current = finished({ ratedCount: 3 + batch, rateableCount: 3 + batch });

		expect(announce(previous, current, 3 + batch - 1)).toBe(false);
		expect(announce(previous, current, 3)).toBe(true);
	});
});
