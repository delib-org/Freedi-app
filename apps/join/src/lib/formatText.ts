import m from 'mithril';

// WhatsApp-style inline formatting + URL linkification.
//
// Two pipelines run in order:
//   1. URL detection — extract URLs first so a URL containing an underscore
//      ("https://x.com/foo_bar_baz") never gets mis-parsed as italic.
//   2. Inline markers on the remaining text segments — *bold*, _italic_,
//      ~strikethrough~. Markers must hug non-whitespace on both sides
//      (`*foo*` works, `* foo *` doesn't), matching WhatsApp's behaviour.
//
// Numbered lists are NOT handled here — they require multi-line grouping
// and live in the consuming component (SolutionCard / ChatMessage) so the
// parent can decide whether to wrap consecutive items in <ol>.

const URL_REGEX = /\b((?:https?:\/\/|www\.)[^\s<>"]+)/gi;
const TRAILING_PUNCT = /[).,;:!?'"\]}>]+$/;

// One pattern matches any of the three WhatsApp markers. Each alternative has
// two forms: a multi-character form (`*` + non-space + interior + non-space +
// `*`) and a single-character form (`*` + non-space + `*`). Splitting them
// avoids the "shortest match needs at least two interior chars" pitfall a
// single combined regex would produce.
const INLINE_PATTERN =
	/(\*[^\s*][^*\n]*?[^\s*]\*|\*[^\s*]\*|_[^\s_][^_\n]*?[^\s_]_|_[^\s_]_|~[^\s~][^~\n]*?[^\s~]~|~[^\s~]~)/g;

interface UrlToken {
	kind: 'text' | 'url';
	value: string;
	href?: string;
}

function tokenizeUrls(text: string): UrlToken[] {
	const tokens: UrlToken[] = [];
	let lastIndex = 0;

	for (const match of text.matchAll(URL_REGEX)) {
		const raw = match[0];
		const start = match.index ?? 0;
		const trimmed = raw.replace(TRAILING_PUNCT, '');
		const tail = raw.slice(trimmed.length);

		if (start > lastIndex) {
			tokens.push({ kind: 'text', value: text.slice(lastIndex, start) });
		}

		const href = trimmed.startsWith('www.') ? `https://${trimmed}` : trimmed;
		tokens.push({ kind: 'url', value: trimmed, href });

		if (tail) {
			tokens.push({ kind: 'text', value: tail });
		}

		lastIndex = start + raw.length;
	}

	if (lastIndex < text.length) {
		tokens.push({ kind: 'text', value: text.slice(lastIndex) });
	}

	return tokens;
}

// Recursive — `*hello _world_*` produces <strong>hello <em>world</em></strong>.
// Recursion is bounded by the input length: each call shrinks the string by
// at least the marker pair, so adversarial input can't blow the stack.
function formatInline(text: string): m.Children[] {
	const out: m.Children[] = [];
	let lastIndex = 0;

	for (const match of text.matchAll(INLINE_PATTERN)) {
		const raw = match[0];
		const start = match.index ?? 0;

		if (start > lastIndex) {
			out.push(text.slice(lastIndex, start));
		}

		const inner = raw.slice(1, -1);
		const innerNodes = formatInline(inner);
		const marker = raw[0];

		if (marker === '*') {
			out.push(m('strong', innerNodes));
		} else if (marker === '_') {
			out.push(m('em', innerNodes));
		} else {
			out.push(m('s', innerNodes));
		}

		lastIndex = start + raw.length;
	}

	if (lastIndex < text.length) {
		out.push(text.slice(lastIndex));
	}

	return out;
}

function makeAnchor(href: string, value: string): m.Vnode {
	return m(
		'a.linkified',
		{
			href,
			target: '_blank',
			rel: 'noopener noreferrer',
			onclick: (e: Event) => e.stopPropagation(),
		},
		value,
	);
}

/** Render a plain-text string with WhatsApp-style inline formatting and URL
 *  auto-linking. Returns a Mithril `Children` value safe to drop into any
 *  text-only slot (`m('p', formatText(s))`).
 *
 *  The fast path returns the original string when no markers and no URLs
 *  are present — keeps DOM diffing cheap for the common case. */
export function formatText(text: string): m.Children {
	if (!text) return text;

	const urlTokens = tokenizeUrls(text);
	const result: m.Children[] = [];

	for (const token of urlTokens) {
		if (token.kind === 'url' && token.href) {
			result.push(makeAnchor(token.href, token.value));
		} else {
			result.push(...formatInline(token.value));
		}
	}

	if (result.length === 0) return text;
	if (result.length === 1 && typeof result[0] === 'string') return result[0];

	return result;
}

/** True when a body line should render as a numbered-list item. Captures
 *  both `1. text` and `1) text` to match common author conventions. */
export function matchNumberedItem(line: string): { num: number; content: string } | null {
	const match = line.match(/^\s*(\d+)[.)]\s+(.+?)\s*$/);
	if (!match) return null;

	return { num: parseInt(match[1], 10), content: match[2] };
}
