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
		} catch {
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
	return decodeEntities(html.replace(/<[^>]*>/g, '')).trim();
}

/**
 * Tags that imply a word/line boundary — replaced with a space so text from
 * adjacent blocks (paragraphs, list items, table cells) doesn't run together.
 */
const BLOCK_LEVEL_TAGS =
	/<\/?(?:p|div|br|hr|li|ul|ol|dl|dt|dd|h[1-6]|table|thead|tbody|tfoot|tr|td|th|caption|blockquote|section|article|header|footer|aside|nav|figure|figcaption|pre|form|fieldset)\b[^>]*>/gi;

/**
 * Decode the HTML entities that show up in rich-text content.
 * Always run this AFTER tags are stripped — decoding first would turn an
 * escaped `&lt;b&gt;` into a real tag and delete text the author meant to show.
 */
function decodeEntities(text: string): string {
	return text
		.replace(/&nbsp;/gi, ' ')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&quot;/gi, '"')
		.replace(/&#0*39;/g, "'")
		.replace(/&apos;/gi, "'")
		.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
			String.fromCodePoint(parseInt(hex, 16))
		)
		.replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
		.replace(/&amp;/gi, '&'); // Last: so &amp;lt; decodes to "&lt;", not "<"
}

/**
 * Convert rich-text HTML into a single-line plain-text preview.
 *
 * Block-level tags become spaces so words don't run together, remaining tags
 * are dropped, entities are decoded, and whitespace is collapsed. Regex-only
 * (no DOMParser) so it behaves identically on the server and in the browser,
 * and so it can insert the word boundaries `textContent` would swallow.
 */
export function htmlToPreviewText(html: string | null | undefined): string {
	if (!html) return '';

	const withoutTags = html.replace(BLOCK_LEVEL_TAGS, ' ').replace(/<[^>]*>/g, '');

	return decodeEntities(withoutTags).replace(/\s+/g, ' ').trim();
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
