import { describe, it, expect, afterEach } from 'vitest';
import { LESSON_STEP_KEYS } from '../lessonCore';
import {
	progressOf,
	setStudentStage,
	stageTitleKey,
	studentStageProgress,
	studentStageTitle,
} from '../studentStage';
import he from '../locales/he';
import en from '../locales/en';
import ar from '../locales/ar';
import de from '../locales/de';
import es from '../locales/es';
import fa from '../locales/fa';
import nl from '../locales/nl';

describe('stage title', () => {
	afterEach(() => setStudentStage(null));

	it('maps every lesson step to its step.<key> label', () => {
		for (const key of LESSON_STEP_KEYS) expect(stageTitleKey(key)).toBe(`step.${key}`);
	});

	it('has no title when no stage is set', () => {
		expect(stageTitleKey(null)).toBeNull();
		expect(studentStageTitle()).toBeNull();
	});

	it('returns a title once a stage is set', () => {
		setStudentStage('vote');
		expect(studentStageTitle()).not.toBeNull();
	});

	it('uses the agreed Hebrew names', () => {
		expect(he['step.side']).toBe('בחירת צד');
		expect(he['step.tables']).toBe('חלוקה לשולחנות');
		expect(he['step.tableTalk']).toBe('שאלות חקירה');
		expect(he['step.proposals']).toBe('הצעות');
		expect(he['step.allProposals']).toBe('כל ההצעות');
		// one name per concept (IA 19.3): the class sheet and the step share "כל ההצעות"
		expect(he['proposal.class_list']).toBe(he['step.allProposals']);
		expect(he['step.vote']).toBe('הצבעה');
		expect(he['step.summary']).toBe('סיכום');
	});

	it('names every step in every language', () => {
		for (const locale of [he, en, ar, de, es, fa, nl]) {
			for (const key of LESSON_STEP_KEYS) expect(locale[`step.${key}`]).toBeTruthy();
		}
	});
});

describe('stage progress', () => {
	afterEach(() => setStudentStage(null));

	it('is 1-based n of the lesson total', () => {
		setStudentStage('side', { index: 2, total: 9 });
		expect(studentStageProgress()).toEqual({ n: 3, total: 9 });
	});

	it('has no progress without a position, or when no stage is set', () => {
		setStudentStage('side');
		expect(studentStageProgress()).toBeNull();
		setStudentStage(null, { index: 2, total: 9 });
		expect(studentStageProgress()).toBeNull();
	});

	it('refuses numbers it cannot show', () => {
		expect(progressOf(-1, 9)).toBeNull();
		expect(progressOf(9, 9)).toBeNull();
		expect(progressOf(0, 0)).toBeNull();
		expect(progressOf(1.5, 9)).toBeNull();
		expect(progressOf(8, 9)).toEqual({ n: 9, total: 9 });
	});
});
