import { describe, it, expect, jest } from '@jest/globals';
import { emptyTeacherAggregate, mergeTeacherLesson } from '@freedi/shared-types';

jest.mock('../../db', () => ({ db: {} }));
import { scopedAggregate, schoolLessonRows, seriesFromRows } from '../supervisorData';

describe('school-scoped teacher data', () => {
	const playedAt = Date.UTC(2026, 8, 22);
	const aggregate = [
		{ sessionId: 'own', schoolId: 's1', classId: 'c1', classScoreTotal: 50 },
		{ sessionId: 'other-school', schoolId: 's2', classId: 'c2', classScoreTotal: 90 },
		{ sessionId: 'guest', classScoreTotal: 100 },
	].reduce(
		(agg, row) =>
			mergeTeacherLesson(
				agg,
				{
					...row,
					topicPackageId: 'topic',
					playedAt,
					startedAt: playedAt - 60000,
					durationMs: 60000,
					participantCount: 3,
				},
				playedAt,
			),
		emptyTeacherAggregate('teacher'),
	);

	it('excludes other schools and guest lessons from every aggregate field', () => {
		const scoped = scopedAggregate(aggregate, 's1');
		expect(scoped?.lessonsRun).toBe(1);
		expect(scoped?.avgClassScore).toBe(50);
		expect(scoped?.studentGameSlots).toBe(3);
		expect(scoped?.totalDurationMs).toBe(60000);
		expect(scoped?.schoolIds).toEqual(['s1']);
		expect(scoped?.classesTaught).toEqual(['c1']);
		expect(JSON.stringify(scoped)).not.toMatch(/other-school|guest|s2|c2/);
	});

	it('rebuilds daily and monthly counts from the permitted lessons', () => {
		const series = seriesFromRows(schoolLessonRows(aggregate, 's1'), {
			fromDay: '2026-09-01',
			toDay: '2026-09-30',
		});
		expect(series.days.reduce((sum, day) => sum + day.lessons, 0)).toBe(1);
		expect(series.months[0].lessons).toBe(1);
	});

	it('returns empty data without revealing whether an unrelated school has lessons', () => {
		expect(scopedAggregate(aggregate, 'missing')?.lessonsRun).toBe(0);
		expect(scopedAggregate(undefined, 's1')).toBeUndefined();
	});
});
