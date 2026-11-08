import type { AgoraClassAggregate, AgoraOutcomeTally, AgoraStudentAggregate } from '@freedi/shared-types';

// ---------------------------------------------------------------------------
// Structural inputs for series the aggregate docs do not carry yet. They are
// deliberately small so any caller (a callable's response, a test fixture)
// can satisfy them without importing the server's own types.
// ---------------------------------------------------------------------------

/** One day of a teacher's activity. `bySurface` splits `activeMs` by app surface. */
export interface UsageDayPoint {
	/** `YYYY-MM-DD` */
	day: string;
	activeMs: number;
	bySurface?: Record<string, number>;
}

/** One week bucket, keyed by its first day (`YYYY-MM-DD`). */
export interface WeekPoint {
	weekStart: string;
	value: number;
}

/** A week bucket whose value may be unknown (e.g. no scored lesson that week). */
export interface NullableWeekPoint {
	weekStart: string;
	value: number | null;
}

/** One day bucket (`YYYY-MM-DD`). */
export interface DayPoint {
	day: string;
	value: number;
}

/** The subset of a lesson row every dashboard needs. */
export interface LessonRowLike {
	playedAt: number;
	durationMs: number;
	participantCount: number;
	classScoreTotal?: number;
	outcome?: string;
}

export interface ClassIndicatorContext {
	aggregate: AgoraClassAggregate | null;
	memberCount: number;
	members: Array<{ memberId: string; alias: string }>;
	/** Student careers by memberId (missing = never played). */
	careers: Record<string, AgoraStudentAggregate>;
}

export interface StudentIndicatorContext {
	career: AgoraStudentAggregate | null;
	/** Games the student's class has played — the attendance denominator. */
	classGames: number;
}

export interface TeacherIndicatorContext {
	lessonsRun: number;
	classLessons: number;
	totalDurationMs: number;
	avgClassScore: number | null;
	classCount: number;
	usageDays: UsageDayPoint[];
	/** `value` is active milliseconds for that week. */
	usageWeeks: WeekPoint[];
	lessonsByWeek: WeekPoint[];
	scoreByWeek: NullableWeekPoint[];
	granularity: 'day' | 'week';
}

export interface SchoolIndicatorContext {
	teacherCount: number;
	classCount: number;
	lessonsInPeriod: number;
	studentGameSlots: number;
	outcomes: AgoraOutcomeTally;
	classes: Array<{ label: string; avgClassScore: number | null }>;
	lessonsByWeek: WeekPoint[];
	minutesByWeek: WeekPoint[];
}

export type OutcomeKey = 'success' | 'honestDisagreement' | 'collapse' | 'unscored';

export interface SystemIndicatorContext {
	totals: { gamesFinished: number; studentsReached: number; classesPlayed: number };
	gamesFinishedByDay: DayPoint[];
	studentsReachedByDay: DayPoint[];
	classesPlayedByDay: DayPoint[];
	byOutcomeWeekly: Record<OutcomeKey, WeekPoint[]>;
	teachersActive: number;
}

export interface IndicatorContextMap {
	class: ClassIndicatorContext;
	student: StudentIndicatorContext;
	teacher: TeacherIndicatorContext;
	school: SchoolIndicatorContext;
	system: SystemIndicatorContext;
}
