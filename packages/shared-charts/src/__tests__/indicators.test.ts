import type { AgoraClassAggregate, AgoraStudentAggregate } from '@freedi/shared-types';
import { layoutChart } from '../layout';
import {
	CLASS_INDICATORS,
	SCHOOL_INDICATORS,
	STUDENT_INDICATORS,
	SYSTEM_INDICATORS,
	TEACHER_INDICATORS,
	indicatorsFor,
	labelKeysFor,
	resolveIndicators,
} from '../indicators';
import type {
	ClassIndicatorContext,
	Indicator,
	IndicatorLabels,
	IndicatorOutput,
	SchoolIndicatorContext,
	StudentIndicatorContext,
	SystemIndicatorContext,
	TeacherIndicatorContext,
} from '../indicators';

const labels: IndicatorLabels = {
	t: (key, params) => (params ? `${key}:${Object.values(params).join('/')}` : key),
	locale: 'en',
};

const day = (d: number): number => Date.UTC(2026, 8, d);

const points = (total: number): AgoraStudentAggregate['totals'] => ({
	valueAccuracy: 0,
	proposals: total,
	helping: 1,
	rating: 1,
	revising: 0,
	appreciation: 0,
	total: total + 2,
});

const career = (memberId: string, total: number): AgoraStudentAggregate => ({
	memberId,
	classId: 'c1',
	schoolId: 's1',
	gamesPlayed: 2,
	totals: points(total),
	avgPointsPerGame: (total + 2) / 2,
	bestGameTotal: total,
	lastPlayedAt: day(2),
	perGame: [
		{ sessionId: 'g1', topicPackageId: 't', classId: 'c1', playedAt: day(1), points: points(1) },
		{ sessionId: 'g2', topicPackageId: 't', classId: 'c1', playedAt: day(2), points: points(total - 1) },
	],
	lastUpdate: 0,
});

const classAggregate: AgoraClassAggregate = {
	classId: 'c1',
	schoolId: 's1',
	gamesPlayed: 3,
	scoredGames: 2,
	avgClassScore: 72.5,
	outcomes: { success: 1, honestDisagreement: 1, collapse: 0, unscored: 1 },
	studentGameSlots: 40,
	lastPlayedAt: day(3),
	perGame: [
		{ sessionId: 'g1', topicPackageId: 't', playedAt: day(1), participantCount: 12, classScoreTotal: 65 },
		{ sessionId: 'g2', topicPackageId: 't', playedAt: day(2), participantCount: 14, classScoreTotal: 80 },
		{ sessionId: 'g3', topicPackageId: 't', playedAt: day(3), participantCount: 14, convergenceScore: 12 },
	],
	lastUpdate: 0,
};

const emptyClass: ClassIndicatorContext = { aggregate: null, memberCount: 0, members: [], careers: {} };
const fullClass: ClassIndicatorContext = {
	aggregate: classAggregate,
	memberCount: 15,
	members: [
		{ memberId: 'm1', alias: 'Ada' },
		{ memberId: 'm2', alias: 'Bo' },
		{ memberId: 'm3', alias: 'Cy' },
	],
	careers: { m1: career('m1', 10), m2: career('m2', 4) },
};

const emptyStudent: StudentIndicatorContext = { career: null, classGames: 0 };
const fullStudent: StudentIndicatorContext = { career: career('m1', 10), classGames: 3 };

const emptyTeacher: TeacherIndicatorContext = {
	lessonsRun: 0,
	classLessons: 0,
	totalDurationMs: 0,
	avgClassScore: null,
	classCount: 0,
	usageDays: [],
	usageWeeks: [],
	lessonsByWeek: [],
	scoreByWeek: [],
	granularity: 'day',
};
const fullTeacher: TeacherIndicatorContext = {
	lessonsRun: 5,
	classLessons: 4,
	totalDurationMs: 95 * 60_000,
	avgClassScore: 68.25,
	classCount: 2,
	usageDays: [
		{ day: '2026-09-01', activeMs: 30 * 60_000 },
		{ day: '2026-09-02', activeMs: 65 * 60_000, bySurface: { teacher: 65 * 60_000 } },
	],
	usageWeeks: [{ weekStart: '2026-08-30', value: 95 * 60_000 }],
	lessonsByWeek: [{ weekStart: '2026-08-30', value: 3 }, { weekStart: '2026-09-06', value: 2 }],
	scoreByWeek: [{ weekStart: '2026-08-30', value: 60 }, { weekStart: '2026-09-06', value: null }, { weekStart: '2026-09-13', value: 75 }],
	granularity: 'day',
};

