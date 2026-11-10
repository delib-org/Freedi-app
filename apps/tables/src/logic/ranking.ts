import { TABLE_ASSIGNMENT_MAX_PREFERENCES } from '@freedi/shared-types';

/**
 * Ranked choices: an ordered list of distinct topic ids, best first, at most
 * TABLE_ASSIGNMENT_MAX_PREFERENCES. All helpers return new arrays.
 */

/**
 * Tap on a topic: remove it when already ranked, add it at the end when there
 * is room, and when the list is full put it in the last place, pushing the
 * topic that was there out of the list.
 */
export function toggleRank(
	ranked: readonly string[],
	topicId: string,
	max: number = TABLE_ASSIGNMENT_MAX_PREFERENCES,
): string[] {
	if (ranked.includes(topicId)) return ranked.filter((id) => id !== topicId);
	if (ranked.length >= max) return [...ranked.slice(0, max - 1), topicId];

	return [...ranked, topicId];
}

/** The topic a tap on `topicId` pushes out of a full list, or undefined when nothing is pushed out. */
export function replacedBy(
	ranked: readonly string[],
	topicId: string,
	max: number = TABLE_ASSIGNMENT_MAX_PREFERENCES,
): string | undefined {
	return !ranked.includes(topicId) && ranked.length >= max ? ranked[max - 1] : undefined;
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

/** True when the list is full: a further tap on an unranked topic replaces the last pick. */
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

/** Hint shown when every topic is picked but there are fewer topics than places. */
export const HINT_ALL_PICKED = TABLE_ASSIGNMENT_MAX_PREFERENCES + 1;

/**
 * Which hint the Rank screen shows: how many are picked; the "next pick
 * replaces number 3" one when full; a plain one when every topic is picked
 * and no further pick is possible.
 */
export function rankHintIndex(ranked: readonly string[], topicCount: number): number {
	if (ranked.length >= TABLE_ASSIGNMENT_MAX_PREFERENCES) return TABLE_ASSIGNMENT_MAX_PREFERENCES;
	if (ranked.length > 0 && ranked.length >= topicCount) return HINT_ALL_PICKED;

	return ranked.length;
}

/** Drop ids of topics that no longer exist (a saved choice may outlive a topic). */
export function keepKnownTopics(ranked: readonly string[], topicIds: readonly string[]): string[] {
	const known = new Set(topicIds);

	return ranked.filter((id) => known.has(id));
}
