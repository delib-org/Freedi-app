import {
	object,
	string,
	number,
	optional,
	nullable,
	array,
	record,
	enum_,
	InferOutput,
} from 'valibot';
import { AgoraSessionOutcome, AgoraSessionStatus } from './agoraEnums';
import { AgoraOutcomeTallySchema } from './agoraClassroom';
import type { AgoraSession } from './agoraSession';

/**
 * A teacher's history across lessons — server-materialized, one doc per
 * teacher uid, the counterpart of the class aggregate for the SUPERVISOR's
 * question: "how much does this teacher use Agora, and how are the lessons
 * going?"
 *
 * Folded by the same finished-session transaction that advances the class
 * and career aggregates, for every non-civic game including guest games
 * (no class) — a teacher who runs Agora without a roster still teaches.
 */

export const AGORA_TEACHER_AGGREGATE = {
	/** Per-lesson rows kept on the doc, newest last */
	LESSON_ROWS_CAP: 100,
	/** Distinct classes remembered on `classesTaught` */
	CLASS_IDS_CAP: 200,
	/** Newest months kept in `byMonth` */
	MONTH_BUCKETS_CAP: 36,
	/** A lesson never counts for more than a day, whatever the stamps say */
	MAX_LESSON_MS: 24 * 60 * 60 * 1000,
} as const;

/** One finished lesson as it lands on the teacher's doc. */
export const AgoraTeacherLessonRowSchema = object({
	sessionId: string(),
	topicPackageId: string(),
	/** Absent on guest games */
	classId: optional(string()),
	schoolId: optional(string()),
	/** When the first stage opened (see `deriveLessonSpan`) */
	startedAt: number(),
	/** The moment the game was scored, or ended */
	playedAt: number(),
	/** startedAt → last signal, capped — the lesson's length */
	durationMs: number(),
	/** Students (AI raters excluded) who took part */
	participantCount: number(),
	classScoreTotal: optional(number()),
	convergenceScore: optional(number()),
	outcome: optional(enum_(AgoraSessionOutcome)),
});

export type AgoraTeacherLessonRow = InferOutput<typeof AgoraTeacherLessonRowSchema>;

/** Totals for one calendar month (UTC) — the "lessons per month" chart's rows. */
export const AgoraTeacherMonthBucketSchema = object({
	lessons: number(),
	durationMs: number(),
	studentGameSlots: number(),
});

export type AgoraTeacherMonthBucket = InferOutput<typeof AgoraTeacherMonthBucketSchema>;

/** Doc id: `teacherId` (the teacher's uid). */
export const AgoraTeacherAggregateSchema = object({
	teacherId: string(),
	/** Every finished lesson, guest games included */
	lessonsRun: number(),
	/** The subset that were class games */
	classLessons: number(),
	/** Distinct classIds seen, oldest first, capped */
	classesTaught: array(string()),
	/** Distinct schoolIds seen, oldest first */
	schoolIds: array(string()),
	/** Σ participantCount over lessons — the reach number */
	studentGameSlots: number(),
	totalDurationMs: number(),
	/** Lessons that carried a class score — the divisor behind `avgClassScore` */
	scoredGames: number(),
	/** Mean class score of the SCORED lessons; null before the first one */
	avgClassScore: nullable(number()),
	outcomes: AgoraOutcomeTallySchema,
	/** 'YYYY-MM' → totals, newest MONTH_BUCKETS_CAP kept */
	byMonth: record(string(), AgoraTeacherMonthBucketSchema),
	lastLessonAt: number(),
	/** Newest last, capped at LESSON_ROWS_CAP */
	perLesson: array(AgoraTeacherLessonRowSchema),
	lastUpdate: number(),
});

export type AgoraTeacherAggregate = InferOutput<typeof AgoraTeacherAggregateSchema>;

// ---------------------------------------------------------------------------
// UTC period keys — the same shape `periodKeysFor` in functions/aggregates.ts
// writes on `agoraStats`, so a teacher's month and the system's month agree.
// ---------------------------------------------------------------------------

