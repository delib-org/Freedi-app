import { describe, it, expect } from 'vitest';
import {
	emptyClassAggregate,
	emptyStudentAggregate,
	emptyTeacherAggregate,
	type AgoraStudentAggregate,
	type SupervisorOverview,
	type SupervisorSystemView,
	type SupervisorTeacherDetail,
} from '@freedi/shared-types';
import {
	classContextFrom,
	schoolContextFrom,
	studentContextFrom,
	systemContextFrom,
	teacherContextFrom,
} from '../indicatorContexts';

const member = (
	id: string,
): { memberId: string; alias: string; joinedAt: number; lastActive: number } => ({
	memberId: id,
	alias: `alias-${id}`,
	joinedAt: 1,
	lastActive: 2,
});

function career(memberId: string, total: number): AgoraStudentAggregate {
	const base = emptyStudentAggregate(memberId, 'c1', 's1');

	return { ...base, gamesPlayed: 1, totals: { ...base.totals, total }, avgPointsPerGame: total };
}

describe('classContextFrom', () => {
	it('reads the teacher page (parsed Map) without re-parsing', () => {
		const ctx = classContextFrom({
			members: [member('a'), member('b')],
			careers: new Map([['a', career('a', 12)]]),
			aggregate: emptyClassAggregate('c1', 's1'),
		});
		expect(ctx.memberCount).toBe(2);
		expect(ctx.careers.a?.totals.total).toBe(12);
		expect(ctx.careers.b).toBeUndefined();
		expect(ctx.aggregate?.classId).toBe('c1');
	});

	it('parses the supervisor answer (unknown record) at the boundary', () => {
		const ctx = classContextFrom({
			memberCount: 1,
			members: [member('a')],
			careers: { a: career('a', 7) },
			aggregate: emptyClassAggregate('c1', 's1'),
		});
		expect(ctx.careers.a?.totals.total).toBe(7);
		expect(ctx.aggregate?.gamesPlayed).toBe(0);
	});

	it('rejects a malformed career instead of charting it', () => {
		expect(() =>
			classContextFrom({
				memberCount: 1,
				members: [member('a')],
				careers: { a: { totals: 3 } },
				aggregate: null,
			}),
		).toThrow();
	});
});

describe('studentContextFrom', () => {
	it('keeps a null career and never a negative denominator', () => {
		expect(studentContextFrom(null, -3)).toEqual({ career: null, classGames: 0 });
		const c = career('a', 5);
		expect(studentContextFrom(c, 4)).toEqual({ career: c, classGames: 4 });
	});
});

describe('teacherContextFrom', () => {
	const detail: SupervisorTeacherDetail = {
		teacher: { uid: 't', name: 'T' },
		aggregate: { ...emptyTeacherAggregate('t'), classLessons: 3 },
		period: { fromDay: '2026-09-01', toDay: '2026-09-30' },
		truncated: false,
		classes: [],
		lessonRows: [],
		usage: {
			days: [{ day: '2026-09-22', activeMs: 120_000, heartbeats: 1, bySurface: { home: 120_000 } }],
			weeks: [{ weekStart: '2026-09-20', activeMs: 120_000 }],
			months: [],
		},
		lessons: {
			days: [{ day: '2026-09-22', lessons: 2, durationMs: 1000 }],
			weeks: [{ weekStart: '2026-09-20', lessons: 2, durationMs: 1000, avgClassScore: 70 }],
			months: [],
		},
	};

	it('defaults to weeks and passes the granularity through', () => {
		expect(teacherContextFrom(detail).granularity).toBe('week');
		const ctx = teacherContextFrom(detail, 'day');
		expect(ctx.granularity).toBe('day');
		expect(ctx.lessonsRun).toBe(2);
		expect(ctx.classLessons).toBe(3);
		expect(ctx.usageWeeks).toEqual([{ weekStart: '2026-09-20', value: 120_000 }]);
	});
});

describe('schoolContextFrom', () => {
	it('sums the period and turns weekly usage into minutes', () => {
		const school: NonNullable<SupervisorOverview['school']> = {
			schoolId: 's1',
			name: 'School',
			scope: 'all',
			teachers: [
				{
					uid: 't',
					name: 'T',
					lessonsRun: 2,
					classLessons: 2,
					lastLessonAt: 0,
					totalDurationMs: 0,
					studentGameSlots: 40,
					avgClassScore: null,
					activeMs: 0,
					classCount: 1,
					lessonsByWeek: [],
					minutesByWeek: [],
				},
			],
			classes: [
				{
					classId: 'c1',
					name: 'A',
					memberCount: 20,
					teacherIds: ['t'],
					advancement: null,
					aggregate: null,
				},
			],
			outcomes: { success: 1, honestDisagreement: 0, collapse: 0, unscored: 1 },
			usage: { days: [], weeks: [{ weekStart: '2026-09-20', activeMs: 180_000 }], months: [] },
			lessons: {
				days: [{ day: '2026-09-22', lessons: 2, durationMs: 0 }],
				weeks: [{ weekStart: '2026-09-20', lessons: 2, durationMs: 0, avgClassScore: null }],
				months: [],
			},
			period: { fromDay: '2026-09-01', toDay: '2026-09-30' },
			truncated: false,
		};
		const ctx = schoolContextFrom(school);
		expect(ctx.teacherCount).toBe(1);
		expect(ctx.classCount).toBe(1);
		expect(ctx.lessonsInPeriod).toBe(2);
		expect(ctx.studentGameSlots).toBe(40);
		expect(ctx.minutesByWeek).toEqual([{ weekStart: '2026-09-20', value: 3 }]);
		expect(ctx.classes).toEqual([{ label: 'A', avgClassScore: null }]);
	});
});

describe('systemContextFrom', () => {
	it('totals the requested period', () => {
		const view: SupervisorSystemView = {
			schools: [],
			stats: { day: null, month: null, year: null },
			usage: { days: [], weeks: [], months: [] },
			teachersActive: 2,
			period: { fromDay: '2026-09-01', toDay: '2026-09-30' },
			series: {
				gamesFinished: [
					{ day: '2026-09-01', value: 2 },
					{ day: '2026-09-02', value: 3 },
				],
				studentsReached: [{ day: '2026-09-01', value: 50 }],
				classesPlayed: [],
				byOutcomeWeekly: { success: [], collapse: [], honestDisagreement: [], unscored: [] },
			},
		};
		const ctx = systemContextFrom(view);
		expect(ctx.totals).toEqual({ gamesFinished: 5, studentsReached: 50, classesPlayed: 0 });
		expect(ctx.teachersActive).toBe(2);
	});
});
