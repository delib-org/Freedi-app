import type { TableAssignmentTopic } from '@freedi/shared-types';

/** Tables a topic opens in direct mode when the host set no cap. */
export const DIRECT_TABLES_PER_TOPIC_DEFAULT = 1;

export interface DirectTable {
	/** Global index, counted across topics in topic order. */
	tableIndex: number;
	topicId: string;
}

/**
 * Direct mode layout: each topic opens `maxTables ?? 1` tables, indexed
 * globally in topic order (topics must already be sorted by `order`).
 */
export function buildDirectLayout(topics: readonly TableAssignmentTopic[]): DirectTable[] {
	const layout: DirectTable[] = [];
	for (const topic of topics) {
		const count = topic.maxTables ?? DIRECT_TABLES_PER_TOPIC_DEFAULT;
		for (let i = 0; i < count; i++) {
			layout.push({ tableIndex: layout.length, topicId: topic.topicId });
		}
	}

	return layout;
}
