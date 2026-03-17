import {
	calculateDiminishingCredits,
	applyDailyCap,
	isCooldownElapsed,
	DAILY_CREDIT_CAP,
	DIMINISHING_FACTOR,
} from '../creditUtils';

describe('creditUtils', () => {
	describe('calculateDiminishingCredits', () => {
		it('should return base amount for first action (repeatCount = 0)', () => {
			expect(calculateDiminishingCredits(10, 0)).toBe(10);
		});

		it('should apply 90% for second action', () => {
			expect(calculateDiminishingCredits(10, 1)).toBe(9);
		});

		it('should compound diminishing returns', () => {
			// 10 * 0.9^2 = 8.1, rounded to 8
			expect(calculateDiminishingCredits(10, 2)).toBe(8);
		});

		it('should handle negative repeatCount as first action', () => {
			expect(calculateDiminishingCredits(10, -1)).toBe(10);
		});
	});

	describe('applyDailyCap', () => {
		it('should return full amount when well under cap', () => {
			expect(applyDailyCap(0, 10)).toBe(10);
		});

		it('should return reduced amount when near cap', () => {
			expect(applyDailyCap(95, 10)).toBe(5);
		});

		it('should return 0 when at cap', () => {
			expect(applyDailyCap(DAILY_CREDIT_CAP, 10)).toBe(0);
		});

		it('should return 0 when over cap', () => {
			expect(applyDailyCap(DAILY_CREDIT_CAP + 10, 10)).toBe(0);
		});
	});

	describe('isCooldownElapsed', () => {
		it('should return true when enough time has passed', () => {
			const lastAward = Date.now() - 60_000; // 60 seconds ago
			expect(isCooldownElapsed(lastAward, 30_000)).toBe(true);
		});

		it('should return false when not enough time has passed', () => {
			const lastAward = Date.now() - 10_000; // 10 seconds ago
			expect(isCooldownElapsed(lastAward, 30_000)).toBe(false);
		});

		it('should return true for 0 cooldown', () => {
			const lastAward = Date.now();
			expect(isCooldownElapsed(lastAward, 0)).toBe(true);
		});
	});

	describe('constants', () => {
		it('should have correct daily cap', () => {
			expect(DAILY_CREDIT_CAP).toBe(100);
		});

		it('should have correct diminishing factor', () => {
			expect(DIMINISHING_FACTOR).toBe(0.9);
		});
	});
});
