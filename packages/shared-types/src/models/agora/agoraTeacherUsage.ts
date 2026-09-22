import { object, string, number, record, picklist, InferOutput } from 'valibot';
import { dayKeyOf, monthKeyOf } from './agoraTeacherAggregate';
import type { AgoraTeacherAggregate } from './agoraTeacherAggregate';

/**
 * How much time a teacher spends in the console — the supervisor's "hours"
 * number, kept apart from lessons because a teacher also plans, reads
 * reports and browses topics.
 *
 * The client sends a heartbeat every HEARTBEAT_INTERVAL_MS while a console
 * surface is open and visible; the server credits at most the wall-clock gap
 * since the previous heartbeat. One doc per teacher per UTC month, with a
 * per-day breakdown inside, so a 90-day chart is at most four reads.
 */

export const AGORA_TEACHER_SURFACES = [
	'home',
	'start',
	'class',
	'report',
	'session',
	'projector',
	'topic',
	'supervise',
] as const;

export const AgoraTeacherSurfaceSchema = picklist(AGORA_TEACHER_SURFACES);

export type AgoraTeacherSurface = InferOutput<typeof AgoraTeacherSurfaceSchema>;

export const AGORA_TEACHER_USAGE = {
	/** The client's beat while a surface is open and visible */
	HEARTBEAT_INTERVAL_MS: 5 * 60_000,
	/** The most one heartbeat may claim (interval plus slack) */
	HEARTBEAT_MAX_MS: 5.5 * 60_000,
	/** Below this a heartbeat is noise and credits nothing */
	HEARTBEAT_MIN_MS: 1000,
	/** Two heartbeats closer than this are one — a burst credits once */
	HEARTBEAT_MIN_GAP_MS: 20_000,
	DEFAULT_SERIES_DAYS: 90,
	MAX_SERIES_DAYS: 366,
} as const;

export const AgoraUsageSliceSchema = object({
	activeMs: number(),
	heartbeats: number(),
	/** surface → ms */
	bySurface: record(string(), number()),
});

export type AgoraUsageSlice = InferOutput<typeof AgoraUsageSliceSchema>;

/** Doc id: `createAgoraTeacherUsageId(teacherId, month)`. */
export const AgoraTeacherUsageMonthSchema = object({
	teacherId: string(),
	/** 'YYYY-MM' (UTC) */
	month: string(),
	activeMs: number(),
	heartbeats: number(),
	bySurface: record(string(), number()),
	/** 'YYYY-MM-DD' → that day's slice */
	days: record(string(), AgoraUsageSliceSchema),
	firstHeartbeatAt: number(),
	lastHeartbeatAt: number(),
	lastUpdate: number(),
});

export type AgoraTeacherUsageMonth = InferOutput<typeof AgoraTeacherUsageMonthSchema>;

export function createAgoraTeacherUsageId(teacherId: string, month: string): string {
	return `${teacherId}--${month}`;
}

export interface HeartbeatInput {
	teacherId: string;
	surface: AgoraTeacherSurface;
	/** What the client believes elapsed since its last beat */
	sinceMs: number;
	now: number;
}

export interface HeartbeatResult {
	next: AgoraTeacherUsageMonth;
	creditedMs: number;
}

function addSurface(
	bySurface: Record<string, number>,
	surface: string,
	ms: number,
): Record<string, number> {
	return { ...bySurface, [surface]: (bySurface[surface] ?? 0) + ms };
}

/**
 * Credit one heartbeat against the month doc it belongs to.
 *
 * The client's claim is clamped to [0, HEARTBEAT_MAX_MS]; the credit is the
 * smaller of that claim and the wall-clock gap since the previous beat, so a
 * client that lies about its interval cannot earn more than time actually
 * passed. A beat inside HEARTBEAT_MIN_GAP_MS of the previous one is a burst
 * (two tabs, a retry) and credits nothing; a credit below HEARTBEAT_MIN_MS is
 * noise and also leaves the doc untouched.
 */
