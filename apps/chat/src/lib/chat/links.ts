/**
 * Link handling for chat messages.
 *
 * Storage format: message text may contain markdown-style labeled links
 * `[Google](https://google.com)` (written by the Composer's paste-label flow)
 * and/or bare URLs. `parseMessageSegments` splits the text into plain-text and
 * link segments so MessageNode can render real `<a>` elements without `@html`.
 *
 * Only http(s) URLs become links — anything else (javascript:, data:, …)
 * stays plain text.
 */

export interface TextSegment {
	type: 'text';
	text: string;
}

export interface LinkSegment {
	type: 'link';
	label: string;
	url: string;
}

export type MessageSegment = TextSegment | LinkSegment;

// Labeled `[label](https://url)` first so its URL isn't re-matched as bare;
// bare URLs run to whitespace and get sentence punctuation trimmed afterwards.
const LINK_TOKEN = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+)/g;

// Punctuation that usually ends the sentence, not the URL.
const TRAILING_PUNCTUATION = /[.,;:!?'")\]]+$/;

/** True when `text` is a single http(s) URL (no surrounding prose). */
export function isHttpUrl(text: string): boolean {
	if (/\s/.test(text)) return false;
	try {
		const { protocol } = new URL(text);

		return protocol === 'http:' || protocol === 'https:';
	} catch {
		return false;
	}
}

/** The pasted clipboard text, if it is exactly one URL — else null. */
export function pastedUrl(clipboardText: string): string | null {
	const trimmed = clipboardText.trim();

	return isHttpUrl(trimmed) ? trimmed : null;
}

/** Serialize a labeled link in the storage format. */
export function formatLabeledLink(label: string, url: string): string {
	// Strip characters that would break the [label](url) syntax.
	const safeLabel = label.replace(/[[\]\n]/g, ' ').trim();

	return `[${safeLabel}](${url})`;
}

/** Split message text into text/link segments for safe rendering. */
export function parseMessageSegments(text: string): MessageSegment[] {
	const segments: MessageSegment[] = [];
	let last = 0;

	for (const match of text.matchAll(LINK_TOKEN)) {
		const index = match.index ?? 0;
		let consumed = match[0];
		let label: string;
		let url: string;

		if (match[3] !== undefined) {
			// Bare URL — give back trailing sentence punctuation.
			url = match[3].replace(TRAILING_PUNCTUATION, '');
			consumed = consumed.slice(0, url.length);
			label = url;
		} else {
			label = match[1];
			url = match[2];
		}

		if (index > last) segments.push({ type: 'text', text: text.slice(last, index) });
		segments.push({ type: 'link', label, url });
		last = index + consumed.length;
	}

	if (last < text.length || segments.length === 0) {
		segments.push({ type: 'text', text: text.slice(last) });
	}

	return segments;
}
