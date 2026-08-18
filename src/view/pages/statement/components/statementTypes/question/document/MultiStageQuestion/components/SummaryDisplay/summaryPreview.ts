/**
 * Teaser text for a collapsed AI summary.
 *
 * The summary is markdown (## headers, "- " bullets, **bold**), and the
 * collapsed card shows two lines of it. Clamping the *rendered* markdown is
 * unreliable — line-clamp only works on a single run of inline text, not on a
 * stack of headings and lists — so the collapsed state renders plain prose
 * built here, and CSS clamps that to two lines.
 */

/** Roughly two lines of body text in the summary card. Only used to decide
 *  whether there is more to read, never to cut the string. */
const PREVIEW_BUDGET = 160;

/** Hard cap on the text handed to the DOM; the visible clamp is CSS. */
const MAX_PREVIEW_CHARS = 600;

export interface SummaryPreview {
	/** Plain-text teaser, markdown syntax removed. */
	text: string;
	/** Whether the summary holds more than the teaser shows. */
	isTruncated: boolean;
}

const HEADING_LINE = /^#{1,6}\s+/;
const LIST_MARKER = /^([-*+]|\d+[.)])\s+/;

/** Strip the inline markdown the summaries use, keeping the words. */
function stripInline(line: string): string {
	return line
		.replace(/\[([^\]\n]+)\]\([^)\s]*\)/g, '$1') // links -> their text
		.replace(/(\*\*|__)(.*?)\1/g, '$2') // bold
		.replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, '$1$2') // italics
		.replace(/`([^`]+)`/g, '$1') // inline code
		.replace(/\s+/g, ' ')
		.trim();
}

export function buildSummaryPreview(markdown: string): SummaryPreview {
	const lines = markdown
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '');

	// Headings are skipped: "## The Answer in Brief" would spend half the teaser
	// on a section label instead of on what the group actually agreed.
	const prose = lines.filter((line) => !HEADING_LINE.test(line));
	// A summary that is nothing but headings still deserves a teaser.
	const source = prose.length > 0 ? prose : lines;

	const cleaned = source
		.map((line) => stripInline(line.replace(HEADING_LINE, '').replace(LIST_MARKER, '')))
		.filter((line) => line !== '')
		.join(' ');

	return {
		text: cleaned.slice(0, MAX_PREVIEW_CHARS),
		isTruncated: cleaned.length > PREVIEW_BUDGET || prose.length !== lines.length,
	};
}
