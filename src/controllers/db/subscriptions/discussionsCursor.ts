/**
 * Cursor for the home "discussions" pager (subscriptions ordered by lastUpdate).
 *
 * Tracked from the query results themselves, not derived from Redux: since
 * the topics list moved to `userFeed`, Redux also holds top-level
 * subscriptions fetched by activity, whose own `lastUpdate` can be far older
 * than the discussions page. Taking the min over Redux would make the pager
 * jump past every discussion in between.
 *
 * The cursor only moves backwards (min), so a live snapshot whose window
 * shifts forward can never undo a page the pager already loaded.
 */
let cursor: number | null = null;

export function getDiscussionsCursor(): number | null {
	return cursor;
}

/** Records the oldest lastUpdate a discussions query returned. */
export function recordDiscussionsCursor(oldestLastUpdate: number | undefined): void {
	if (typeof oldestLastUpdate !== 'number') return;
	cursor = cursor === null ? oldestLastUpdate : Math.min(cursor, oldestLastUpdate);
}

export function resetDiscussionsCursor(): void {
	cursor = null;
}
