import { describe, expect, it, vi } from 'vitest';

vi.mock('@/firebase', () => ({ db: {} }));

const { followMePathFor, isFollowingActivity } = await import('../db/followMe');

describe('followMe', () => {
	it('builds the main-app style path Join expects', () => {
		expect(followMePathFor('abc')).toBe('/statement/abc');
	});

	it('detects whether the top statement is steering to this activity', () => {
		expect(isFollowingActivity('/statement/abc', 'abc')).toBe(true);
		expect(isFollowingActivity('/statement/other', 'abc')).toBe(false);
		expect(isFollowingActivity('', 'abc')).toBe(false);
		expect(isFollowingActivity(undefined, 'abc')).toBe(false);
	});
});
