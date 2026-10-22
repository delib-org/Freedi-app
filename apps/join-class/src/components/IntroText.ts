import m from 'mithril';
import '@/styles/intro-text.scss';
import { ParagraphType } from '@freedi/shared-types';
import { decodeEntities, type IntroBlock } from '@/lib/classroom/introText';

/**
 * The introduction text as Mithril nodes (IA 14.2 "Video safety", UX 14.A).
 * Nothing here ever injects HTML: `contentHtml` is split on <strong> only, every
 * other tag is dropped to plain text, and the output is text nodes. Shared by
 * the plan screen's preview, the student Opening and the projector.
 */

export type IntroTextSize = 'phone' | 'preview' | 'projector';

export interface IntroRun {
	text: string;
	bold: boolean;
}

const TAG = /<[^>]*>/g;
const STRONG = /(<\/?strong>)/i;

/** Bold and plain runs of one block. Falls back to the plain `content`. */
export function introRuns(block: IntroBlock): IntroRun[] {
	if (!block.contentHtml) return [{ text: block.content, bold: false }];
	const runs: IntroRun[] = [];
	let bold = false;
	for (const part of block.contentHtml.split(STRONG)) {
		const lower = part.toLowerCase();
		if (lower === '<strong>') bold = true;
		else if (lower === '</strong>') bold = false;
		else {
			const text = decodeEntities(part.replace(TAG, ''));
			if (text !== '') runs.push({ text, bold });
		}
	}

	return runs.length > 0 ? runs : [{ text: block.content, bold: false }];
}

export type IntroGroup =
	| { kind: 'p'; block: IntroBlock }
	| { kind: 'ul' | 'ol'; blocks: IntroBlock[] };

/** Consecutive list items of the same kind share one <ul> / <ol>. */
export function groupIntroBlocks(blocks: readonly IntroBlock[]): IntroGroup[] {
	const groups: IntroGroup[] = [];
	for (const block of blocks) {
		if (block.type !== ParagraphType.li) {
			groups.push({ kind: 'p', block });
			continue;
		}
		const kind = block.listType === 'ol' ? 'ol' : 'ul';
		const last = groups[groups.length - 1];
		if (last && last.kind === kind) last.blocks.push(block);
		else groups.push({ kind, blocks: [block] });
	}

	return groups;
}

function inline(block: IntroBlock): m.Children {
	return introRuns(block).map((run) => (run.bold ? m('strong', run.text) : run.text));
}

/** Plain text (the `description` preview) as paragraph blocks, one per non-empty line. */
export function blocksFromPlainText(text: string): IntroBlock[] {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line !== '')
		.map((line): IntroBlock => ({ type: ParagraphType.paragraph, content: line }));
}

export interface IntroTextAttrs {
	blocks: readonly IntroBlock[];
	size: IntroTextSize;
	/** Projector only: the font-size step the fit check chose (48, 40 or 32). */
	fit?: number;
}

export const IntroText: m.Component<IntroTextAttrs> = {
	view({ attrs }) {
		if (attrs.blocks.length === 0) return null;

		return m(
			`.intro-text.intro-text--${attrs.size}`,
			{ 'data-fit': attrs.size === 'projector' && attrs.fit ? String(attrs.fit) : undefined },
			groupIntroBlocks(attrs.blocks).map((group, index) =>
				group.kind === 'p'
					? m('p.intro-text__p', { key: index, dir: 'auto' }, inline(group.block))
					: m(
							`${group.kind}.intro-text__list`,
							{ key: index },
							group.blocks.map((block, i) =>
								m('li.intro-text__item', { key: i, dir: 'auto' }, inline(block)),
							),
						),
			),
		);
	},
};
