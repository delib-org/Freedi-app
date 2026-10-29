import { CLASS_GAME_MAX_TEXT_LENGTH, ParagraphType } from '@freedi/shared-types';
import type { ListType, Paragraph } from '@freedi/shared-types';

/**
 * The introduction text (IA 14.2, UX 14.A): markdown-lite typed in one textarea
 * <-> paragraph blocks (the shape of paragraph child Statements).
 *
 *   "- x" / "* x" / "• x"   a bullet item        (type li, listType ul)
 *   "1. x" / "2) x"         a numbered item      (type li, listType ol)
 *   "**x**"                 bold                 (contentHtml gets <strong>)
 *   anything else           a paragraph
 *
 * Pure: no DOM, no Firebase. Only `<strong>` is ever produced or read back as
 * formatting; every other tag is plain text.
 */

/** Characters over all blocks, plain (no stars, list markers or line breaks). */
export const INTRO_TEXT_MAX = 600;
export const INTRO_BLOCKS_MAX = 12;

export interface IntroBlock {
	type: ParagraphType.paragraph | ParagraphType.li;
	listType?: ListType;
	/** Plain text, the source of truth (what the count and the projector fit use). */
	content: string;
	/** Present only when the line has bold. Escaped text with <strong> runs. */
	contentHtml?: string;
}

const BULLET = /^[-*•]\s+(.*)$/;
const NUMBERED = /^\d+[.)]\s+(.*)$/;
const BOLD = /\*\*(.+?)\*\*/g;

const ENTITIES: ReadonlyArray<readonly [string, string]> = [
	['&lt;', '<'],
	['&gt;', '>'],
	['&quot;', '"'],
	['&#39;', "'"],
	['&amp;', '&'],
];

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/** Decodes the five entities escapeHtml writes (and nothing else). */
export function decodeEntities(text: string): string {
	let out = text;
	for (const [entity, char] of ENTITIES) out = out.split(entity).join(char);

	return out;
}

function lineToBlock(raw: string): IntroBlock | null {
	// trimStart only: "- " (a marker with nothing after it) must still read as a marker
	let line = raw.trimStart().replace(/\*\*\*\*/g, '');
	let listType: ListType | undefined;
	const bullet = BULLET.exec(line);
	const numbered = bullet ? null : NUMBERED.exec(line);
	if (bullet) {
		listType = 'ul';
		line = bullet[1].trim();
	} else if (numbered) {
		listType = 'ol';
		line = numbered[1].trim();
	}
	line = line.trim();
	if (line === '') return null;
	const hasBold = new RegExp(BOLD.source).test(line);
	const content = line.replace(BOLD, '$1');
	const block: IntroBlock = {
		type: listType ? ParagraphType.li : ParagraphType.paragraph,
		content,
	};
	if (listType) block.listType = listType;
	if (hasBold) block.contentHtml = escapeHtml(line).replace(BOLD, '<strong>$1</strong>');

	return block;
}

/** Text typed in the textarea -> blocks. Empty lines only space the textarea. */
export function parseIntroText(text: string): IntroBlock[] {
	const blocks: IntroBlock[] = [];
	for (const line of text.split(/\r?\n/)) {
		const block = lineToBlock(line);
		if (block) blocks.push(block);
	}

	return blocks;
}

/** Characters the count shows and the save is limited by. */
export function introTextLength(blocks: readonly IntroBlock[]): number {
	return blocks.reduce((sum, block) => sum + Array.from(block.content).length, 0);
}

export interface IntroTextCheck {
	blocks: IntroBlock[];
	length: number;
	tooLong: boolean;
	tooMany: boolean;
	/** One line (its text, or its markup once bold is applied) is over the server's cap on a single text. */
	lineTooLong: boolean;
	/** The save is allowed. */
	ok: boolean;
}

