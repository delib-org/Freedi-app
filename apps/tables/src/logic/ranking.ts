import { TABLE_ASSIGNMENT_MAX_PREFERENCES } from '@freedi/shared-types';

/**
 * Ranked choices: an ordered list of distinct topic ids, best first, at most
 * TABLE_ASSIGNMENT_MAX_PREFERENCES. All helpers return new arrays.
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

/** Move one ranked topic to a place in the list; out-of-range moves are ignored. */
export function moveRankTo(ranked: readonly string[], from: number, to: number): string[] {
	if (from < 0 || from >= ranked.length || to < 0 || to >= ranked.length) return [...ranked];

	const next = [...ranked];
	const [moved] = next.splice(from, 1);

	next.splice(to, 0, moved);

	return next;
}

/** Move one ranked topic up (-1) or down (+1); out-of-range moves are ignored. */
export function moveRank(ranked: readonly string[], index: number, delta: -1 | 1): string[] {
	return moveRankTo(ranked, index, index + delta);
}

/** True when the list is full and a further tap on an unranked topic is refused. */
export function isRankingFull(
	ranked: readonly string[],
	max: number = TABLE_ASSIGNMENT_MAX_PREFERENCES,
): boolean {
	return ranked.length >= max;
}

/** One list: the ranked topics first, in rank order, then the rest in the host's order. */
export function orderTopics<T extends { topicId: string }>(
	topics: readonly T[],
	ranked: readonly string[],
): T[] {
	const byId = new Map(topics.map((topic) => [topic.topicId, topic]));
	const picked = ranked.flatMap((id) => byId.get(id) ?? []);

	return [...picked, ...topics.filter((topic) => !ranked.includes(topic.topicId))];
}

/** Which hint the Rank screen shows: how many are picked, or the last one when nothing can be added. */
export function rankHintIndex(ranked: readonly string[], topicCount: number): number {
	const limit = Math.min(TABLE_ASSIGNMENT_MAX_PREFERENCES, topicCount);

	return ranked.length >= limit && ranked.length > 0
		? TABLE_ASSIGNMENT_MAX_PREFERENCES
		: ranked.length;
}

/** Drop ids of topics that no longer exist (a saved choice may outlive a topic). */
export function keepKnownTopics(ranked: readonly string[], topicIds: readonly string[]): string[] {
	const known = new Set(topicIds);

	return ranked.filter((id) => known.has(id));
}
