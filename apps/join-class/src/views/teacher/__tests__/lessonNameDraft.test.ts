import { describe, it, expect } from 'vitest';
import {
	LESSON_NAME_MAX,
	defaultLessonName,
	freshDraft,
	onChoiceChanged,
	onTyped,
	submittedName,
} from '../lessonNameDraft';

const join = (game: string, cls: string): string => `${game} עם ${cls}`;

describe('defaultLessonName', () => {
	it('is "<game> עם <class>" with a class', () => {
		expect(defaultLessonName('בריונות', 'ט׳3', join)).toBe('בריונות עם ט׳3');
	});

	it('is just the game for "בלי כיתה"', () => {
		expect(defaultLessonName('בריונות', null, join)).toBe('בריונות');
		expect(defaultLessonName('בריונות', '  ', join)).toBe('בריונות');
	});

	it('is capped', () => {
		expect(defaultLessonName('x'.repeat(200), 'y', join)).toHaveLength(LESSON_NAME_MAX);
	});
});

describe('lesson name draft', () => {
	it('re-fills on every class change until the teacher types', () => {
		let draft = freshDraft(defaultLessonName('בריונות', null, join));
		draft = onChoiceChanged(draft, defaultLessonName('בריונות', 'ט׳3', join));
		expect(draft).toEqual({ text: 'בריונות עם ט׳3', edited: false });
		draft = onChoiceChanged(draft, defaultLessonName('בריונות', 'ח׳1', join));
		expect(draft.text).toBe('בריונות עם ח׳1');
		draft = onChoiceChanged(draft, defaultLessonName('בריונות', null, join));
		expect(draft.text).toBe('בריונות');
	});

	it('keeps her text once she typed, whatever she picks', () => {
		let draft = onTyped('בריונות עם ט 3');
		draft = onChoiceChanged(draft, defaultLessonName('בריונות', 'ח׳1', join));
		expect(draft).toEqual({ text: 'בריונות עם ט 3', edited: true });
	});

	it('refuses a blank name and trims the rest', () => {
		expect(submittedName(onTyped('   '))).toBeNull();
		expect(submittedName(onTyped('  שם  '))).toBe('שם');
	});
});
