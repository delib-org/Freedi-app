import { describe, it, expect, jest } from '@jest/globals';

// libraryAccess imports ../db (getFirestore on an uninitialised app); all pure here.
jest.mock('../../db', () => ({ db: {} }));

import { countPost, countReport } from '../libraryAccess';

const now = Date.UTC(2026, 9, 14, 12);

describe('countPost', () => {
	it('counts from one on a fresh day and stops at the daily limit', () => {
		expect(countPost(undefined, now)).toEqual({ postsDay: '2026-10-14', postsToday: 1 });
		expect(countPost({ postsDay: '2026-10-14', postsToday: 29 }, now)?.postsToday).toBe(30);
		expect(countPost({ postsDay: '2026-10-14', postsToday: 30 }, now)).toBeNull();
	});
	it('starts over on a new day', () => {
		expect(countPost({ postsDay: '2026-10-13', postsToday: 30 }, now)?.postsToday).toBe(1);
	});
});

describe('countReport', () => {
	it('counts from one on a fresh day and stops at the daily limit', () => {
		expect(countReport(undefined, now)).toEqual({ reportsDay: '2026-10-14', reportsToday: 1 });
		expect(countReport({ reportsDay: '2026-10-14', reportsToday: 20 }, now)).toBeNull();
	});
	it('starts over on a new day', () => {
		expect(countReport({ reportsDay: '2026-10-13', reportsToday: 20 }, now)?.reportsToday).toBe(1);
	});
});
