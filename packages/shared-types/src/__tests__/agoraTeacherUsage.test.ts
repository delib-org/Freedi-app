import {
	AGORA_TEACHER_USAGE,
	bucketUsage,
	createAgoraTeacherUsageId,
	creditHeartbeat,
	dayKeysBetween,
	lessonSeries,
	weekStartOf,
} from '../models/agora/agoraTeacherUsage';
import type { AgoraTeacherUsageMonth } from '../models/agora/agoraTeacherUsage';
import { emptyTeacherAggregate, mergeTeacherLesson } from '../models/agora/agoraTeacherAggregate';
import type { AgoraTeacherLessonRow } from '../models/agora/agoraTeacherAggregate';

const MINUTE = 60_000;
// 2026-03-10T10:00:00Z — a Tuesday
const NOW = Date.UTC(2026, 2, 10, 10);

function beat(
	prev: AgoraTeacherUsageMonth | undefined,
	now: number,
	sinceMs = 5 * MINUTE,
	surface: 'home' | 'class' = 'home',
) {
	return creditHeartbeat(prev, { teacherId: 't1', surface, sinceMs, now });
}

describe('createAgoraTeacherUsageId', () => {
	it('joins uid and month', () => {
		expect(createAgoraTeacherUsageId('t1', '2026-03')).toBe('t1--2026-03');
	});
});

describe('creditHeartbeat', () => {
	it('opens the month with the first beat, crediting the clamped claim', () => {
		const { next, creditedMs } = beat(undefined, NOW);
		expect(creditedMs).toBe(5 * MINUTE);
		expect(next.month).toBe('2026-03');
		expect(next.activeMs).toBe(5 * MINUTE);
		expect(next.heartbeats).toBe(1);
		expect(next.bySurface).toEqual({ home: 5 * MINUTE });
		expect(next.days['2026-03-10']).toEqual({
			activeMs: 5 * MINUTE,
			heartbeats: 1,
			bySurface: { home: 5 * MINUTE },
		});
		expect(next.firstHeartbeatAt).toBe(NOW);
		expect(next.lastHeartbeatAt).toBe(NOW);
	});

	it('clamps a huge claim to the maximum', () => {
		const { creditedMs } = beat(undefined, NOW, 10 * 60 * MINUTE);
		expect(creditedMs).toBe(AGORA_TEACHER_USAGE.HEARTBEAT_MAX_MS);
	});

	it('treats a negative or non-finite claim as zero', () => {
		expect(beat(undefined, NOW, -5000).creditedMs).toBe(0);
		expect(beat(undefined, NOW, Number.NaN).creditedMs).toBe(0);
	});

	it('credits nothing for a burst inside the minimum gap, leaving the doc as it was', () => {
		const first = beat(undefined, NOW).next;
		const burst = beat(first, NOW + 5000);
		expect(burst.creditedMs).toBe(0);
		expect(burst.next).toBe(first);
	});

	it('never credits more than the wall clock since the previous beat', () => {
		const first = beat(undefined, NOW).next;
		const later = beat(first, NOW + 30_000, 5 * MINUTE);
		expect(later.creditedMs).toBe(30_000);
		expect(later.next.activeMs).toBe(5 * MINUTE + 30_000);
		expect(later.next.lastHeartbeatAt).toBe(NOW + 30_000);
		expect(later.next.firstHeartbeatAt).toBe(NOW);
	});

	it('drops a credit below the minimum', () => {
		const first = beat(undefined, NOW).next;
		const tiny = beat(first, NOW + 25_000, 500);
		expect(tiny.creditedMs).toBe(0);
		expect(tiny.next.heartbeats).toBe(1);
	});

	it('splits by surface at both levels and by day', () => {
		let doc = beat(undefined, NOW).next;
		doc = beat(doc, NOW + 5 * MINUTE, 5 * MINUTE, 'class').next;
		doc = beat(doc, NOW + 24 * 60 * MINUTE, 5 * MINUTE, 'class').next;
		expect(doc.bySurface).toEqual({ home: 5 * MINUTE, class: 10 * MINUTE });
		expect(doc.days['2026-03-10'].bySurface).toEqual({ home: 5 * MINUTE, class: 5 * MINUTE });
		expect(doc.days['2026-03-11'].activeMs).toBe(5 * MINUTE);
		expect(doc.heartbeats).toBe(3);
	});
});

describe('calendar helpers', () => {
	it('lists every day of the period inclusive, and none when reversed', () => {
		expect(dayKeysBetween({ fromDay: '2026-02-27', toDay: '2026-03-02' })).toEqual([
			'2026-02-27',
			'2026-02-28',
			'2026-03-01',
			'2026-03-02',
		]);
		expect(dayKeysBetween({ fromDay: '2026-03-02', toDay: '2026-03-01' })).toEqual([]);
	});

	it('anchors weeks on Sunday', () => {
		expect(weekStartOf('2026-03-10')).toBe('2026-03-08');
		expect(weekStartOf('2026-03-08')).toBe('2026-03-08');
		expect(weekStartOf('2026-03-14')).toBe('2026-03-08');
		expect(weekStartOf('2026-03-15')).toBe('2026-03-15');
	});
});

