import { isTableAssignmentSplitByTopic, tableAssignmentTableSizes } from '@freedi/shared-types';
import type {
	TableAssignment,
	TableAssignmentParticipant,
	TableAssignmentTopic,
} from '@freedi/shared-types';

/**
 * "Sit where you like" with tables made at closing (IA tables-class-bridge 2.3):
 * a person chooses a topic, never a table. These are the pure rules behind the
 * participant's topic list and the host's per-topic counts.
 */

/** A topic that exactly this many people chose is flagged to the host. */
export const LONE_TOPIC_COUNT = 1;

export interface TopicOption {
	topicId: string;
	title: string;
	/** How many chose the topic: a count, never names. */
	count: number;
	/** The person's own single choice. */
	mine: boolean;
}

export function isSplitSession(session: Pick<TableAssignment, 'mode' | 'splitByTopic'>): boolean {
	return isTableAssignmentSplitByTopic(session);
}

/** The one topic a person chose in a split session. */
export function chosenTopicId(
	me: Pick<TableAssignmentParticipant, 'preferences'> | null,
): string | undefined {
	return me?.preferences[0];
}

export function chosenCountOf(topic: Pick<TableAssignmentTopic, 'chosenCount'>): number {
	return topic.chosenCount ?? 0;
}

/** The topics in the host's order, each with its count and whether it is the person's own. */
export function topicOptions(
	topics: readonly TableAssignmentTopic[],
	myTopicId: string | undefined,
): TopicOption[] {
	return [...topics]
		.sort((a, b) => a.order - b.order)
		.map((topic) => ({
			topicId: topic.topicId,
			title: topic.title,
			count: chosenCountOf(topic),
			mine: topic.topicId === myTopicId,
		}));
}

/** How many tables a topic would open for the people who chose it so far. */
export function tablesThatWouldOpen(people: number, seatsPerTable: number): number {
	return tableAssignmentTableSizes(people, seatsPerTable).length;
}

/** Topics where only one person registered: flagged to the host, never moved. */
export function loneTopics(topics: readonly TableAssignmentTopic[]): TableAssignmentTopic[] {
	return [...topics]
		.sort((a, b) => a.order - b.order)
		.filter((topic) => topic.chosenCount === LONE_TOPIC_COUNT);
}

/** The server answers with topic ids; a reference that matches no topic is shown as it came. */
export function topicTitlesOf(
	references: readonly string[],
	topics: readonly TableAssignmentTopic[],
): string[] {
	const titles = new Map(topics.map((topic) => [topic.topicId, topic.title]));

	return references.map((reference) => titles.get(reference) ?? reference);
}
