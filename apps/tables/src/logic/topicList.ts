import { TABLE_ASSIGNMENT_TITLE_MAX_LENGTH, tableAssignmentNameKey } from '@freedi/shared-types';

/** Mirrors MAX_TOPICS_PER_SESSION on the server, which refuses a longer list. */
export const MAX_TOPICS = 100;

const SEPARATORS = /[,،\n]+/;

/** Topics in a pasted list: split on comma, Arabic comma and new line; trimmed, no empties, capped. */
export function splitTopicList(text: string): string[] {
	return text
		.split(SEPARATORS)
		.map((title) => title.trim().slice(0, TABLE_ASSIGNMENT_TITLE_MAX_LENGTH))
		.filter((title) => title.length > 0);
}

/** The pasted titles that would really be added: new ones only, and only as many as still fit. */
export function topicsToAdd(existing: readonly string[], text: string): string[] {
	const seen = new Set(existing.map(tableAssignmentNameKey));
	const added: string[] = [];

	for (const title of splitTopicList(text)) {
		const key = tableAssignmentNameKey(title);

		if (seen.has(key) || existing.length + added.length >= MAX_TOPICS) continue;
		seen.add(key);
		added.push(title);
	}

	return added;
}
