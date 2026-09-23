import {
	AGORA_TEACHER_AGGREGATE,
	dayKeyOf,
	deriveLessonSpan,
	emptyTeacherAggregate,
	mergeTeacherLesson,
	monthKeyOf,
	teacherLessonRowFrom,
} from '../models/agora/agoraTeacherAggregate';
import type {
	AgoraTeacherLessonRow,
	LessonRowSession,
} from '../models/agora/agoraTeacherAggregate';
import { AgoraSessionOutcome, AgoraSessionStatus } from '../models/agora/agoraEnums';
import type { AgoraClassScore } from '../models/agora/agoraSession';

// 2025-08-24T02:26:40Z
const NOW = 1_756_000_000_000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function row(
	sessionId: string,
	overrides: Partial<AgoraTeacherLessonRow> = {},
): AgoraTeacherLessonRow {
	return {
		sessionId,
		topicPackageId: 'topic-1',
		classId: 'class-1',
		schoolId: 'school-1',
		startedAt: NOW - HOUR,
		playedAt: NOW,
		durationMs: HOUR,
		participantCount: 20,
		...overrides,
	};
}

function classScore(computedAt: number, total = 70): AgoraClassScore {
	return {
		maxConsensus: 0,
		personalPointsSum: 0,
		avgPlausibility: 0,
		total,
		threshold: 60,
		success: true,
		outcome: AgoraSessionOutcome.success,
		healthMetricOutcomes: [],
		computedAt,
	};
}

function session(overrides: Partial<LessonRowSession> = {}): LessonRowSession {
	return {
		sessionId: 'sess-1',
		topicPackageId: 'topic-1',
		createdAt: NOW,
		lastUpdate: NOW,
		status: AgoraSessionStatus.live,
		...overrides,
	};
}

describe('period keys', () => {
	it('are UTC, zero-padded', () => {
		expect(monthKeyOf(Date.UTC(2026, 0, 5))).toBe('2026-01');
		expect(dayKeyOf(Date.UTC(2026, 0, 5, 23, 59))).toBe('2026-01-05');
		expect(dayKeyOf(Date.UTC(2026, 11, 31))).toBe('2026-12-31');
	});
});

