import type { AgoraAdvancementSummary, AgoraOutcomeTally } from './agoraClassroom';
import type { TeacherConsoleMember } from './agoraClassroomCallables';
import type { AgoraTeacherLessonRow } from './agoraTeacherAggregate';
import type { AgoraPeriod, AgoraUsageSeries, LessonSeries } from './agoraTeacherUsage';
import type { AgoraSessionOutcome, AgoraSessionStatus, AgoraStage } from './agoraEnums';

/**
 * Wire contracts of `agoraSupervisorConsole` — every read a supervisor (or a
 * sys-admin looking at the same screens) makes, served server-side and
 * filtered through one `SupervisorScope`. The client never lists agora
 * collections itself: the rules keep the aggregate and usage collections
 * sys-admin-only, and a supervisor sees only what this callable projects.
 *
 * Field names are the wire format. Do not rename them.
 */

export type SupervisorConsoleRequest =
	| { view: 'overview'; schoolId?: string; days?: number }
	| { view: 'teacher'; schoolId: string; teacherId: string; days?: number }
	| { view: 'class'; classId: string }
	| { view: 'student'; memberId: string }
	| { view: 'system'; days?: number };

export interface SupervisorTeacherRow {
	uid: string;
	name: string;
	lessonsRun: number;
	classLessons: number;
	lastLessonAt: number;
	totalDurationMs: number;
	studentGameSlots: number;
	avgClassScore: number | null;
	/** Console time in the period */
	activeMs: number;
	classCount: number;
	lessonsByWeek: Array<{ weekStart: string; value: number }>;
	/** Console minutes per week in the period */
	minutesByWeek: Array<{ weekStart: string; value: number }>;
}

export interface SupervisorClassRow {
	classId: string;
	name: string;
	gradeLevel?: string;
	memberCount: number;
	teacherIds: string[];
	advancement: AgoraAdvancementSummary | null;
	/** AgoraClassAggregate JSON, or null before the first game */
	aggregate: unknown | null;
}

export interface SupervisorOverview {
	role: 'supervisor' | 'sysadmin';
	/** Every school the caller may pick — one for a supervisor, all for a sys-admin */
	schools: Array<{
		schoolId: string;
		name: string;
		city?: string;
		classCount: number;
		teacherCount: number;
		supervisorCount: number;
	}>;
	/** The selected school, or null when the caller supervises none */
	school: null | {
		schoolId: string;
		name: string;
		scope: 'all' | 'narrowed' | 'admin';
		teachers: SupervisorTeacherRow[];
		classes: SupervisorClassRow[];
		outcomes: AgoraOutcomeTally;
		/** All in-scope teachers' console time, summed per day */
		usage: AgoraUsageSeries;
		/** All in-scope teachers' lessons, summed */
		lessons: LessonSeries;
		period: AgoraPeriod;
		/** True when a cap (classes 200, teachers 100) cut the lists */
		truncated: boolean;
	};
}

/** A session as the supervisor sees it — projected, never the raw doc. */
export interface SupervisorSessionRow {
	sessionId: string;
	topicPackageId: string;
	teacherId: string;
	classId?: string;
	createdAt: number;
	status: AgoraSessionStatus;
	stage: AgoraStage;
	participantCount: number;
	startedAt: number;
	durationMs: number;
	playedAt: number;
	classScoreTotal?: number;
	convergenceScore?: number;
	outcome?: AgoraSessionOutcome;
}

export interface SupervisorTeacherDetail {
	teacher: { uid: string; name: string };
	/** AgoraTeacherAggregate JSON, or null before the first lesson */
	aggregate: unknown | null;
	usage: AgoraUsageSeries;
	lessons: LessonSeries;
	/** This teacher's lessons in this school, newest first */
	lessonRows: AgoraTeacherLessonRow[];
	classes: SupervisorClassRow[];
	period: AgoraPeriod;
}

export interface SupervisorClassDetail {
	classId: string;
	name: string;
	gradeLevel?: string;
	schoolId: string;
	schoolName: string;
	teachers: Array<{ uid: string; name: string }>;
	memberCount: number;
	/** Aliases only — no PIN hash, no uid history, no class code */
	members: TeacherConsoleMember[];
	/** memberId → AgoraStudentAggregate JSON */
	careers: Record<string, unknown>;
	/** AgoraClassAggregate JSON, or null before the first game */
	aggregate: unknown | null;
	sessions: SupervisorSessionRow[];
}

export interface SupervisorStudentDetail {
	memberId: string;
	alias: string;
	classId: string;
	className: string;
	/** The class's games played, for "this student played N of M" */
	classGames: number;
	joinedAt: number;
	lastActive: number;
	/** AgoraStudentAggregate JSON, or null before the first game */
	career: unknown | null;
}

export interface SupervisorSystemView {
	schools: Array<{
		schoolId: string;
		name: string;
		city?: string;
		status: 'active' | 'archived';
		classCount: number;
		teacherCount: number;
		supervisors: Array<{ uid: string; name: string }>;
		lastLessonAt: number;
	}>;
	/** The current day/month/year `agoraStats` docs (JSON), or null when unwritten */
	stats: { day: unknown | null; month: unknown | null; year: unknown | null };
	series: {
		gamesFinished: Array<{ day: string; value: number }>;
		studentsReached: Array<{ day: string; value: number }>;
		classesPlayed: Array<{ day: string; value: number }>;
		byOutcomeWeekly: Record<
			'success' | 'honestDisagreement' | 'collapse' | 'unscored',
			Array<{ weekStart: string; value: number }>
		>;
	};
	/** Every teacher's console time, summed per day */
	usage: AgoraUsageSeries;
	/** Distinct teachers with any console time in the period */
	teachersActive: number;
	period: AgoraPeriod;
}

export type SupervisorConsoleResponse =
	| SupervisorOverview
	| SupervisorTeacherDetail
	| SupervisorClassDetail
	| SupervisorStudentDetail
	| SupervisorSystemView;

/**
 * `agoraAdminBackfillTeacherAggregates` — sys-admin only. Folds games that
 * finished before teacher aggregates existed, one page per call; the caller
 * loops on `nextCursor` until it is absent.
 */
export interface BackfillTeacherAggregatesRequest {
	/** `createdAt` of the last session the previous page handled */
	cursor?: number;
	/** Sessions per page, ≤ 500, default 200 */
	limit?: number;
	/** Count what WOULD fold without writing */
	dryRun?: boolean;
}

export interface BackfillTeacherAggregatesResponse {
	/** Sessions read on this page */
	processed: number;
	/** Sessions folded (or, dry, that would have been) */
	folded: number;
	/** Civic, unfinished, or already stamped */
	skipped: number;
	/** Absent when the page was the last one */
	nextCursor?: number;
}
