const HTML_ENTITIES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;',
};

/** Make a user-supplied value safe to place in HTML text or a quoted attribute. */
export function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}

/**
 * The URL when it is http(s), otherwise undefined. Blocks `javascript:` and
 * `data:` links in anything a user can place behind an email button.
 */
export function safeHttpUrl(value: unknown): string | undefined {
	if (typeof value !== 'string' || !value.trim()) return undefined;
	try {
		const url = new URL(value.trim());

		return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
	} catch {
		return undefined;
	}
}
