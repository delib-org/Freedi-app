import { db } from '../db';
import {
	AGORA_TEACHER_USAGE,
	AgoraClass,
	AgoraClassAggregate,
	AgoraOutcomeTally,
	AgoraPeriod,
	AgoraTeacherAggregate,
	AgoraTeacherLessonRow,
	AgoraTeacherMonthBucket,
	AgoraTeacherUsageMonth,
	Collections,
	LessonSeries,
	SupervisorClassRow,
	SupervisorConsoleResponse,
	SupervisorScope,
	advancementSummary,
	emptyTeacherAggregate,
	mergeTeacherLesson,
	dayKeyOf,
	lessonSeries,
	monthKeyOf,
} from '@freedi/shared-types';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MIN_SERIES_DAYS = 7;
export const CLASSES_CAP = 200;
export const TEACHERS_CAP = 100;
/** Firestore's `in` clause takes at most this many values */
export const IN_CHUNK = 30;
export const USAGE_DOCS_CAP = 2000;
export const CLASS_AGGREGATES_CAP = 2000;
export const CACHE_TTL_MS = 60_000;
export const CACHE_ENTRIES_CAP = 200;

/** One `agoraStats` period doc, as `bumpAgoraStats` writes it (merge-set, so every field may be absent). */
export interface AgoraStatsDoc {
	periodType?: string;
	periodKey?: string;
	gamesFinished?: number;
	studentsReached?: number;
	classesPlayed?: number;
	byOutcome?: Partial<Record<keyof AgoraOutcomeTally, number>>;
}

// A 60-second per-instance memo for the two wide views. Keyed by caller AND
// arguments, so a narrowed supervisor never sees a colleague's wider answer.
export const cache = new Map<string, { expiresAt: number; value: SupervisorConsoleResponse }>();

export function cached<T extends SupervisorConsoleResponse>(
	key: string,
	build: () => Promise<T>,
): Promise<T> {
	const hit = cache.get(key);
	if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.value as T);

	return build().then((value) => {
		if (cache.size >= CACHE_ENTRIES_CAP) cache.clear();
		cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });

		return value;
	});
}

/** The UTC period `days` back from today, clamped to [7, 366]; 90 by default. */
export function periodFor(
	days: number | undefined,
	now: number,
): AgoraPeriod & { fromMonth: string } {
	const wanted =
		typeof days === 'number' && Number.isFinite(days)
			? Math.round(days)
			: AGORA_TEACHER_USAGE.DEFAULT_SERIES_DAYS;
	const clamped = Math.min(Math.max(wanted, MIN_SERIES_DAYS), AGORA_TEACHER_USAGE.MAX_SERIES_DAYS);
	const fromDay = dayKeyOf(now - (clamped - 1) * DAY_MS);

	return { fromDay, toDay: dayKeyOf(now), fromMonth: fromDay.slice(0, 7) };
}

/** Usage month docs for these teachers from `fromMonth` on, 30 uids per query. */
export async function usageMonthsFor(
	teacherIds: readonly string[],
	fromMonth: string,
): Promise<AgoraTeacherUsageMonth[]> {
	const chunks: string[][] = [];
	for (let index = 0; index < teacherIds.length; index += IN_CHUNK) {
		chunks.push(teacherIds.slice(index, index + IN_CHUNK));
	}
	const snaps = await Promise.all(
		chunks.map((chunk) =>
			db
				.collection(Collections.agoraTeacherUsage)
				.where('teacherId', 'in', chunk)
				.where('month', '>=', fromMonth)
				.get(),
		),
	);

	return snaps.flatMap((snap) => snap.docs.map((doc) => doc.data() as AgoraTeacherUsageMonth));
}

/**
 * A teacher's lessons in THIS school. Guest lessons (no school) are the
 * sys-admin's to see, never a school supervisor's.
 */
export function schoolLessonRows(
	agg: AgoraTeacherAggregate | undefined,
	schoolId: string,
): AgoraTeacherLessonRow[] {
	return (agg?.perLesson ?? []).filter((row) => row.schoolId === schoolId);
}

/**
 * A lesson series from a set of rows alone. The teacher doc's `byMonth` counts
 * every school, so a school-scoped series rebuilds its months from the rows
 * it was given — exact within the row cap, never over.
 */
export function seriesFromRows(
	rows: readonly AgoraTeacherLessonRow[],
	period: AgoraPeriod,
): LessonSeries {
	const byMonth: Record<string, AgoraTeacherMonthBucket> = {};
	for (const row of rows) {
		const month = monthKeyOf(row.playedAt);
		const bucket = byMonth[month] ?? { lessons: 0, durationMs: 0, studentGameSlots: 0 };
		byMonth[month] = {
			lessons: bucket.lessons + 1,
			durationMs: bucket.durationMs + row.durationMs,
			studentGameSlots: bucket.studentGameSlots + row.participantCount,
		};
	}

	return lessonSeries({ perLesson: [...rows], byMonth }, period);
}

/** A school report never returns another school's or a guest lesson's data. */
export function scopedAggregate(
	agg: AgoraTeacherAggregate | undefined,
	schoolId: string,
): AgoraTeacherAggregate | undefined {
	if (!agg) return undefined;

	return schoolLessonRows(agg, schoolId).reduce(
		(result, row) => mergeTeacherLesson(result, row, agg.lastUpdate),
		emptyTeacherAggregate(agg.teacherId),
	);
}

export function classRowOf(
	cls: AgoraClass,
	agg: AgoraClassAggregate | undefined,
): SupervisorClassRow {
	return {
		classId: cls.classId,
		name: cls.name,
		...(cls.gradeLevel ? { gradeLevel: cls.gradeLevel } : {}),
		memberCount: cls.memberCount,
		teacherIds: cls.teacherIds,
		advancement: agg ? advancementSummary(agg) : null,
		aggregate: agg ?? null,
	};
}

export function emptyOutcomes(): AgoraOutcomeTally {
	return { success: 0, honestDisagreement: 0, collapse: 0, unscored: 0 };
}

export async function classAggregatesFor(
	classes: readonly AgoraClass[],
): Promise<Map<string, AgoraClassAggregate>> {
	const aggregates = new Map<string, AgoraClassAggregate>();
	if (!classes.length) return aggregates;
	const snaps = await db.getAll(
		...classes.map((cls) => db.collection(Collections.agoraClassAggregates).doc(cls.classId)),
	);
	for (const snap of snaps) {
		const agg = snap.data() as AgoraClassAggregate | undefined;
		if (agg) aggregates.set(agg.classId, agg);
	}

	return aggregates;
}

export async function teacherAggregatesFor(
	teacherIds: readonly string[],
): Promise<Map<string, AgoraTeacherAggregate>> {
	const aggregates = new Map<string, AgoraTeacherAggregate>();
	if (!teacherIds.length) return aggregates;
	const snaps = await db.getAll(
		...teacherIds.map((uid) => db.collection(Collections.agoraTeacherAggregates).doc(uid)),
	);
	for (const snap of snaps) {
		const agg = snap.data() as AgoraTeacherAggregate | undefined;
		if (agg) aggregates.set(agg.teacherId, agg);
	}

	return aggregates;
}

export function scopeLabel(scope: SupervisorScope): 'all' | 'narrowed' | 'admin' {
	if (scope.kind === 'admin') return 'admin';

	return scope.kind === 'all' ? 'all' : 'narrowed';
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