describe('mergeTeacherLesson', () => {
	it('counts lessons, class lessons, reach, duration, classes and schools', () => {
		let agg = emptyTeacherAggregate('t1');
		agg = mergeTeacherLesson(agg, row('g1'), NOW);
		agg = mergeTeacherLesson(
			agg,
			row('g2', { classId: undefined, schoolId: undefined, participantCount: 5 }),
			NOW + 1,
		);
		agg = mergeTeacherLesson(agg, row('g3', { classId: 'class-2' }), NOW + 2);

		expect(agg.lessonsRun).toBe(3);
		expect(agg.classLessons).toBe(2);
		expect(agg.studentGameSlots).toBe(45);
		expect(agg.totalDurationMs).toBe(3 * HOUR);
		expect(agg.classesTaught).toEqual(['class-1', 'class-2']);
		expect(agg.schoolIds).toEqual(['school-1']);
		expect(agg.lastLessonAt).toBe(NOW);
		expect(agg.lastUpdate).toBe(NOW + 2);
	});

	it('refuses the same session twice (the second fence)', () => {
		let agg = emptyTeacherAggregate('t1');
		agg = mergeTeacherLesson(agg, row('g1'), NOW);
		const again = mergeTeacherLesson(agg, row('g1', { participantCount: 99 }), NOW + 5);

		expect(again).toBe(agg);
		expect(again.lessonsRun).toBe(1);
	});

	it('averages only the scored lessons, from the explicit count', () => {
		let agg = emptyTeacherAggregate('t1');
		agg = mergeTeacherLesson(agg, row('g1', { classScoreTotal: 80 }), NOW);
		agg = mergeTeacherLesson(agg, row('g2', { convergenceScore: 30 }), NOW);
		agg = mergeTeacherLesson(agg, row('g3', { classScoreTotal: 60 }), NOW);

		expect(agg.scoredGames).toBe(2);
		expect(agg.avgClassScore).toBe(70);
	});

	it('stays null with no scored lesson', () => {
		const agg = mergeTeacherLesson(emptyTeacherAggregate('t1'), row('g1'), NOW);
		expect(agg.avgClassScore).toBeNull();
	});

	it('tallies outcomes, unscored when absent', () => {
		let agg = emptyTeacherAggregate('t1');
		agg = mergeTeacherLesson(agg, row('g1', { outcome: AgoraSessionOutcome.success }), NOW);
		agg = mergeTeacherLesson(agg, row('g2', { outcome: AgoraSessionOutcome.collapse }), NOW);
		agg = mergeTeacherLesson(agg, row('g3'), NOW);

		expect(agg.outcomes).toEqual({ success: 1, honestDisagreement: 0, collapse: 1, unscored: 1 });
	});

	it('buckets by UTC month and trims to the newest months', () => {
		let agg = emptyTeacherAggregate('t1');
		agg = mergeTeacherLesson(
			agg,
			row('g1', { playedAt: Date.UTC(2026, 0, 10), durationMs: 10 }),
			NOW,
		);
		agg = mergeTeacherLesson(
			agg,
			row('g2', { playedAt: Date.UTC(2026, 0, 20), durationMs: 20 }),
			NOW,
		);
		agg = mergeTeacherLesson(
			agg,
			row('g3', { playedAt: Date.UTC(2026, 1, 1), durationMs: 5 }),
			NOW,
		);

		expect(agg.byMonth['2026-01']).toEqual({ lessons: 2, durationMs: 30, studentGameSlots: 40 });
		expect(agg.byMonth['2026-02']).toEqual({ lessons: 1, durationMs: 5, studentGameSlots: 20 });

		for (let month = 0; month < AGORA_TEACHER_AGGREGATE.MONTH_BUCKETS_CAP + 2; month++) {
			agg = mergeTeacherLesson(
				agg,
				row(`m${month}`, { playedAt: Date.UTC(2027 + Math.floor(month / 12), month % 12, 3) }),
				NOW,
			);
		}
		const keys = Object.keys(agg.byMonth).sort();
		expect(keys.length).toBe(AGORA_TEACHER_AGGREGATE.MONTH_BUCKETS_CAP);
		expect(keys).not.toContain('2026-01');
		expect(keys[keys.length - 1]).toBe(monthKeyOf(Date.UTC(2030, 1, 3)));
	});

	it('caps perLesson and classesTaught, keeping the newest', () => {
		let agg = emptyTeacherAggregate('t1');
		for (let i = 0; i < AGORA_TEACHER_AGGREGATE.LESSON_ROWS_CAP + 3; i++) {
			agg = mergeTeacherLesson(agg, row(`g${i}`, { classId: `class-${i}` }), NOW + i);
		}
		expect(agg.perLesson.length).toBe(AGORA_TEACHER_AGGREGATE.LESSON_ROWS_CAP);
		expect(agg.perLesson[0].sessionId).toBe('g3');
		expect(agg.lessonsRun).toBe(AGORA_TEACHER_AGGREGATE.LESSON_ROWS_CAP + 3);

		for (let i = 0; i < AGORA_TEACHER_AGGREGATE.CLASS_IDS_CAP; i++) {
			agg = mergeTeacherLesson(agg, row(`c${i}`, { classId: `extra-${i}` }), NOW);
		}
		expect(agg.classesTaught.length).toBe(AGORA_TEACHER_AGGREGATE.CLASS_IDS_CAP);
		expect(agg.classesTaught[agg.classesTaught.length - 1]).toBe(
			`extra-${AGORA_TEACHER_AGGREGATE.CLASS_IDS_CAP - 1}`,
		);
	});
});

