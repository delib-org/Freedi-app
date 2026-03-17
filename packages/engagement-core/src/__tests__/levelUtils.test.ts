import { EngagementLevel } from '@freedi/shared-types';
import {
	calculateLevel,
	getNextLevelThreshold,
	getLevelName,
	getLevelProgress,
	didLevelUp,
} from '../levelUtils';

describe('levelUtils', () => {
	describe('calculateLevel', () => {
		it('should return OBSERVER for 0 credits', () => {
			expect(calculateLevel(0)).toBe(EngagementLevel.OBSERVER);
		});

		it('should return OBSERVER for credits below 50', () => {
			expect(calculateLevel(49)).toBe(EngagementLevel.OBSERVER);
		});

		it('should return PARTICIPANT at exactly 50 credits', () => {
			expect(calculateLevel(50)).toBe(EngagementLevel.PARTICIPANT);
		});

		it('should return CONTRIBUTOR at 200 credits', () => {
			expect(calculateLevel(200)).toBe(EngagementLevel.CONTRIBUTOR);
		});

		it('should return ADVOCATE at 500 credits', () => {
			expect(calculateLevel(500)).toBe(EngagementLevel.ADVOCATE);
		});

		it('should return LEADER at 1500 credits', () => {
			expect(calculateLevel(1500)).toBe(EngagementLevel.LEADER);
		});

		it('should return LEADER for credits above 1500', () => {
			expect(calculateLevel(10000)).toBe(EngagementLevel.LEADER);
		});
	});

	describe('getNextLevelThreshold', () => {
		it('should return 50 for OBSERVER', () => {
			expect(getNextLevelThreshold(EngagementLevel.OBSERVER)).toBe(50);
		});

		it('should return 200 for PARTICIPANT', () => {
			expect(getNextLevelThreshold(EngagementLevel.PARTICIPANT)).toBe(200);
		});

		it('should return Infinity for LEADER', () => {
			expect(getNextLevelThreshold(EngagementLevel.LEADER)).toBe(Infinity);
		});
	});

	describe('getLevelName', () => {
		it('should return correct names', () => {
			expect(getLevelName(EngagementLevel.OBSERVER)).toBe('Observer');
			expect(getLevelName(EngagementLevel.PARTICIPANT)).toBe('Participant');
			expect(getLevelName(EngagementLevel.CONTRIBUTOR)).toBe('Contributor');
			expect(getLevelName(EngagementLevel.ADVOCATE)).toBe('Advocate');
			expect(getLevelName(EngagementLevel.LEADER)).toBe('Leader');
		});
	});

	describe('getLevelProgress', () => {
		it('should return 0 at the start of a level', () => {
			expect(getLevelProgress(0, EngagementLevel.OBSERVER)).toBe(0);
		});

		it('should return 50 at halfway to next level', () => {
			expect(getLevelProgress(25, EngagementLevel.OBSERVER)).toBe(50);
		});

		it('should return 100 at max level', () => {
			expect(getLevelProgress(2000, EngagementLevel.LEADER)).toBe(100);
		});

		it('should cap at 100', () => {
			expect(getLevelProgress(60, EngagementLevel.OBSERVER)).toBe(100);
		});
	});

	describe('didLevelUp', () => {
		it('should return true when crossing a threshold', () => {
			expect(didLevelUp(49, 50)).toBe(true);
		});

		it('should return false when staying at same level', () => {
			expect(didLevelUp(10, 20)).toBe(false);
		});

		it('should return true for multi-level jump', () => {
			expect(didLevelUp(10, 500)).toBe(true);
		});
	});
});