export function checkIntroText(text: string): IntroTextCheck {
	const blocks = parseIntroText(text);
	const length = introTextLength(blocks);
	const tooLong = length > INTRO_TEXT_MAX;
	const tooMany = blocks.length > INTRO_BLOCKS_MAX;

	const lineTooLong = blocks.some(
		(b) =>
			b.content.length > CLASS_GAME_MAX_TEXT_LENGTH ||
			(b.contentHtml?.length ?? 0) > CLASS_GAME_MAX_TEXT_LENGTH,
	);

	return {
		blocks,
		length,
		tooLong,
		tooMany,
		lineTooLong,
		ok: !tooLong && !tooMany && !lineTooLong,
	};
}

/** `<strong>x</strong>` runs back to `**x**` (everything else is text). */
function htmlToStars(contentHtml: string): string {
	return decodeEntities(
		contentHtml
			.replace(/<strong>/gi, '**')
			.replace(/<\/strong>/gi, '**')
			.replace(/<[^>]*>/g, ''),
	);
}

/** Paragraph DTOs (from `statementToParagraph`) -> blocks. Other block types read as paragraphs. */
export function blocksFromParagraphs(paragraphs: readonly Paragraph[]): IntroBlock[] {
	return [...paragraphs]
		.sort((a, b) => a.order - b.order)
		.map((p): IntroBlock => {
			const isItem = p.type === ParagraphType.li;
			const block: IntroBlock = {
				type: isItem ? ParagraphType.li : ParagraphType.paragraph,
				content: p.content,
			};
			if (isItem) block.listType = p.listType === 'ol' ? 'ol' : 'ul';
			if (p.contentHtml) block.contentHtml = p.contentHtml;

			return block;
		});
}

/** Blocks -> the text the teacher edits. A numbered run counts 1, 2, 3 again after any other block. */
export function introToText(blocks: readonly IntroBlock[]): string {
	const lines: string[] = [];
	let run = 0;
	for (const block of blocks) {
		const body = block.contentHtml ? htmlToStars(block.contentHtml) : block.content;
		if (block.type === ParagraphType.li && block.listType === 'ol') {
			run += 1;
			lines.push(`${run}. ${body}`);
			continue;
		}
		run = 0;
		lines.push(block.type === ParagraphType.li ? `- ${body}` : body);
	}

	return lines.join('\n');
}

// ---- the diff ----------------------------------------------------------------

/** A saved paragraph child, reduced to what the diff compares. */
export interface SavedBlock extends IntroBlock {
	statementId: string;
	order: number;
}

export interface IntroDiff {
	/** New blocks with the position they take. */
	creates: Array<{ block: IntroBlock; order: number }>;
	/** Saved blocks whose text, kind, formatting or position changed. */
	updates: Array<{ statementId: string; block: IntroBlock; order: number }>;
	deletes: string[];
}

function sameBlock(a: IntroBlock, b: IntroBlock): boolean {
	return (
		a.type === b.type &&
		(a.listType ?? null) === (b.listType ?? null) &&
		a.content === b.content &&
		(a.contentHtml ?? null) === (b.contentHtml ?? null)
	);
}

/**
 * Saved children vs the blocks just typed, matched by position: only what
 * changed is written (one edited sentence = one update), extra saved blocks are
 * deleted, extra typed blocks are created. Nothing changed = an empty diff.
 */
export function diffIntroBlocks(
	saved: readonly SavedBlock[],
	next: readonly IntroBlock[],
): IntroDiff {
	const ordered = [...saved].sort((a, b) => a.order - b.order);
	const diff: IntroDiff = { creates: [], updates: [], deletes: [] };
	next.forEach((block, index) => {
		const existing = ordered[index];
		if (!existing) {
			diff.creates.push({ block, order: index });

			return;
		}
		if (!sameBlock(existing, block) || existing.order !== index) {
			diff.updates.push({ statementId: existing.statementId, block, order: index });
		}
	});
	for (const extra of ordered.slice(next.length)) diff.deletes.push(extra.statementId);

	return diff;
}

export function isEmptyDiff(diff: IntroDiff): boolean {
	return diff.creates.length === 0 && diff.updates.length === 0 && diff.deletes.length === 0;
}
