/**
 * Compact Facebook-style relative timestamps for the comment action row:
 * "now", "5m", "2h", "3d", "6w", "2y". Numeric + unit letter keeps it
 * language-neutral, matching FB's compact form.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const YEAR = 365 * DAY;

export function timeAgo(createdAt: number | undefined | null, now: number = Date.now()): string {
	if (!createdAt || createdAt <= 0) return '';
	const elapsed = Math.max(0, now - createdAt);

	if (elapsed < MINUTE) return 'now';
	if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`;
	if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`;
	if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)}d`;
	if (elapsed < YEAR) return `${Math.floor(elapsed / WEEK)}w`;

	return `${Math.floor(elapsed / YEAR)}y`;
}