describe('bucketUsage', () => {
	it('zero-fills every day and sums docs across a month boundary', () => {
		const feb = beat(undefined, Date.UTC(2026, 1, 28, 9)).next;
		const marA = beat(undefined, Date.UTC(2026, 2, 1, 9)).next;
		const marB = beat(undefined, Date.UTC(2026, 2, 1, 9), 2 * MINUTE).next;
		const series = bucketUsage([feb, marA, marB], { fromDay: '2026-02-27', toDay: '2026-03-02' });

		expect(series.days.map((d) => d.day)).toEqual([
			'2026-02-27',
			'2026-02-28',
			'2026-03-01',
			'2026-03-02',
		]);
		expect(series.days[0].activeMs).toBe(0);
		expect(series.days[1].activeMs).toBe(5 * MINUTE);
		expect(series.days[2].activeMs).toBe(7 * MINUTE);
		expect(series.days[2].heartbeats).toBe(2);
		expect(series.days[2].bySurface).toEqual({ home: 7 * MINUTE });
		expect(series.months).toEqual([
			{ month: '2026-02', activeMs: 5 * MINUTE },
			{ month: '2026-03', activeMs: 7 * MINUTE },
		]);
		// Feb 27 2026 is a Friday → its week starts Sunday Feb 22; Mar 1 is a Sunday
		expect(series.weeks).toEqual([
			{ weekStart: '2026-02-22', activeMs: 5 * MINUTE },
			{ weekStart: '2026-03-01', activeMs: 7 * MINUTE },
		]);
	});

	it('ignores days outside the period', () => {
		const doc = beat(undefined, Date.UTC(2026, 2, 20, 9)).next;
		const series = bucketUsage([doc], { fromDay: '2026-03-01', toDay: '2026-03-05' });
		expect(series.days.every((d) => d.activeMs === 0)).toBe(true);
		expect(series.months).toEqual([{ month: '2026-03', activeMs: 0 }]);
	});
});

describe('lessonSeries', () => {
	function row(sessionId: string, playedAt: number, extra: Partial<AgoraTeacherLessonRow> = {}) {
		return {
			sessionId,
			topicPackageId: 'topic-1',
			startedAt: playedAt - 45 * MINUTE,
			playedAt,
			durationMs: 45 * MINUTE,
			participantCount: 20,
			...extra,
		};
	}

	it('counts lessons per day and week from the rows and per month from the buckets', () => {
		let agg = emptyTeacherAggregate('t1');
		agg = mergeTeacherLesson(agg, row('a', Date.UTC(2026, 2, 9, 8), { classScoreTotal: 80 }), NOW);
		agg = mergeTeacherLesson(agg, row('b', Date.UTC(2026, 2, 10, 8), { classScoreTotal: 60 }), NOW);
		agg = mergeTeacherLesson(agg, row('c', Date.UTC(2026, 2, 16, 8)), NOW);
		// Outside the period, but still in the month bucket
		agg = mergeTeacherLesson(agg, row('d', Date.UTC(2026, 2, 30, 8)), NOW);

		const series = lessonSeries(agg, { fromDay: '2026-03-08', toDay: '2026-03-21' });
		expect(series.days.length).toBe(14);
		expect(series.days.find((d) => d.day === '2026-03-09')).toEqual({
			day: '2026-03-09',
			lessons: 1,
			durationMs: 45 * MINUTE,
		});
		expect(series.weeks).toEqual([
			{ weekStart: '2026-03-08', lessons: 2, durationMs: 90 * MINUTE, avgClassScore: 70 },
			{ weekStart: '2026-03-15', lessons: 1, durationMs: 45 * MINUTE, avgClassScore: null },
		]);
		expect(series.months).toEqual([{ month: '2026-03', lessons: 4, durationMs: 180 * MINUTE }]);
	});

	it('is all zeros for a teacher with no aggregate', () => {
		const series = lessonSeries(null, { fromDay: '2026-03-08', toDay: '2026-03-10' });
		expect(series.days.map((d) => d.lessons)).toEqual([0, 0, 0]);
		expect(series.weeks).toEqual([
			{ weekStart: '2026-03-08', lessons: 0, durationMs: 0, avgClassScore: null },
		]);
		expect(series.months).toEqual([{ month: '2026-03', lessons: 0, durationMs: 0 }]);
	});
});

describe('month rollover', () => {
	it('cannot claim time already credited in the previous month', () => {
		const now = Date.UTC(2026, 3, 1, 0, 1);
		const first = beat(undefined, now);
		expect(first.creditedMs).toBe(MINUTE);
		expect(beat(first.next, now + 1000).creditedMs).toBe(0);
	});
});