const emptySchool: SchoolIndicatorContext = {
	teacherCount: 0,
	classCount: 0,
	lessonsInPeriod: 0,
	studentGameSlots: 0,
	outcomes: { success: 0, honestDisagreement: 0, collapse: 0, unscored: 0 },
	classes: [],
	lessonsByWeek: [],
	minutesByWeek: [],
};
const fullSchool: SchoolIndicatorContext = {
	teacherCount: 4,
	classCount: 6,
	lessonsInPeriod: 12,
	studentGameSlots: 300,
	outcomes: { success: 5, honestDisagreement: 3, collapse: 1, unscored: 3 },
	classes: [
		{ label: '7A', avgClassScore: 55 },
		{ label: '7B', avgClassScore: null },
		{ label: '8A', avgClassScore: 81 },
	],
	lessonsByWeek: [{ weekStart: '2026-08-30', value: 7 }, { weekStart: '2026-09-06', value: 5 }],
	minutesByWeek: [{ weekStart: '2026-08-30', value: 300 }],
};

const emptySystem: SystemIndicatorContext = {
	totals: { gamesFinished: 0, studentsReached: 0, classesPlayed: 0 },
	gamesFinishedByDay: [],
	studentsReachedByDay: [],
	classesPlayedByDay: [],
	byOutcomeWeekly: { success: [], honestDisagreement: [], collapse: [], unscored: [] },
	teachersActive: 0,
};
const fullSystem: SystemIndicatorContext = {
	totals: { gamesFinished: 40, studentsReached: 900, classesPlayed: 30 },
	gamesFinishedByDay: [{ day: '2026-09-01', value: 3 }, { day: '2026-09-02', value: 5 }],
	studentsReachedByDay: [{ day: '2026-09-01', value: 60 }],
	classesPlayedByDay: [{ day: '2026-09-01', value: 2 }],
	byOutcomeWeekly: {
		success: [{ weekStart: '2026-08-30', value: 4 }, { weekStart: '2026-09-06', value: 6 }],
		honestDisagreement: [{ weekStart: '2026-09-06', value: 2 }],
		collapse: [],
		unscored: [{ weekStart: '2026-08-30', value: 1 }],
	},
	teachersActive: 9,
};

interface Scenario<Ctx> {
	name: string;
	registry: Indicator<Ctx>[];
	empty: Ctx;
	full: Ctx;
	/** Ids expected to be charts on the full fixture. */
	charts: string[];
}

const scenarios: Array<Scenario<ClassIndicatorContext> | Scenario<StudentIndicatorContext> | Scenario<TeacherIndicatorContext> | Scenario<SchoolIndicatorContext> | Scenario<SystemIndicatorContext>> = [
	{ name: 'class', registry: CLASS_INDICATORS, empty: emptyClass, full: fullClass, charts: ['class.scorePerLesson', 'class.participation', 'class.contributionByStudent', 'class.pointsDistribution'] },
	{ name: 'student', registry: STUDENT_INDICATORS, empty: emptyStudent, full: fullStudent, charts: ['student.pointsPerGame', 'student.contributionMix', 'student.attendance'] },
	{ name: 'teacher', registry: TEACHER_INDICATORS, empty: emptyTeacher, full: fullTeacher, charts: ['teacher.activeMinutes', 'teacher.lessonsPerWeek', 'teacher.scoreTrend'] },
	{ name: 'school', registry: SCHOOL_INDICATORS, empty: emptySchool, full: fullSchool, charts: ['school.outcomes', 'school.lessonsPerWeek', 'school.classComparison'] },
	{ name: 'system', registry: SYSTEM_INDICATORS, empty: emptySystem, full: fullSystem, charts: ['system.gamesFinishedByDay', 'system.studentsReachedByDay', 'system.classesPlayedByDay', 'system.outcomesPerWeek'] },
];

function buildAll<Ctx>(registry: Indicator<Ctx>[], ctx: Ctx): Array<[string, IndicatorOutput]> {
	return registry.map((i) => [i.id, i.build(ctx, labels)]);
}

describe.each(scenarios)('$name indicators', (scenario) => {
	// The union of scenarios is what lets one describe.each cover five contexts.
	const s = scenario as Scenario<unknown>;

	it('has unique ids that match the scope and list their title key', () => {
		const ids = s.registry.map((i) => i.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const i of s.registry) {
			expect(i.scope).toBe(s.name);
			expect(i.id.startsWith(`${s.name}.`)).toBe(true);
			expect(i.labelKeys).toContain(`indicator.${i.id}`);
			expect(['sm', 'md', 'lg']).toContain(i.size);
		}
	});

	it('builds on an empty context without throwing, as empty or a zero stat', () => {
		for (const [id, out] of buildAll(s.registry, s.empty)) {
			expect(['empty', 'stat']).toContain(out.type);
			if (out.type === 'stat') {
				expect(id).toBeDefined();
				expect(out.value === 0 || typeof out.value === 'string').toBe(true);
			}
			if (out.type === 'empty') expect(out.reasonKey).toMatch(/^no[A-Z]/);
		}
	});

	it('builds charts on the fixture that lay out without throwing', () => {
		const outs = buildAll(s.registry, s.full);
		for (const [id, out] of outs) {
			if (s.charts.includes(id)) {
				expect(out.type).toBe('chart');
				if (out.type === 'chart') {
					const g = layoutChart(out.spec, { locale: 'he', dir: 'rtl' });
					expect(g.primitives.length).toBeGreaterThan(0);
					expect(g.a11y.table.rows.length).toBeGreaterThan(0);
				}
			} else {
				expect(out.type).toBe('stat');
			}
		}
	});
});

