import { describe, expect, it } from 'vitest';
import { ParagraphType } from '@freedi/shared-types';
import type { Paragraph } from '@freedi/shared-types';
import {
	INTRO_BLOCKS_MAX,
	INTRO_TEXT_MAX,
	blocksFromParagraphs,
	checkIntroText,
	decodeEntities,
	diffIntroBlocks,
	introToText,
	introTextLength,
	isEmptyDiff,
	parseIntroText,
	type IntroBlock,
	type SavedBlock,
} from '../introText';

const HE = 'השבוע הנהלת בית הספר שוקלת **לאסור טלפונים** בכל שעות היום.';

describe('parseIntroText', () => {
	it('reads paragraphs, bullets and numbered items; empty lines only space the textarea', () => {
		const blocks = parseIntroText('שורה ראשונה\n\n- יונתן\n* נועה\n• דנה\n1. אחד\n2) שניים');
		expect(blocks.map((b) => [b.type, b.listType ?? null, b.content])).toEqual([
			['paragraph', null, 'שורה ראשונה'],
			['li', 'ul', 'יונתן'],
			['li', 'ul', 'נועה'],
			['li', 'ul', 'דנה'],
			['li', 'ol', 'אחד'],
			['li', 'ol', 'שניים'],
		]);
	});

	it('keeps bold as contentHtml and the plain text without stars', () => {
		const [block] = parseIntroText(HE);
		expect(block.content).toBe('השבוע הנהלת בית הספר שוקלת לאסור טלפונים בכל שעות היום.');
		expect(block.contentHtml).toBe(
			'השבוע הנהלת בית הספר שוקלת <strong>לאסור טלפונים</strong> בכל שעות היום.',
		);
	});

	it('has no contentHtml without bold, and "**x**" is not a bullet', () => {
		const [plain, boldFirst] = parseIntroText('hello\n**x** then');
		expect(plain.contentHtml).toBeUndefined();
		expect(boldFirst.type).toBe('paragraph');
		expect(boldFirst.contentHtml).toBe('<strong>x</strong> then');
	});

	it('escapes markup typed by the teacher, so only <strong> can ever be formatting', () => {
		const [block] = parseIntroText('<img src=x onerror=alert(1)> **b** & "q"');
		expect(block.content).toBe('<img src=x onerror=alert(1)> b & "q"');
		expect(block.contentHtml).toBe(
			'&lt;img src=x onerror=alert(1)&gt; <strong>b</strong> &amp; &quot;q&quot;',
		);
		expect(block.contentHtml).not.toContain('<img');
	});

	it('drops a line that is only a marker or only empty bold, and leaves a lone ** literal', () => {
		expect(parseIntroText('- \n1. \n****\nא ** ב')).toEqual([
			{ type: 'paragraph', content: 'א ** ב' },
		]);
	});

	it('handles CRLF', () => {
		expect(parseIntroText('a\r\nb')).toHaveLength(2);
	});
});

describe('count and limits', () => {
	it('counts the plain characters of all blocks (no stars, markers or breaks)', () => {
		expect(introTextLength(parseIntroText('**ab** c\n- de'))).toBe(6);
	});

	it(`allows exactly ${INTRO_TEXT_MAX} characters and refuses one more`, () => {
		expect(checkIntroText('א'.repeat(INTRO_TEXT_MAX)).ok).toBe(true);
		const over = checkIntroText('א'.repeat(INTRO_TEXT_MAX + 1));
		expect(over.tooLong).toBe(true);
		expect(over.ok).toBe(false);
	});

	it(`allows ${INTRO_BLOCKS_MAX} blocks and refuses one more`, () => {
		const lines = (n: number): string => Array.from({ length: n }, (_, i) => `ש${i}`).join('\n');
		expect(checkIntroText(lines(INTRO_BLOCKS_MAX)).ok).toBe(true);
		const many = checkIntroText(lines(INTRO_BLOCKS_MAX + 1));
		expect(many.tooMany).toBe(true);
		expect(many.ok).toBe(false);
	});

	it('counts an emoji or astral character once', () => {
		expect(introTextLength(parseIntroText('a\u{1F600}'))).toBe(2);
	});
});

