import type { Participant } from './types';

/** First choice weighs maxRanked, the last ranked choice weighs 1, anything else 0. */
export function rankWeight(rank: number, maxRanked: number): number {
	if (rank < 0 || rank >= maxRanked) return 0;

	return maxRanked - rank;
}

/** 0-based rank of the topic in the participant's list, or -1. */
export function preferenceRank(
	participant: Participant,
	topicId: string,
	maxRanked: number,
): number {
	const rank = participant.preferences.indexOf(topicId);

	return rank < maxRanked ? rank : -1;
}

export function preferenceWeight(
	participant: Participant,
	topicId: string,
	maxRanked: number,
): number {
	return rankWeight(preferenceRank(participant, topicId, maxRanked), maxRanked);
}
