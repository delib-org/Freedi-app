import m from 'mithril';

// Matches http(s) and bare www. URLs. Trailing punctuation that's almost
// always sentence-trailing rather than part of the URL (`.,;:!?)]}'"`) is
// trimmed back below so "see https://example.com." doesn't keep the dot.
const URL_REGEX = /\b((?:https?:\/\/|www\.)[^\s<>"]+)/gi;
const TRAILING_PUNCT = /[).,;:!?'"\]}>]+$/;

interface LinkifyPart {
	kind: 'text' | 'url';
	value: string;
	href?: string;
}

function splitIntoParts(text: string): LinkifyPart[] {
	const parts: LinkifyPart[] = [];
	let lastIndex = 0;

	for (const match of text.matchAll(URL_REGEX)) {
		const raw = match[0];
		const start = match.index ?? 0;
		// Strip trailing punctuation that isn't really part of the URL.
		const trimmed = raw.replace(TRAILING_PUNCT, '');
		const tail = raw.slice(trimmed.length);

		if (start > lastIndex) {
			parts.push({ kind: 'text', value: text.slice(lastIndex, start) });
		}

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

/** Turn a plain-text string into Mithril children, converting any URLs into
 *  anchors that open in a new tab. Safe to pass back into `m()` as the body
 *  of a text node — Mithril treats the string children as text, so there's
 *  no XSS risk from user input. */
export function linkify(text: string): m.Children {
	if (!text) return text;
	const parts = splitIntoParts(text);
	if (parts.length === 1 && parts[0].kind === 'text') return text;

	return parts.map((part) => {
		if (part.kind === 'text') return part.value;

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
