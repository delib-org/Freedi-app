import m from 'mithril';

// Matches http(s) and bare www. URLs. Trailing punctuation that's almost
// always sentence-trailing rather than part of the URL (`.,;:!?)]}'"`) is
// trimmed back below so "see https://example.com." doesn't keep the dot.
const URL_REGEX = /\b((?:https?:\/\/|www\.)[^\s<>"]+)/gi;
const TRAILING_PUNCT = /[).,;:!?'"\]}>…]+$/;
// Markers the cloud functions append when a Statement's `description` preview
// hits its ~200-char cap mid-string. Three different functions write three
// different tails (`...`, `…[truncated]`, `...[truncated]`), and any of them
// can land mid-URL. Two consecutive dots in a matched URL are also treated as
// truncation — legitimate URLs don't contain `..` after the protocol slash,
// so the only realistic source is a chop. When detected we emit the matched
// run as plain text rather than a broken anchor pointing at `https://goo`.
const TRUNCATION_MARKER = /\.{2,}|…|\[truncated/i;

interface LinkifyPart {
	kind: 'text' | 'url' | 'truncated-url';
	value: string;
	href?: string;
}

function splitIntoParts(text: string): LinkifyPart[] {
	const parts: LinkifyPart[] = [];
	let lastIndex = 0;

	for (const match of text.matchAll(URL_REGEX)) {
		const raw = match[0];
		const start = match.index ?? 0;

		if (start > lastIndex) {
			parts.push({ kind: 'text', value: text.slice(lastIndex, start) });
		}

		// Truncated URL (e.g. `https://goo...` or `https://goo…[truncated]`
		// from a server-capped preview). Emit a distinct token kind so the
		// caller can decide: render as plain text (default, safe), or attach
		// a deferred-resolve handler that loads the full content and opens
		// the real URL.
		if (TRUNCATION_MARKER.test(raw)) {
			parts.push({ kind: 'truncated-url', value: raw });
			lastIndex = start + raw.length;
			continue;
		}

		// Strip trailing punctuation that isn't really part of the URL.
		const trimmed = raw.replace(TRAILING_PUNCT, '');
		const tail = raw.slice(trimmed.length);

		const href = trimmed.startsWith('www.') ? `https://${trimmed}` : trimmed;
		parts.push({ kind: 'url', value: trimmed, href });

		if (tail) {
			parts.push({ kind: 'text', value: tail });
		}

		lastIndex = start + raw.length;
	}

	if (lastIndex < text.length) {
		parts.push({ kind: 'text', value: text.slice(lastIndex) });
	}

	return parts;
}

/** Caller-supplied options. `onTruncatedUrlClick` lets a host component (e.g.
 *  SolutionCard) render the truncated-URL fragment as a clickable link rather
 *  than as plain text — useful when the host can resolve the prefix to a full
 *  URL by loading additional data. */
export interface LinkifyOptions {
	onTruncatedUrlClick?: (truncatedText: string, e: Event) => void;
}

/** Turn a plain-text string into Mithril children, converting any URLs into
 *  anchors that open in a new tab. Safe to pass back into `m()` as the body
 *  of a text node — Mithril treats the string children as text, so there's
 *  no XSS risk from user input. */
export function linkify(text: string, options?: LinkifyOptions): m.Children {
	if (!text) return text;
	const parts = splitIntoParts(text);
	if (parts.length === 1 && parts[0].kind === 'text') return text;

	return parts.flatMap((part) => {
		if (part.kind === 'text') return part.value;

		if (part.kind === 'truncated-url') {
			const handler = options?.onTruncatedUrlClick;
			if (handler) {
				return m(
					'a.linkified.linkified--truncated',
					{
						// `#` is a placeholder — the click handler intercepts
						// navigation and resolves the full URL before opening.
						href: '#',
						target: '_blank',
						rel: 'noopener noreferrer',
						'aria-label': `${part.value} (truncated link, click to open full URL)`,
						onclick: (e: Event) => handler(part.value, e),
					},
					part.value,
				);
			}

			// No resolver: treat the trailing dots / ellipsis as sentence
			// punctuation (the typical user-written case) and emit a regular
			// anchor over the trimmed URL. Matches the pre-truncation-fix
			// behaviour so titles and other surfaces stay clickable.
			const trimmed = part.value.replace(TRAILING_PUNCT, '');
			const tail = part.value.slice(trimmed.length);
			if (!trimmed) return part.value;

			const href = trimmed.startsWith('www.') ? `https://${trimmed}` : trimmed;
			const anchor = m(
				'a.linkified',
				{
					href,
					target: '_blank',
					rel: 'noopener noreferrer',
					onclick: (e: Event) => e.stopPropagation(),
				},
				trimmed,
			);

			return tail ? [anchor, tail] : anchor;
		}

		return m(
			'a.linkified',
			{
				href: part.href,
				target: '_blank',
				rel: 'noopener noreferrer',
				onclick: (e: Event) => e.stopPropagation(),
			},
			part.value,
		);
	});
}
