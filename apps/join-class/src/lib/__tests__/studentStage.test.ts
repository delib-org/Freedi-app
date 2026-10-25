import { describe, it, expect, afterEach } from 'vitest';
import { LESSON_STEP_KEYS } from '../lessonCore';
import { setStudentStage, stageTitleKey, studentStageTitle } from '../studentStage';
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
		expect(he['step.proposals']).toBe('הצעות לפתרונות');
		expect(he['step.vote']).toBe('הצבעה');
		expect(he['step.summary']).toBe('סיכום');
	});

	it('names every step in every language', () => {
		for (const locale of [he, en, ar, de, es, fa, nl]) {
			for (const key of LESSON_STEP_KEYS) expect(locale[`step.${key}`]).toBeTruthy();
		}
	});
});
