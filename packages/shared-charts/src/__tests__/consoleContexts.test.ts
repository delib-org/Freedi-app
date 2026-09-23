import { emptyTeacherAggregate, type SupervisorTeacherDetail } from '@freedi/shared-types';
import {
	teacherContext,
	classContext,
	studentContext,
	systemContext,
} from '../indicators/consoleContexts';
import { TEACHER_INDICATORS } from '../indicators';
describe('console indicator adapters', () => {
	it('keeps active screen time separate from lesson duration and uses the selected period', () => {
		const data: SupervisorTeacherDetail = {
			teacher: { uid: 't', name: 'Teacher' },
			aggregate: { ...emptyTeacherAggregate('t'), totalDurationMs: 9000000, lessonsRun: 500 },
			period: { fromDay: '2026-09-01', toDay: '2026-09-30' },
			truncated: false,
			classes: [],
			lessonRows: [],
			usage: {
				days: [{ day: '2026-09-22', activeMs: 60000, heartbeats: 1, bySurface: { home: 60000 } }],
				weeks: [{ weekStart: '2026-09-20', activeMs: 60000 }],
				months: [],
			},
			lessons: {
				days: [{ day: '2026-09-22', lessons: 2, durationMs: 9000000 }],
				weeks: [{ weekStart: '2026-09-20', lessons: 2, durationMs: 9000000, avgClassScore: 80 }],
				months: [],
			},
		};
		const ctx = teacherContext(data, 'day');
		expect(ctx.lessonsRun).toBe(2);
		expect(ctx.totalDurationMs).toBe(60000);
		expect(ctx.scoreByWeek[0].value).toBe(80);
		const output = TEACHER_INDICATORS.find((i) => i.id === 'teacher.activeTime')!.build(ctx, {
			t: (_key, params) => `${params?.h}:${params?.m}`,
		});
		expect(output).toEqual({ type: 'stat', value: '0:1' });
	});
	it('handles a student or class before the first lesson', () => {
		expect(studentContext({ career: null, classGames: 0 })).toEqual({
			career: null,
			classGames: 0,
		});
		expect(
			classContext({ aggregate: null, members: [], memberCount: 0, careers: {} }).aggregate,
		).toBeNull();
	});
	it('rejects malformed stored aggregates at the boundary', () => {
		expect(() => studentContext({ career: { totals: 99 }, classGames: 1 })).toThrow();
	});
	it('derives system totals from the requested period rather than calendar totals', () => {
		const result = systemContext({
			schools: [],
			stats: { day: null, month: null, year: null },
			usage: { days: [], weeks: [], months: [] },
			teachersActive: 3,
			period: { fromDay: '2026-09-01', toDay: '2026-09-30' },
			series: {
				gamesFinished: [{ day: '2026-09-01', value: 2 }],
				studentsReached: [],
				classesPlayed: [],
				byOutcomeWeekly: { success: [], collapse: [], honestDisagreement: [], unscored: [] },
			},
		});
		expect(result.totals.gamesFinished).toBe(2);
	});
});
