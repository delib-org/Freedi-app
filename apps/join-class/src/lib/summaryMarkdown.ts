// Minimal markdown renderer for AI summaries. The summarizeDiscussion
// function is prompted for a narrow subset — ## / ### / #### headers, "- "
// bullet lists, **bold** spans and plain paragraphs — but a model is not a
// parser, so numbered lists, links and stray heading levels are rendered too
// rather than leaking raw markdown into the page. Output is Mithril vnodes
// (inherently XSS-safe; no innerHTML).
import m from 'mithril';

/** `**bold**` and `[text](url)`; anything else stays plain text. */
const INLINE_PATTERN = /\*\*([^*]+)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/** Only schemes that cannot execute script become real links. */
const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

/** A heading line: one to six hashes, then the text. */
const HEADING = /^(#{1,6})\s+(.*)$/;

/** A bullet item: "- foo" or "* foo". */
const BULLET = /^[-*]\s+(.*)$/;

/** An ordered item: "1. foo" or "1) foo". */
const ORDERED = /^\d+[.)]\s+(.*)$/;

/** Render inline markup inside a single line. */
function renderInline(text: string): m.Children {
	const parts: m.Children[] = [];
	let lastIndex = 0;

	// `exec` in a loop rather than `split`, because the two inline forms have
	// different capture shapes and a split would lose which one matched.
	INLINE_PATTERN.lastIndex = 0;
	let match = INLINE_PATTERN.exec(text);
	while (match !== null) {
		if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));

		const [raw, bold, linkText, href] = match;
		if (bold !== undefined) {
			parts.push(m('strong', bold));
		} else if (href !== undefined && SAFE_HREF.test(href)) {
			parts.push(
				m('a.summary-md__link', { href, target: '_blank', rel: 'noopener noreferrer' }, linkText),
			);
		} else {
			// A link with an unsafe scheme (javascript:, data:) stays inert text.
			parts.push(raw);
		}

		lastIndex = match.index + raw.length;
		match = INLINE_PATTERN.exec(text);
	}

	if (parts.length === 0) return text;
	if (lastIndex < text.length) parts.push(text.slice(lastIndex));

	return parts;
}

/** Render a markdown summary string as a list of block-level vnodes. */
export function renderSummaryMarkdown(markdown: string): m.Children {
	const blocks: m.Children[] = [];
	let items: m.Children[] = [];
	let listTag: 'ul' | 'ol' = 'ul';

	const flushList = (): void => {
		if (items.length > 0) {
			blocks.push(m(`${listTag}.summary-md__list`, items));
			items = [];
		}
	};

	const pushItem = (tag: 'ul' | 'ol', content: string): void => {
		// A switch of list type closes the open list, so "- a" followed by
		// "1. b" renders as two lists rather than one mixed one.
		if (items.length > 0 && listTag !== tag) flushList();
		listTag = tag;
		items.push(m('li', renderInline(content)));
	};

	for (const rawLine of markdown.split('\n')) {
		const line = rawLine.trim();
		if (line === '') {
			flushList();
			continue;
		}

		const heading = HEADING.exec(line);
		if (heading) {
			flushList();
			// ## -> h3, ### -> h4, #### -> h5. The page already owns h1/h2, and
			// levels outside that range clamp into it instead of rendering hashes.
			const level = Math.min(Math.max(heading[1].length, 2), 4);
			blocks.push(m(`h${level + 1}.summary-md__heading`, renderInline(heading[2])));
			continue;
		}

		const bullet = BULLET.exec(line);
		if (bullet) {
			pushItem('ul', bullet[1]);
			continue;
		}

		const ordered = ORDERED.exec(line);
		if (ordered) {
			pushItem('ol', ordered[1]);
			continue;
		}

		flushList();
		blocks.push(m('p.summary-md__paragraph', renderInline(line)));
	}
	flushList();

	return blocks;
}
