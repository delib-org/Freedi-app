import { describe, expect, it } from 'vitest';
import { CLASS_GAME_MAX_TEXT_LENGTH } from '@freedi/shared-types';
import {
	TextTooLongError,
	addQuestion,
	applyIntroDiff,
	emptySnapshot,
	setDetails,
	setQuestionHint,
	setQuestionText,
	setVideos,
} from '../gameSnapshotEdit';
import { checkIntroText } from '../introText';

const over = 'x'.repeat(CLASS_GAME_MAX_TEXT_LENGTH + 1);
const atCap = 'x'.repeat(CLASS_GAME_MAX_TEXT_LENGTH);
const base = addQuestion(emptySnapshot(), { key: 'a', text: 'A?', role: 'guiding' });
const block = (content: string, contentHtml?: string): never =>
	({ type: 'paragraph', content, ...(contentHtml ? { contentHtml } : {}) }) as never;

describe('the server cap on a single text (2000)', () => {
	it('refuses an intro paragraph over it, in its text or in its markup', () => {
		const key = (): string => 'k';
		expect(() =>
			applyIntroDiff(
				base,
				{ creates: [{ block: block(over), order: 0 }], updates: [], deletes: [] },
				key,
			),
		).toThrow(TextTooLongError);
		expect(() =>
			applyIntroDiff(
				base,
				{
					creates: [{ block: block('ok', `<strong>${over}</strong>`), order: 0 }],
					updates: [],
					deletes: [],
				},
				key,
			),
		).toThrow(TextTooLongError);
		expect(() =>
			applyIntroDiff(
				base,
				{ creates: [], updates: [{ statementId: 'k', block: block(over), order: 0 }], deletes: [] },
				key,
			),
		).toThrow(TextTooLongError);
		expect(
			applyIntroDiff(
				base,
				{ creates: [{ block: block(atCap), order: 0 }], updates: [], deletes: [] },
				key,
			).paragraphs,
		).toHaveLength(1);
	});

	it('refuses a question, a hint, a side text and a video title or link over it', () => {
		expect(() => setQuestionText(base, 'a', over)).toThrow(TextTooLongError);
		expect(() => setQuestionHint(base, 'a', over)).toThrow(TextTooLongError);
		expect(() => addQuestion(base, { key: 'b', text: over, role: 'guiding' })).toThrow(
			TextTooLongError,
		);
		expect(() => setDetails(base, { sideNames: { a: over, b: 'b' } })).toThrow(TextTooLongError);
		expect(() => setDetails(base, { sideClaims: { a: 'a', b: over } })).toThrow(TextTooLongError);
		expect(() => setDetails(base, { sideQuestion: over })).toThrow(TextTooLongError);
		expect(() => setVideos(base, [{ id: 'v', title: over, url: 'https://youtu.be/x' }])).toThrow(
			TextTooLongError,
		);
		expect(() => setVideos(base, [{ id: 'v', title: 't', url: `https://${over}` }])).toThrow(
			TextTooLongError,
		);
	});

	it('the intro editor blocks the save of a line over it, with its own flag', () => {
		const bold = Array.from({ length: 500 }, () => '**a**').join(' '); // short text, long markup
		const check = checkIntroText(bold);
		expect(check.lineTooLong || check.tooLong).toBe(true);
		expect(check.ok).toBe(false);
		const fine = checkIntroText('a short line');
		expect(fine.lineTooLong).toBe(false);
		expect(fine.ok).toBe(true);
	});
});