describe('class indicator details', () => {
	const by = (id: string): IndicatorOutput => CLASS_INDICATORS.find((i) => i.id === id)!.build(fullClass, labels);

	it('computes the KPI tiles', () => {
		expect(by('class.lessons')).toEqual({ type: 'stat', value: 3 });
		expect(by('class.avgScore')).toEqual({ type: 'stat', value: 72.5 });
		expect(by('class.successRate')).toMatchObject({ type: 'stat', value: 50, unit: '%' });
	});

	it('plots only scored lessons and participation as a percent of members', () => {
		const score = by('class.scorePerLesson');
		expect(score.type === 'chart' && score.spec.kind === 'line' && score.spec.keys).toEqual(['2026-09-01', '2026-09-02']);
		const part = by('class.participation');
		expect(part.type === 'chart' && part.spec.kind === 'bars' && part.spec.series[0].values).toEqual([80, 93, 93]);
	});

	it('stacks five categories per alias and highlights the median', () => {
		const stack = by('class.contributionByStudent');
		if (stack.type !== 'chart' || stack.spec.kind !== 'stackedBars') throw new Error('expected stacked bars');
		expect(stack.spec.categories).toEqual(['Ada', 'Bo', 'Cy']);
		expect(stack.spec.series.map((s) => s.slot)).toEqual([1, 2, 3, 4, 5]);
		expect(stack.spec.series[0].values).toEqual([10, 4, 0]);
		const hist = by('class.pointsDistribution');
		if (hist.type !== 'chart' || hist.spec.kind !== 'histogram') throw new Error('expected histogram');
		expect(hist.spec.values).toEqual([12, 6]);
		expect(hist.spec.highlightValue).toBe(9);
		expect(hist.spec.highlightLabel).toBe('indicator.stat.median');
	});

	it('explains why a tile is empty', () => {
		const noScore = { ...fullClass, aggregate: { ...classAggregate, avgClassScore: null, outcomes: { success: 0, honestDisagreement: 0, collapse: 0, unscored: 3 }, perGame: [] } };
		const find = (id: string): Indicator<ClassIndicatorContext> => CLASS_INDICATORS.find((i) => i.id === id)!;
		expect(find('class.avgScore').build(noScore, labels)).toEqual({ type: 'empty', reasonKey: 'noScoredLessons' });
		expect(find('class.successRate').build(noScore, labels)).toEqual({ type: 'empty', reasonKey: 'noScoredLessons' });
		expect(find('class.participation').build({ ...fullClass, memberCount: 0 }, labels)).toEqual({ type: 'empty', reasonKey: 'noMembers' });
		expect(find('class.pointsDistribution').build({ ...fullClass, careers: {} }, labels)).toEqual({ type: 'empty', reasonKey: 'noPointsYet' });
	});
});

describe('student indicator details', () => {
	const find = (id: string): Indicator<StudentIndicatorContext> => STUDENT_INDICATORS.find((i) => i.id === id)!;

	it('reads the career doc', () => {
		expect(find('student.points').build(fullStudent, labels)).toEqual({ type: 'stat', value: 12 });
		expect(find('student.avgPerGame').build(fullStudent, labels)).toEqual({ type: 'stat', value: 6 });
		expect(find('student.bestGame').build(fullStudent, labels)).toEqual({ type: 'stat', value: 10 });
	});

	it('shows attendance as played vs missed with a hint', () => {
		const out = find('student.attendance').build(fullStudent, labels);
		if (out.type !== 'chart' || out.spec.kind !== 'strip') throw new Error('expected strip');
		expect(out.spec.parts.map((p) => p.value)).toEqual([2, 1]);
		expect(out.spec.parts[1].slot).toBe('muted');
		expect(out.hint).toBe('indicator.student.attendance.hint:2/3');
	});

	it('is empty for a student with no points', () => {
		const zero = { career: { ...career('m9', 0), totals: { ...points(0), proposals: 0, helping: 0, rating: 0, total: 0 } }, classGames: 1 };
		expect(find('student.contributionMix').build(zero, labels)).toEqual({ type: 'empty', reasonKey: 'noPointsYet' });
	});
});