describe('deriveLessonSpan', () => {
	it('is zero with no signals on a live session', () => {
		expect(deriveLessonSpan(session())).toEqual({ startedAt: NOW, endedAt: NOW, durationMs: 0 });
	});

	it('starts at the first stage opening, not the early createdAt', () => {
		const span = deriveLessonSpan(
			session({
				createdAt: NOW - 5 * HOUR,
				stageState: { a: { openedAt: NOW }, b: { openedAt: NOW + 10 * 60_000 } },
			}),
		);
		expect(span.startedAt).toBe(NOW);
		expect(span.endedAt).toBe(NOW + 10 * 60_000);
		expect(span.durationMs).toBe(10 * 60_000);
	});

	it('ends at the class score', () => {
		const span = deriveLessonSpan(
			session({
				stageState: { a: { openedAt: NOW } },
				classScore: classScore(NOW + 40 * 60_000),
			}),
		);
		expect(span.durationMs).toBe(40 * 60_000);
	});

	it('takes the latest of stage outcomes, agreement and convergence', () => {
		const span = deriveLessonSpan(
			session({
				stageState: {
					a: { openedAt: NOW },
					b: {
						openedAt: NOW + 5 * 60_000,
						outcome: { selected: [], computedAt: NOW + 50 * 60_000 },
					},
				},
				convergence: {
					before: null,
					after: null,
					score: null,
					participants: 0,
					computedAt: NOW + 20 * 60_000,
				},
			}),
		);
		expect(span.durationMs).toBe(50 * 60_000);
	});

	it('uses lastUpdate for a sweep-ended session, bounded by lessonEndsAt', () => {
		const unbounded = deriveLessonSpan(
			session({ status: AgoraSessionStatus.ended, lastUpdate: NOW + DAY - HOUR }),
		);
		expect(unbounded.durationMs).toBe(DAY - HOUR);

		const bounded = deriveLessonSpan(
			session({
				status: AgoraSessionStatus.ended,
				lastUpdate: NOW + DAY,
				lessonEndsAt: NOW + 45 * 60_000,
			}),
		);
		expect(bounded.durationMs).toBe(45 * 60_000);
	});

	it('never exceeds a day', () => {
		const span = deriveLessonSpan(
			session({
				stageState: { a: { openedAt: NOW }, b: { openedAt: NOW + 3 * DAY } },
			}),
		);
		expect(span.durationMs).toBe(AGORA_TEACHER_AGGREGATE.MAX_LESSON_MS);
	});

	it('ignores aggregatedAt entirely', () => {
		const span = deriveLessonSpan({
			...session({ stageState: { a: { openedAt: NOW } }, classScore: classScore(NOW + HOUR) }),
			aggregatedAt: NOW + 10 * DAY,
		} as LessonRowSession);
		expect(span.durationMs).toBe(HOUR);
	});

	it('never goes negative when a bound precedes the start', () => {
		const span = deriveLessonSpan(
			session({ stageState: { a: { openedAt: NOW } }, lessonEndsAt: NOW - HOUR }),
		);
		expect(span.durationMs).toBe(0);
	});
});

describe('teacherLessonRowFrom', () => {
	it('plays at the class score and carries score, outcome and class', () => {
		const built = teacherLessonRowFrom(
			session({
				classId: 'c1',
				schoolId: 's1',
				stageState: { a: { openedAt: NOW } },
				classScore: classScore(NOW + HOUR, 77),
			}),
			12,
		);
		expect(built).toEqual({
			sessionId: 'sess-1',
			topicPackageId: 'topic-1',
			classId: 'c1',
			schoolId: 's1',
			startedAt: NOW,
			playedAt: NOW + HOUR,
			durationMs: HOUR,
			participantCount: 12,
			classScoreTotal: 77,
			outcome: AgoraSessionOutcome.success,
		});
	});

	it('plays at the span end for a guest game that only ended', () => {
		const built = teacherLessonRowFrom(
			session({ status: AgoraSessionStatus.ended, lastUpdate: NOW + 30 * 60_000 }),
			4,
		);
		expect(built.classId).toBeUndefined();
		expect(built.playedAt).toBe(NOW + 30 * 60_000);
		expect(built.classScoreTotal).toBeUndefined();
		expect(built.outcome).toBeUndefined();
	});

	it('carries a convergence score but drops a null one', () => {
		const base = session({ stageState: { a: { openedAt: NOW } } });
		const scored = teacherLessonRowFrom(
			{
				...base,
				convergence: { before: 0.5, after: 0.2, score: 60, participants: 6, computedAt: NOW + 1 },
			},
			6,
		);
		expect(scored.convergenceScore).toBe(60);
		const unscored = teacherLessonRowFrom(
			{
				...base,
				convergence: {
					before: null,
					after: null,
					score: null,
					participants: 0,
					computedAt: NOW + 1,
				},
			},
			6,
		);
		expect(unscored.convergenceScore).toBeUndefined();
	});
});

describe('backfill history ordering', () => {
	it('retains the newest rows when old lessons arrive after live lessons', () => {
		let agg = emptyTeacherAggregate('t');
		for (let i = 0; i < 100; i++)
			agg = mergeTeacherLesson(agg, row(`recent-${i}`, { playedAt: NOW + i }), NOW);
		const next = mergeTeacherLesson(agg, row('old', { playedAt: NOW - DAY }), NOW);
		expect(next.lessonsRun).toBe(101);
		expect(next.perLesson).toHaveLength(100);
		expect(next.perLesson[0].sessionId).toBe('recent-0');
		expect(next.perLesson[99].sessionId).toBe('recent-99');
	});
});
