import { describe, expect, it } from 'vitest';
import { checkSnapshot, CLASS_GAME_MAX_QUESTIONS } from '@freedi/shared-types';
import type { ClassGameSnapshot } from '@freedi/shared-types';
import {
	addQuestion,
	applyIntroDiff,
	blocksOf,
	emptySnapshot,
	orderedQuestions,
	removeQuestion,
	reorderQuestions,
	setDetails,
	setLanguage,
	setQuestionHint,
	setQuestionText,
	setVideos,
} from '../gameSnapshotEdit';

function withQuestions(): ClassGameSnapshot {
	let s = emptySnapshot('he');
	s = addQuestion(s, { key: 'a', text: 'A?', role: 'guiding' });
	s = addQuestion(s, { key: 'b', text: 'B?', role: 'guiding' });
	s = addQuestion(s, { key: 'c', text: 'Challenge?', role: 'challenge' });

	return s;
}

describe('game snapshot edits', () => {
	it('adds questions at the end and never touches the input', () => {
		const empty = emptySnapshot();
		const next = addQuestion(empty, { key: 'a', text: 'A?', role: 'guiding' });
		expect(empty.questions).toHaveLength(0);
		expect(next.questions[0]).toMatchObject({ key: 'a', order: 0, classRole: 'guiding' });
		expect(withQuestions().questions.map((q) => q.order)).toEqual([0, 1, 2]);
	});

	it('refuses past the cap', () => {
		let s = emptySnapshot();
		for (let i = 0; i < CLASS_GAME_MAX_QUESTIONS; i++) {
			s = addQuestion(s, { key: `k${i}`, text: 'q', role: 'guiding' });
		}
		expect(() => addQuestion(s, { key: 'x', text: 'q', role: 'guiding' })).toThrow(RangeError);
	});

	it('edits text and hint; an empty hint removes it', () => {
		let s = setQuestionText(withQuestions(), 'a', 'New?');
		s = setQuestionHint(s, 'a', 'think');
		expect(s.questions.find((q) => q.key === 'a')).toMatchObject({ text: 'New?', hint: 'think' });
		s = setQuestionHint(s, 'a', '');
		expect(s.questions.find((q) => q.key === 'a')).not.toHaveProperty('hint');
	});

	it('reorders and removes', () => {
		let s = reorderQuestions(withQuestions(), ['c', 'a', 'b']);
		expect(orderedQuestions(s).map((q) => q.key)).toEqual(['c', 'a', 'b']);
		s = removeQuestion(s, 'a');
		expect(s.questions.map((q) => q.key).sort()).toEqual(['b', 'c']);
	});

	it('merges details, replacing side pairs and clearing an empty side question', () => {
		let s = setDetails(emptySnapshot(), {
			speakSeconds: 90,
			sideNames: { a: 'x', b: 'y' },
			sideQuestion: 'which?',
			allowOwnQuestions: true,
		});
		expect(s.settings).toMatchObject({
			speakSeconds: 90,
			sideQuestion: 'which?',
			allowOwnQuestions: true,
		});
		expect(s.sideNames).toEqual({ a: 'x', b: 'y' });
		s = setDetails(s, { sideQuestion: '' });
		expect(s.settings).not.toHaveProperty('sideQuestion');
		expect(s.settings.speakSeconds).toBe(90);
	});

	it('sets and clears the language, and the video list retires the single videoUrl', () => {
		let s = setLanguage(emptySnapshot('he'), 'en');
		expect(s).toMatchObject({ defaultLanguage: 'en', forceLanguage: true });
		s = setLanguage(s, null);
		expect(s).not.toHaveProperty('defaultLanguage');
		s = setVideos(setDetails(s, { videoUrl: 'https://old' }), [
			{ id: 'v1', title: 'T', url: 'https://youtu.be/abc' },
		]);
		expect(s.introVideos).toHaveLength(1);
		expect(s.settings).not.toHaveProperty('videoUrl');
	});

	it('applies an intro diff: create, update, delete', () => {
		let n = 0;
		const key = (): string => `p${(n += 1)}`;
		const block = (content: string): { type: never; content: string } =>
			({ type: 'paragraph', content }) as never;
		let s = applyIntroDiff(
			emptySnapshot(),
			{
				creates: [
					{ block: block('one'), order: 0 },
					{ block: block('two'), order: 1 },
				],
				updates: [],
				deletes: [],
			},
			key,
		);
		expect(blocksOf(s).map((b) => b.content)).toEqual(['one', 'two']);
		s = applyIntroDiff(
			s,
			{
				creates: [],
				updates: [{ statementId: 'p1', block: block('uno'), order: 0 }],
				deletes: ['p2'],
			},
			key,
		);
		expect(blocksOf(s).map((b) => [b.statementId, b.content])).toEqual([['p1', 'uno']]);
	});

	it('every result is a snapshot the server accepts (no undefined, caps respected)', () => {
		const s = setDetails(withQuestions(), { speakSeconds: 60, sideClaims: { a: 'x', b: 'y' } });
		expect(checkSnapshot(JSON.parse(JSON.stringify(s)))).toMatchObject({ ok: true });
		expect(JSON.stringify(s)).not.toContain('undefined');
	});
});