/** 'YYYY-MM' in UTC */
export function monthKeyOf(ms: number): string {
	const date = new Date(ms);
	const yyyy = date.getUTCFullYear().toString();
	const mm = String(date.getUTCMonth() + 1).padStart(2, '0');

	return `${yyyy}-${mm}`;
}

/** 'YYYY-MM-DD' in UTC */
export function dayKeyOf(ms: number): string {
	const date = new Date(ms);
	const dd = String(date.getUTCDate()).padStart(2, '0');

	return `${monthKeyOf(ms)}-${dd}`;
}

export function emptyTeacherAggregate(teacherId: string): AgoraTeacherAggregate {
	return {
		teacherId,
		lessonsRun: 0,
		classLessons: 0,
		classesTaught: [],
		schoolIds: [],
		studentGameSlots: 0,
		totalDurationMs: 0,
		scoredGames: 0,
		avgClassScore: null,
		outcomes: { success: 0, honestDisagreement: 0, collapse: 0, unscored: 0 },
		byMonth: {},
		lastLessonAt: 0,
		perLesson: [],
		lastUpdate: 0,
	};
}

/** Keep the newest `cap` month keys ('YYYY-MM' sorts as time). */
function trimMonths(
	byMonth: Record<string, AgoraTeacherMonthBucket>,
	cap: number,
): Record<string, AgoraTeacherMonthBucket> {
	const keys = Object.keys(byMonth).sort();
	if (keys.length <= cap) return byMonth;
	const kept: Record<string, AgoraTeacherMonthBucket> = {};
	for (const key of keys.slice(-cap)) kept[key] = byMonth[key];

	return kept;
}

/**
 * Fold one finished lesson into the teacher's doc. Idempotence is the
 * caller's job (the session-level `teacherAggregatedAt` guard) — but a row
 * with a sessionId already present is refused here too, as a second fence.
 */
export function mergeTeacherLesson(
	agg: AgoraTeacherAggregate,
	row: AgoraTeacherLessonRow,
	now: number,
): AgoraTeacherAggregate {
	if (agg.perLesson.some((lesson) => lesson.sessionId === row.sessionId)) return agg;

	const perLesson = [...agg.perLesson, row].slice(-AGORA_TEACHER_AGGREGATE.LESSON_ROWS_CAP);
	const outcomes = { ...agg.outcomes };
	if (row.outcome !== undefined) outcomes[row.outcome] += 1;
	else outcomes.unscored += 1;

	// avgClassScore averages only the scored lessons; the previous average is
	// reconstructed from its own explicit count so a capped perLesson array
	// never skews it.
	let scoredGames = agg.scoredGames;
	let avgClassScore = agg.avgClassScore;
	if (row.classScoreTotal !== undefined) {
		const prevSum = (agg.avgClassScore ?? 0) * scoredGames;
		scoredGames += 1;
		avgClassScore = Math.round((prevSum + row.classScoreTotal) / scoredGames);
	}

	const classesTaught =
		row.classId !== undefined && !agg.classesTaught.includes(row.classId)
			? [...agg.classesTaught, row.classId].slice(-AGORA_TEACHER_AGGREGATE.CLASS_IDS_CAP)
			: agg.classesTaught;
	const schoolIds =
		row.schoolId !== undefined && !agg.schoolIds.includes(row.schoolId)
			? [...agg.schoolIds, row.schoolId]
			: agg.schoolIds;

	const monthKey = monthKeyOf(row.playedAt);
	const bucket = agg.byMonth[monthKey] ?? { lessons: 0, durationMs: 0, studentGameSlots: 0 };
	const byMonth = trimMonths(
		{
			...agg.byMonth,
			[monthKey]: {
				lessons: bucket.lessons + 1,
				durationMs: bucket.durationMs + row.durationMs,
				studentGameSlots: bucket.studentGameSlots + row.participantCount,
			},
		},
		AGORA_TEACHER_AGGREGATE.MONTH_BUCKETS_CAP,
	);

	return {
		...agg,
		lessonsRun: agg.lessonsRun + 1,
		classLessons: agg.classLessons + (row.classId !== undefined ? 1 : 0),
		classesTaught,
		schoolIds,
		studentGameSlots: agg.studentGameSlots + row.participantCount,
		totalDurationMs: agg.totalDurationMs + row.durationMs,
		scoredGames,
		avgClassScore,
		outcomes,
		byMonth,
		lastLessonAt: Math.max(agg.lastLessonAt, row.playedAt),
		perLesson,
		lastUpdate: now,
	};
}