export function creditHeartbeat(
	prev: AgoraTeacherUsageMonth | undefined,
	input: HeartbeatInput,
): HeartbeatResult {
	const { teacherId, surface, now } = input;
	const month = monthKeyOf(now);
	const clamped = Math.min(
		Math.max(0, Number.isFinite(input.sinceMs) ? input.sinceMs : 0),
		AGORA_TEACHER_USAGE.HEARTBEAT_MAX_MS,
	);
	const base: AgoraTeacherUsageMonth = prev ?? {
		teacherId,
		month,
		activeMs: 0,
		heartbeats: 0,
		bySurface: {},
		days: {},
		firstHeartbeatAt: now,
		lastHeartbeatAt: 0,
		lastUpdate: now,
	};

	if (prev && now - prev.lastHeartbeatAt < AGORA_TEACHER_USAGE.HEARTBEAT_MIN_GAP_MS) {
		return { next: prev, creditedMs: 0 };
	}
	const creditedMs = prev ? Math.min(clamped, now - prev.lastHeartbeatAt) : clamped;
	if (creditedMs < AGORA_TEACHER_USAGE.HEARTBEAT_MIN_MS) {
		return { next: base, creditedMs: 0 };
	}

	const day = dayKeyOf(now);
	const daySlice = base.days[day] ?? { activeMs: 0, heartbeats: 0, bySurface: {} };

	return {
		creditedMs,
		next: {
			...base,
			activeMs: base.activeMs + creditedMs,
			heartbeats: base.heartbeats + 1,
			bySurface: addSurface(base.bySurface, surface, creditedMs),
			days: {
				...base.days,
				[day]: {
					activeMs: daySlice.activeMs + creditedMs,
					heartbeats: daySlice.heartbeats + 1,
					bySurface: addSurface(daySlice.bySurface, surface, creditedMs),
				},
			},
			firstHeartbeatAt: base.firstHeartbeatAt,
			lastHeartbeatAt: now,
			lastUpdate: now,
		},
	};
}

// ---------------------------------------------------------------------------
// Series — what the charts read. Zero-filled per day so a quiet week is a
// flat line, not a missing one.
// ---------------------------------------------------------------------------

export interface AgoraPeriod {
	/** 'YYYY-MM-DD', inclusive */
	fromDay: string;
	/** 'YYYY-MM-DD', inclusive */
	toDay: string;
}

export interface AgoraUsageSeries {
	days: Array<{
		day: string;
		activeMs: number;
		heartbeats: number;
		bySurface: Record<string, number>;
	}>;
	/** Sunday-anchored weeks covering the period */
	weeks: Array<{ weekStart: string; activeMs: number }>;
	months: Array<{ month: string; activeMs: number }>;
}

