// Minimal markdown renderer for AI summaries. The summarizeDiscussion
// function returns markdown limited to ## / ### / #### headers, "- " bullet
// lists, **bold** spans, and plain paragraphs — so this renders exactly that
// subset as Mithril vnodes (inherently XSS-safe; no innerHTML).
import m from 'mithril';

/** Render `**bold**` spans inside a line; everything else stays plain text. */
function renderInline(text: string): m.Children {
	const parts = text.split(/\*\*([^*]+)\*\*/g);
	if (parts.length === 1) return text;

	return parts.map((part, i) => (i % 2 === 1 ? m('strong', part) : part));
}

/** Render a markdown summary string as a list of block-level vnodes. */
export function renderSummaryMarkdown(markdown: string): m.Children {
	const blocks: m.Children[] = [];
	let bullets: m.Children[] = [];

	const flushBullets = (): void => {
		if (bullets.length > 0) {
			blocks.push(m('ul.summary-md__list', bullets));
			bullets = [];
		}
	};

	for (const rawLine of markdown.split('\n')) {
		const line = rawLine.trim();
		if (line === '') {
			flushBullets();
			continue;
		}

		const heading = /^(#{2,4})\s+(.*)$/.exec(line);
		if (heading) {
			flushBullets();
			// ## -> h3, ### -> h4, #### -> h5 (the page already owns h1/h2)
			const tag = `h${heading[1].length + 1}`;
			blocks.push(m(`${tag}.summary-md__heading`, renderInline(heading[2])));
			continue;
		}

		if (line.startsWith('- ')) {
			bullets.push(m('li', renderInline(line.slice(2))));
			continue;
		}

		flushBullets();
		blocks.push(m('p.summary-md__paragraph', renderInline(line)));
	}
	flushBullets();

	return blocks;
}