export interface AgoraLessonSpan {
	startedAt: number;
	endedAt: number;
	durationMs: number;
}

/** The session fields a lesson's span is read from. */
export type LessonSpanSession = Pick<
	AgoraSession,
	| 'createdAt'
	| 'lastUpdate'
	| 'status'
	| 'stageState'
	| 'classScore'
	| 'agreement'
	| 'convergence'
	| 'lessonEndsAt'
>;

/**
 * How long a lesson ran, from the stamps the game itself left behind.
 *
 * Start is the first stage the teacher opened (`stageState[*].openedAt`),
 * falling back to creation — a session opened at breakfast and started in
 * class begins when the class did. End is the latest signal of play: any
 * stage opening, any stage outcome, the class score, agreement or
 * convergence being computed; a session the sweep ended with none of those
 * ends at its `lastUpdate`. Both a `lessonEndsAt` the teacher set and the
 * 24-hour cap bound the end, so a stamp written a day later cannot turn a
 * lesson into a night. `aggregatedAt` is never a signal — it says when the
 * trigger ran, not when anyone played.
 */
export function deriveLessonSpan(session: LessonSpanSession): AgoraLessonSpan {
	const openings: number[] = [];
	const signals: number[] = [];
	for (const item of Object.values(session.stageState ?? {})) {
		if (typeof item.openedAt === 'number') openings.push(item.openedAt);
		if (typeof item.outcome?.computedAt === 'number') signals.push(item.outcome.computedAt);
	}
	const startedAt = openings.length ? Math.min(...openings) : session.createdAt;

	signals.push(...openings);
	if (session.classScore?.computedAt !== undefined) signals.push(session.classScore.computedAt);
	if (session.agreement?.computedAt !== undefined) signals.push(session.agreement.computedAt);
	if (session.convergence?.computedAt !== undefined) {
		signals.push(session.convergence.computedAt);
	}

	let endedAt: number;
	if (signals.length) endedAt = Math.max(...signals);
	else if (session.status === AgoraSessionStatus.ended) endedAt = session.lastUpdate;
	else endedAt = startedAt;

	if (session.lessonEndsAt !== undefined) endedAt = Math.min(endedAt, session.lessonEndsAt);
	endedAt = Math.min(endedAt, startedAt + AGORA_TEACHER_AGGREGATE.MAX_LESSON_MS);

	return { startedAt, endedAt, durationMs: Math.max(0, endedAt - startedAt) };
}

/** The session fields a lesson row is built from. */
export type LessonRowSession = LessonSpanSession &
	Pick<AgoraSession, 'sessionId' | 'topicPackageId' | 'classId' | 'schoolId'>;

/** The row `mergeTeacherLesson` takes, built from a finished session. */
export function teacherLessonRowFrom(
	session: LessonRowSession,
	studentCount: number,
): AgoraTeacherLessonRow {
	const span = deriveLessonSpan(session);
	const playedAt = session.classScore?.computedAt ?? session.agreement?.computedAt ?? span.endedAt;
	const convergenceScore = session.convergence?.score;

	return {
		sessionId: session.sessionId,
		topicPackageId: session.topicPackageId,
		...(session.classId ? { classId: session.classId } : {}),
		...(session.schoolId ? { schoolId: session.schoolId } : {}),
		startedAt: span.startedAt,
		playedAt,
		durationMs: span.durationMs,
		participantCount: studentCount,
		...(session.classScore ? { classScoreTotal: session.classScore.total } : {}),
		...(convergenceScore !== null && convergenceScore !== undefined ? { convergenceScore } : {}),
		...(session.classScore?.outcome ? { outcome: session.classScore.outcome } : {}),
	};
}
