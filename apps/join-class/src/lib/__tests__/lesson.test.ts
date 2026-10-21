import { describe, it, expect } from 'vitest';
import { Statement } from '@freedi/shared-types';
import {
	CLASS_CODE_LENGTH,
	HINT_MAX_LENGTH,
	LESSON_STEP_KEYS,
	buildLessonPlan,
	generateClassCode,
	getChallengeQuestion,
	getClassRole,
	getGuidingQuestions,
	isLessonStepKey,
	isValidStepIndex,
	lessonStepOf,
	nextStep,
	normalizeClassCode,
	normalizeHint,
	planChallengeWrites,
	stepFollowMePath,
	stepLabelKey,
} from '../lessonCore';

function q(id: string, extra: Partial<Statement> = {}, role?: 'guiding' | 'challenge'): Statement {
	return {
		statementId: id,
		statement: id,
		createdAt: 1000,
		statementSettings: role ? { classRole: role } : undefined,
		...extra,
	} as Statement;
}

describe('lesson steps', () => {
	it('has the eight steps in the fixed order', () => {
		expect([...LESSON_STEP_KEYS]).toEqual([
			'waiting',
			'opening',
			'side',
			'tables',
			'tableTalk',
			'proposals',
			'vote',
			'summary',
		]);
	});

	it('nextStep walks forward and ends at summary', () => {
		expect(nextStep('waiting')).toBe('opening');
		expect(nextStep('vote')).toBe('summary');
		expect(nextStep('summary')).toBeNull();
	});

	it('validates keys and indexes', () => {
		expect(isLessonStepKey('tables')).toBe(true);
		expect(isLessonStepKey('nope')).toBe(false);
		expect(isValidStepIndex(0)).toBe(true);
		expect(isValidStepIndex(7)).toBe(true);
		expect(isValidStepIndex(8)).toBe(false);
		expect(isValidStepIndex(-1)).toBe(false);
		expect(isValidStepIndex(1.5)).toBe(false);
	});

	it('lessonStepOf defaults to the first step and reads a plan', () => {
		expect(lessonStepOf(undefined)).toEqual({ index: 0, key: 'waiting' });
		expect(lessonStepOf(buildLessonPlan(4))).toEqual({ index: 4, key: 'tableTalk' });
		expect(lessonStepOf({ steps: [], stepIndex: 99 })).toEqual({ index: 0, key: 'waiting' });
	});

	it('buildLessonPlan carries all eight steps and the index', () => {
		const plan = buildLessonPlan(2);
		expect(plan.steps).toHaveLength(8);
		expect(plan.stepIndex).toBe(2);
	});

	it('maps every step to its own follow-me path on the hub', () => {
		const paths = LESSON_STEP_KEYS.map((k) => stepFollowMePath('m1', k));
		expect(new Set(paths).size).toBe(LESSON_STEP_KEYS.length);
		expect(paths[3]).toBe('/statement/m1?step=tables');
	});

	it('builds the i18n key of a step label', () => {
		expect(stepLabelKey('tableTalk')).toBe('step.tableTalk');
	});
});

describe('class roles', () => {
	it('treats an unset role as guiding', () => {
		expect(getClassRole(q('a'))).toBe('guiding');
		expect(getClassRole(q('a', {}, 'challenge'))).toBe('challenge');
	});

	it('finds the challenge question, or null', () => {
		expect(getChallengeQuestion([q('a'), q('b')])).toBeNull();
		expect(getChallengeQuestion([q('a'), q('b', {}, 'challenge')])?.statementId).toBe('b');
	});

	it('orders guiding questions by manual order then creation time', () => {
		const list = [
			q('late', { createdAt: 3000 }),
			q('ordered2', { order: 2 }),
			q('early', { createdAt: 1000 }),
			q('ordered1', { order: 1 }),
			q('chal', {}, 'challenge'),
		];
		expect(getGuidingQuestions(list).map((x) => x.statementId)).toEqual([
			'ordered1',
			'ordered2',
			'early',
			'late',
		]);
	});

	it('promotes one challenge and demotes the previous one', () => {
		const list = [q('a', {}, 'challenge'), q('b'), q('c')];
		expect(planChallengeWrites(list, 'b')).toEqual([
			{ questionId: 'b', role: 'challenge' },
			{ questionId: 'a', role: 'guiding' },
		]);
	});

	it('writes only the promotion when no challenge exists or it is re-picked', () => {
		expect(planChallengeWrites([q('a'), q('b')], 'a')).toEqual([
			{ questionId: 'a', role: 'challenge' },
		]);
		expect(planChallengeWrites([q('a', {}, 'challenge')], 'a')).toEqual([
			{ questionId: 'a', role: 'challenge' },
		]);
	});

	it('demotes every stray challenge so exactly one remains', () => {
		const list = [q('a', {}, 'challenge'), q('b', {}, 'challenge'), q('c')];
		const writes = planChallengeWrites(list, 'c');
		expect(writes.filter((w) => w.role === 'challenge')).toHaveLength(1);
		expect(writes.filter((w) => w.role === 'guiding').map((w) => w.questionId)).toEqual(['a', 'b']);
	});
});

describe('hint', () => {
	it('collapses whitespace to one line and caps the length', () => {
		expect(normalizeHint('  one\n two   three ')).toBe('one two three');
		expect(normalizeHint('x'.repeat(HINT_MAX_LENGTH + 20))).toHaveLength(HINT_MAX_LENGTH);
		expect(normalizeHint('   ')).toBe('');
	});
});

describe('class code', () => {
	it('generates six digits, keeping leading zeros', () => {
		expect(generateClassCode(() => 0)).toBe('000000');
		expect(generateClassCode(() => 0.999999)).toBe('999999');
		expect(generateClassCode()).toMatch(/^\d{6}$/);
		expect(CLASS_CODE_LENGTH).toBe(6);
	});

	it('uses the random source once per digit', () => {
		const seq = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
		let i = 0;
		expect(generateClassCode(() => seq[i++])).toBe('123456');
	});

	it('normalizes typed codes and rejects malformed ones', () => {
		expect(normalizeClassCode('123456')).toBe('123456');
		expect(normalizeClassCode(' 123 456 ')).toBe('123456');
		expect(normalizeClassCode('123-456')).toBe('123456');
		expect(normalizeClassCode('12345')).toBeNull();
		expect(normalizeClassCode('1234567')).toBeNull();
		expect(normalizeClassCode('12a456')).toBeNull();
		expect(normalizeClassCode('')).toBeNull();
	});
});
