import { UI } from '@/constants/common';

export interface RatingProgress {
	ratedCount: number;
	rateableCount: number;
	/** See `areAnswersComplete`: without it "all of them" could be false. */
	answersComplete: boolean;
	/** When the viewer last rated one of these answers, or 0. */
	lastRatedAt: number;
}

export interface RatedAllInput {
	previous: RatingProgress;
	current: RatingProgress;
	/** When this screen opened: older ratings arriving from the database are not news. */
	openedAt: number;
	/** `ratedCount` at the last time the line was shown, if it was. */
	ratedAtLastNotice: number | undefined;
}

function hasRatedAll({ ratedCount, rateableCount, answersComplete }: RatingProgress): boolean {
	return answersComplete && rateableCount > 0 && ratedCount >= rateableCount;
}

/**
 * True at the one moment a person finishes rating what is available. Ratings
 * load one by one when a question opens, so a rise in the count is not enough
 * by itself: the newest rating must have been made since the screen opened.
 * While answers keep trickling in, a later line needs a real new batch.
 */
export function shouldAnnounceRatedAll({
	previous,
	current,
	openedAt,
	ratedAtLastNotice,
}: RatedAllInput): boolean {
	if (!hasRatedAll(current) || hasRatedAll(previous)) return false;
	if (current.ratedCount <= previous.ratedCount || current.lastRatedAt < openedAt) return false;
	if (ratedAtLastNotice === undefined) return true;

	return current.ratedCount - ratedAtLastNotice >= UI.RATED_ALL_REPEAT_MIN_RATINGS;
}
