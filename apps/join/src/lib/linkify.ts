import m from 'mithril';

// Matches http(s) and bare www. URLs. Trailing punctuation that's almost
// always sentence-trailing rather than part of the URL (`.,;:!?)]}'"`) is
// trimmed back below so "see https://example.com." doesn't keep the dot.
const URL_REGEX = /\b((?:https?:\/\/|www\.)[^\s<>"]+)/gi;
const TRAILING_PUNCT = /[).,;:!?'"\]}>…]+$/;
// A run of two or more dots (or a Unicode ellipsis) at the end of a URL match
// means the cloud function's ~200-char `description` cap chopped the URL
// mid-string. Linkifying `https://goo...` would point to `https://goo` (after
// trailing-punct stripping) which 404s — so we emit the raw text instead.
const TRUNCATION_TAIL = /(?:\.{2,}|…)$/;

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

		if (start > lastIndex) {
			parts.push({ kind: 'text', value: text.slice(lastIndex, start) });
		}

		// Truncated URL (e.g. `https://goo...` from a server-capped preview):
		// preserve the original text, skip linkification.
		if (TRUNCATION_TAIL.test(raw)) {
			parts.push({ kind: 'text', value: raw });
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
