import { PARTICIPATION } from '@/constants/common';
import {
	formatCompactCount,
	publicDecidedCount,
	shouldRefreshProgress,
	toPublicParticipation,
} from '../participationVisibility';

const { MIN_PUBLIC_COUNT, PROGRESS_REFRESH_MS } = PARTICIPATION;

describe('toPublicParticipation', () => {
	it('uses the same floor as the anonymised export', () => {
		expect(MIN_PUBLIC_COUNT).toBe(5);
	});

	it('shows both counts at the floor', () => {
		expect(toPublicParticipation({ suggested: 5, evaluated: 5 })).toEqual({
			suggested: 5,
			evaluated: 5,
		});
	});

	it('hides a count one below the floor, and keeps the other', () => {
		expect(toPublicParticipation({ suggested: 4, evaluated: 12 })).toEqual({
			suggested: undefined,
			evaluated: 12,
		});
	});

	it('hides both counts in a small group', () => {
		expect(toPublicParticipation({ suggested: 1, evaluated: 2 })).toEqual({
			suggested: undefined,
			evaluated: undefined,
		});
	});
});

describe('publicDecidedCount', () => {
	it('uses the larger group', () => {
		expect(publicDecidedCount({ suggested: 2, evaluated: 9 })).toBe(9);
		expect(publicDecidedCount({ suggested: 9, evaluated: 2 })).toBe(9);
	});

	it('is undefined below the floor', () => {
		expect(publicDecidedCount({ suggested: 2, evaluated: 4 })).toBeUndefined();
	});
});

describe('shouldRefreshProgress', () => {
	it('reads at most once per window', () => {
		expect(shouldRefreshProgress(1000, 1000 + PROGRESS_REFRESH_MS - 1)).toBe(false);
		expect(shouldRefreshProgress(1000, 1000 + PROGRESS_REFRESH_MS)).toBe(true);
	});
});

describe('formatCompactCount', () => {
	it('shortens large numbers', () => {
		expect(formatCompactCount(1200, 'en')).toBe('1.2K');
	});

	it('still shows the number for an unknown locale', () => {
		expect(formatCompactCount(7, 'not a locale')).toBe('7');
	});
});