describe('round trip', () => {
	const paragraphOf = (b: IntroBlock, order: number): Paragraph => ({
		paragraphId: `p${order}`,
		type: b.type,
		content: b.content,
		order,
		...(b.listType ? { listType: b.listType } : {}),
		...(b.contentHtml ? { contentHtml: b.contentHtml } : {}),
	});

	it('text -> blocks -> text is stable, and numbered runs restart', () => {
		const text = `${HE}\nלפני שמחליטים:\n- יונתן\n- נועה\nאחר כך:\n1. ראשון\n2. שני`;
		const blocks = parseIntroText(text);
		expect(introToText(blocks)).toBe(text);
		const again = introToText(parseIntroText('1. a\n2. b\ntext\n7. c\n9. d'));
		expect(again).toBe('1. a\n2. b\ntext\n1. c\n2. d');
	});

	it('blocks survive the paragraph DTO shape (and unordered input)', () => {
		const blocks = parseIntroText('- **א** ב\nשורה');
		const paragraphs = blocks.map(paragraphOf).reverse();
		expect(blocksFromParagraphs(paragraphs)).toEqual(blocks);
	});

	it('reads headings and images as plain paragraphs', () => {
		const odd: Paragraph = { paragraphId: 'h', type: ParagraphType.h2, content: 'כותרת', order: 0 };
		expect(blocksFromParagraphs([odd])).toEqual([{ type: 'paragraph', content: 'כותרת' }]);
	});

	it('decodes entities back to text for the editor', () => {
		const blocks = parseIntroText('a < b & **c** > "d"');
		expect(introToText(blocks)).toBe('a < b & **c** > "d"');
		expect(decodeEntities('&lt;strong&gt; &amp;amp;')).toBe('<strong> &amp;');
	});
});

describe('diffIntroBlocks', () => {
	const saved = (text: string): SavedBlock[] =>
		parseIntroText(text).map((b, i) => ({ ...b, statementId: `s${i}`, order: i }));

	it('is empty when nothing changed', () => {
		expect(isEmptyDiff(diffIntroBlocks(saved('a\n- b'), parseIntroText('a\n- b')))).toBe(true);
	});

	it('one edited sentence is one update', () => {
		const diff = diffIntroBlocks(saved('a\nb\nc'), parseIntroText('a\nB\nc'));
		expect(diff.updates).toHaveLength(1);
		expect(diff.updates[0]).toMatchObject({ statementId: 's1', order: 1 });
		expect(diff.creates).toHaveLength(0);
		expect(diff.deletes).toHaveLength(0);
	});

	it('creates the extra typed blocks and deletes the extra saved ones', () => {
		const grown = diffIntroBlocks(saved('a'), parseIntroText('a\nb\nc'));
		expect(grown.creates.map((c) => c.order)).toEqual([1, 2]);
		const shrunk = diffIntroBlocks(saved('a\nb\nc'), parseIntroText('a'));
		expect(shrunk.deletes).toEqual(['s1', 's2']);
	});

	it('a block that turns into a list item, or gains bold, is an update', () => {
		expect(diffIntroBlocks(saved('a'), parseIntroText('- a')).updates).toHaveLength(1);
		expect(diffIntroBlocks(saved('a'), parseIntroText('**a**')).updates).toHaveLength(1);
	});

	it('repairs a saved block whose order drifted, without touching its text', () => {
		const drifted: SavedBlock[] = [{ ...saved('a')[0], order: 5 }];
		const diff = diffIntroBlocks(drifted, parseIntroText('a'));
		expect(diff.updates).toEqual([{ statementId: 's0', block: parseIntroText('a')[0], order: 0 }]);
	});

	it('clearing the text deletes everything', () => {
		expect(diffIntroBlocks(saved('a\nb'), parseIntroText('')).deletes).toEqual(['s0', 's1']);
	});
});