export interface LessonSeries {
	days: Array<{ day: string; lessons: number; durationMs: number }>;
	weeks: Array<{
		weekStart: string;
		lessons: number;
		durationMs: number;
		/** Mean of the week's scored lessons; null when none were scored */
		avgClassScore: number | null;
	}>;
	months: Array<{ month: string; lessons: number; durationMs: number }>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' → UTC midnight ms. */
export function dayKeyToMs(day: string): number {
	const [yyyy, mm, dd] = day.split('-').map(Number);

	return Date.UTC(yyyy, mm - 1, dd);
}

/** Every 'YYYY-MM-DD' from `fromDay` to `toDay` inclusive (empty when reversed). */
export function dayKeysBetween(period: AgoraPeriod): string[] {
	const from = dayKeyToMs(period.fromDay);
	const to = dayKeyToMs(period.toDay);
	const keys: string[] = [];
	for (let ms = from; ms <= to; ms += DAY_MS) keys.push(dayKeyOf(ms));

	return keys;
}

/** The Sunday ('YYYY-MM-DD') that starts the week a day falls in. */
export function weekStartOf(day: string): string {
	const ms = dayKeyToMs(day);
	const weekday = new Date(ms).getUTCDay();

	return dayKeyOf(ms - weekday * DAY_MS);
}

/**
 * Bucket a teacher's (or a school's) usage months into a daily series over
 * the period, plus Sunday weeks and calendar months rolled up from those
 * days. Several docs for the same month (a school's teachers) add together.
 */
export function bucketUsage(
	months: ReadonlyArray<AgoraTeacherUsageMonth>,
	period: AgoraPeriod,
): AgoraUsageSeries {
	const byDay = new Map<string, AgoraUsageSlice>();
	for (const doc of months) {
		for (const [day, slice] of Object.entries(doc.days)) {
			const prev = byDay.get(day) ?? { activeMs: 0, heartbeats: 0, bySurface: {} };
			const bySurface = { ...prev.bySurface };
			for (const [surface, ms] of Object.entries(slice.bySurface)) {
				bySurface[surface] = (bySurface[surface] ?? 0) + ms;
			}
			byDay.set(day, {
				activeMs: prev.activeMs + slice.activeMs,
				heartbeats: prev.heartbeats + slice.heartbeats,
				bySurface,
			});
		}
	}

	const days = dayKeysBetween(period).map((day) => {
		const slice = byDay.get(day) ?? { activeMs: 0, heartbeats: 0, bySurface: {} };

		return { day, ...slice };
	});

	const weeks = new Map<string, number>();
	const monthTotals = new Map<string, number>();
	for (const row of days) {
		const weekStart = weekStartOf(row.day);
		weeks.set(weekStart, (weeks.get(weekStart) ?? 0) + row.activeMs);
		const month = row.day.slice(0, 7);
		monthTotals.set(month, (monthTotals.get(month) ?? 0) + row.activeMs);
	}

	return {
		days,
		weeks: [...weeks.entries()].map(([weekStart, activeMs]) => ({ weekStart, activeMs })),
		months: [...monthTotals.entries()].map(([month, activeMs]) => ({ month, activeMs })),
	};
}

/**
 * A teacher's lessons over the period. Days and weeks come from the
 * `perLesson` rows (capped, so a very busy teacher's oldest days are
 * under-counted — never over); months come from `byMonth`, which is exact.
 */
export function lessonSeries(
	agg: Pick<AgoraTeacherAggregate, 'perLesson' | 'byMonth'> | null | undefined,
	period: AgoraPeriod,
): LessonSeries {
	const dayKeys = dayKeysBetween(period);
	const inRange = new Set(dayKeys);
	const byDay = new Map<string, { lessons: number; durationMs: number }>();
	const byWeek = new Map<
		string,
		{ lessons: number; durationMs: number; scoreSum: number; scored: number }
	>();

	for (const row of agg?.perLesson ?? []) {
		const day = dayKeyOf(row.playedAt);
		if (!inRange.has(day)) continue;
		const dayPrev = byDay.get(day) ?? { lessons: 0, durationMs: 0 };
		byDay.set(day, {
			lessons: dayPrev.lessons + 1,
			durationMs: dayPrev.durationMs + row.durationMs,
		});
		const weekStart = weekStartOf(day);
		const weekPrev = byWeek.get(weekStart) ?? {
			lessons: 0,
			durationMs: 0,
			scoreSum: 0,
			scored: 0,
		};
		byWeek.set(weekStart, {
			lessons: weekPrev.lessons + 1,
			durationMs: weekPrev.durationMs + row.durationMs,
			scoreSum: weekPrev.scoreSum + (row.classScoreTotal ?? 0),
			scored: weekPrev.scored + (row.classScoreTotal !== undefined ? 1 : 0),
		});
	}

	const days = dayKeys.map((day) => ({
		day,
		...(byDay.get(day) ?? { lessons: 0, durationMs: 0 }),
	}));

	const weekStarts: string[] = [];
	for (const day of dayKeys) {
		const weekStart = weekStartOf(day);
		if (weekStarts[weekStarts.length - 1] !== weekStart) weekStarts.push(weekStart);
	}
	const weeks = weekStarts.map((weekStart) => {
		const week = byWeek.get(weekStart);

		return {
			weekStart,
			lessons: week?.lessons ?? 0,
			durationMs: week?.durationMs ?? 0,
			avgClassScore: week && week.scored > 0 ? Math.round(week.scoreSum / week.scored) : null,
		};
	});

	const monthKeys: string[] = [];
	for (const day of dayKeys) {
		const month = day.slice(0, 7);
		if (monthKeys[monthKeys.length - 1] !== month) monthKeys.push(month);
	}
	const months = monthKeys.map((month) => {
		const bucket = agg?.byMonth[month];

		return { month, lessons: bucket?.lessons ?? 0, durationMs: bucket?.durationMs ?? 0 };
	});

	return { days, weeks, months };
}
