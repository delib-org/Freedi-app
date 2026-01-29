/**
 * Text Utility Functions
 * Helper functions for text processing and formatting
 */

/**
 * Strip HTML tags from text
 * Works in both browser and server-side environments
 */
export function stripHtml(html: string): string {
	if (!html) return '';

	// Browser environment - use DOMParser for accurate HTML parsing
	if (typeof window !== 'undefined') {
		try {
			const doc = new DOMParser().parseFromString(html, 'text/html');
			return doc.body.textContent || '';
		} catch (error) {
			// Fallback to regex if DOMParser fails
			return regexStripHtml(html);
		}
	}

	// Server-side or fallback - use regex
	return regexStripHtml(html);
}

/**
 * Regex-based HTML stripping (fallback method)
 */
function regexStripHtml(html: string): string {
	return html
		.replace(/<[^>]*>/g, '') // Remove HTML tags
		.replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
		.replace(/&amp;/g, '&') // Replace &amp; with &
		.replace(/&lt;/g, '<') // Replace &lt; with <
		.replace(/&gt;/g, '>') // Replace &gt; with >
		.replace(/&quot;/g, '"') // Replace &quot; with "
		.replace(/&#39;/g, "'") // Replace &#39; with '
		.trim();
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return text.substring(0, maxLength) + '...';
}

/**
 * Get human-readable time ago string
 */
export function getTimeAgo(timestamp: number, t: (key: string) => string): string {
	const now = Date.now();
	const diff = now - timestamp;

	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	const weeks = Math.floor(days / 7);
	const months = Math.floor(days / 30);
	const years = Math.floor(days / 365);

	if (years > 0) return `${years} ${t(years === 1 ? 'year ago' : 'years ago')}`;
	if (months > 0) return `${months} ${t(months === 1 ? 'month ago' : 'months ago')}`;
	if (weeks > 0) return `${weeks} ${t(weeks === 1 ? 'week ago' : 'weeks ago')}`;
	if (days > 0) return `${days} ${t(days === 1 ? 'day ago' : 'days ago')}`;
	if (hours > 0) return `${hours} ${t(hours === 1 ? 'hour ago' : 'hours ago')}`;
	if (minutes > 0) return `${minutes} ${t(minutes === 1 ? 'minute ago' : 'minutes ago')}`;
	return t('Just now');
}
