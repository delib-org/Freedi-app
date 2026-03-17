/**
 * Daily credit cap - maximum credits a user can earn per day.
 */
export const DAILY_CREDIT_CAP = 100;

/**
 * Diminishing returns multiplier applied to repeated actions.
 * Each subsequent same-action award = previousAmount * DIMINISHING_FACTOR.
 */
export const DIMINISHING_FACTOR = 0.9;

/**
 * Calculate credit amount after applying diminishing returns.
 * @param baseAmount - The base credit amount for the action
 * @param repeatCount - How many times this action has been performed today (0-based)
 */
export function calculateDiminishingCredits(
	baseAmount: number,
	repeatCount: number
): number {
	if (repeatCount <= 0) return baseAmount;

	return Math.round(baseAmount * Math.pow(DIMINISHING_FACTOR, repeatCount));
}

/**
 * Check if adding credits would exceed the daily cap.
 * Returns the actual amount to award (may be reduced).
 */
export function applyDailyCap(
	currentDailyTotal: number,
	amountToAdd: number
): number {
	const remaining = DAILY_CREDIT_CAP - currentDailyTotal;

	if (remaining <= 0) return 0;

	return Math.min(amountToAdd, remaining);
}

/**
 * Check if a cooldown period has elapsed since the last award.
 * @param lastAwardTime - Timestamp (ms) of last award for this action
 * @param cooldownMs - Required cooldown in milliseconds
 */
export function isCooldownElapsed(
	lastAwardTime: number,
	cooldownMs: number
): boolean {
	return Date.now() - lastAwardTime >= cooldownMs;
}
