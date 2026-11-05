import { TABLE_ASSIGNMENT_MAX_PREFERENCES } from '@freedi/shared-types';

/**
 * Ranked preferences: an ordered list of distinct topic ids, best first,
 * at most TABLE_ASSIGNMENT_MAX_PREFERENCES. All helpers return new arrays.
 */

/** Tap on a topic: add it at the end, or remove it when already ranked. Full lists ignore new topics. */
export function toggleRank(
	ranked: readonly string[],
	topicId: string,
	max: number = TABLE_ASSIGNMENT_MAX_PREFERENCES,
): string[] {
	if (ranked.includes(topicId)) return ranked.filter((id) => id !== topicId);
	if (ranked.length >= max) return [...ranked];

	return [...ranked, topicId];
}

/** 1-based rank of a topic, or 0 when it is not ranked (for the 1/2/3 badge). */
export function rankOf(ranked: readonly string[], topicId: string): number {
	return ranked.indexOf(topicId) + 1;
}

/** Move one ranked topic up (-1) or down (+1); out-of-range moves are ignored. */
export function moveRank(ranked: readonly string[], index: number, delta: -1 | 1): string[] {
	const target = index + delta;

	if (index < 0 || index >= ranked.length || target < 0 || target >= ranked.length) {
		return [...ranked];
	}

	const next = [...ranked];

	[next[index], next[target]] = [next[target], next[index]];

	return next;
}

/** True when the list is full and a further tap on an unranked topic is refused. */
export function isRankingFull(
	ranked: readonly string[],
	max: number = TABLE_ASSIGNMENT_MAX_PREFERENCES,
): boolean {
	return ranked.length >= max;
}

/**
 * How many topics a participant should rank: three, or all of them when the
 * host has fewer than three (IA: "שלושה כשיש לפחות שלושה").
 */
export function requiredRanks(
	topicCount: number,
	max: number = TABLE_ASSIGNMENT_MAX_PREFERENCES,
): number {
	return Math.min(topicCount, max);
}

/** Drop ids of topics that no longer exist (a saved choice may outlive a topic). */
export function keepKnownTopics(ranked: readonly string[], topicIds: readonly string[]): string[] {
	const known = new Set(topicIds);

	return ranked.filter((id) => known.has(id));
}