describe('teacher indicator details', () => {
	const find = (id: string): Indicator<TeacherIndicatorContext> => TEACHER_INDICATORS.find((i) => i.id === id)!;

	it('prints active time through the app dictionary', () => {
		expect(find('teacher.activeTime').build(fullTeacher, labels)).toEqual({ type: 'stat', value: 'indicator.format.hoursMinutes:1/35' });
		expect(find('teacher.avgScore').build(fullTeacher, labels)).toEqual({ type: 'stat', value: 68.3 });
	});

	it('switches active minutes between days and weeks', () => {
		const days = find('teacher.activeMinutes').build(fullTeacher, labels);
		expect(days.type === 'chart' && days.spec.kind === 'bars' && days.spec.series[0].values).toEqual([30, 65]);
		const weeks = find('teacher.activeMinutes').build({ ...fullTeacher, granularity: 'week' }, labels);
		expect(weeks.type === 'chart' && weeks.spec.kind === 'bars' && weeks.spec.keys).toEqual(['2026-08-30']);
		expect(weeks.type === 'chart' && weeks.spec.kind === 'bars' && weeks.spec.series[0].values).toEqual([95]);
	});

	it('skips null weeks in the score trend', () => {
		const out = find('teacher.scoreTrend').build(fullTeacher, labels);
		if (out.type !== 'chart' || out.spec.kind !== 'line') throw new Error('expected line');
		expect(out.spec.keys).toEqual(['2026-08-30', '2026-09-13']);
		expect(out.spec.yDomainFrom).toBe('zero');
	});
});

describe('school indicator details', () => {
	const find = (id: string): Indicator<SchoolIndicatorContext> => SCHOOL_INDICATORS.find((i) => i.id === id)!;

	it('orders outcomes success/honest/collapse/unscored with icons', () => {
		const out = find('school.outcomes').build(fullSchool, labels);
		if (out.type !== 'chart' || out.spec.kind !== 'strip') throw new Error('expected strip');
		expect(out.spec.parts.map((p) => p.icon)).toEqual(['✓', '≈', '✕', '–']);
		expect(out.spec.parts.map((p) => p.slot)).toEqual([4, 2, 5, 'muted']);
		expect(out.spec.parts.map((p) => p.value)).toEqual([5, 3, 1, 3]);
	});

	it('sorts classes by score with unscored ones last and noted', () => {
		const out = find('school.classComparison').build(fullSchool, labels);
		if (out.type !== 'chart' || out.spec.kind !== 'hbars') throw new Error('expected hbars');
		expect(out.spec.rows.map((r) => r.label)).toEqual(['8A', '7A', '7B']);
		expect(out.spec.rows[2]).toMatchObject({ value: null, note: 'indicator.empty.noScoreYet', max: 100 });
	});
});

describe('system indicator details', () => {
	it('stacks outcomes over the union of weeks', () => {
		const out = SYSTEM_INDICATORS.find((i) => i.id === 'system.outcomesPerWeek')!.build(fullSystem, labels);
		if (out.type !== 'chart' || out.spec.kind !== 'stackedBars') throw new Error('expected stacked bars');
		expect(out.spec.categories).toEqual(['30/8', '6/9']);
		expect(out.spec.series.map((s) => s.values)).toEqual([[4, 6], [0, 2], [0, 0], [1, 0]]);
		expect(out.spec.series[3].slot).toBe(6);
	});
});

describe('registry', () => {
	it('returns a copy of each scope in order', () => {
		const list = indicatorsFor('class');
		expect(list.map((i) => i.id)).toEqual(CLASS_INDICATORS.map((i) => i.id));
		list.pop();
		expect(indicatorsFor('class')).toHaveLength(CLASS_INDICATORS.length);
	});

	it('hides by id and ignores unknown ids', () => {
		const ids = resolveIndicators('teacher', { hide: ['teacher.classes', 'nope'] }).map((i) => i.id);
		expect(ids).not.toContain('teacher.classes');
		expect(ids).toHaveLength(TEACHER_INDICATORS.length - 1);
	});

	it('orders listed ids first and keeps the rest in registry order', () => {
		const ids = resolveIndicators('school', { order: ['school.classComparison', 'school.outcomes', 'ghost'] }).map((i) => i.id);
		expect(ids.slice(0, 2)).toEqual(['school.classComparison', 'school.outcomes']);
		expect(ids.slice(2)).toEqual(['school.teachers', 'school.classes', 'school.lessons', 'school.studentGameSlots', 'school.lessonsPerWeek']);
		expect(resolveIndicators('school', { order: [] })).toHaveLength(SCHOOL_INDICATORS.length);
	});

	it('lists every label key a scope needs, once', () => {
		const keys = labelKeysFor('student');
		expect(keys).toContain('indicator.student.points');
		expect(keys).toContain('indicator.category.proposals');
		expect(new Set(keys).size).toBe(keys.length);
	});
});
