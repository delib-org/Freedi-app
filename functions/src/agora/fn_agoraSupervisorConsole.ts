import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	AGORA_TEACHER_USAGE,
	AgoraClass,
	AgoraClassAggregate,
	AgoraClassMember,
	AgoraOutcomeTally,
	AgoraPeriod,
	AgoraSchool,
	AgoraSession,
	AgoraStudentAggregate,
	AgoraTeacherAggregate,
	AgoraTeacherLessonRow,
	AgoraTeacherMonthBucket,
	AgoraTeacherUsageMonth,
	Collections,
	LessonSeries,
	SupervisorClassDetail,
	SupervisorClassRow,
	SupervisorConsoleRequest,
	SupervisorConsoleResponse,
	SupervisorOverview,
	SupervisorScope,
	SupervisorStudentDetail,
	SupervisorSystemView,
	SupervisorTeacherDetail,
	SupervisorTeacherRow,
	advancementSummary,
	bucketUsage,
	createAgoraClassMemberId,
	dayKeyOf,
	dayKeysBetween,
	functionConfig,
	isClassInScope,
	isTeacherInScope,
	lessonSeries,
	monthKeyOf,
	resolveSupervisorScope,
	schoolTeacherUids,
	weekStartOf,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { isSystemAdmin } from '../utils/httpAuth';
import { teacherDisplayNames } from './teacherLookup';
import { toSupervisorSessionRow, toTeacherMember } from './consoleShapes';
import { requireScope, supervisedSchools, supervisorScopeFor } from './supervisorScope';

/**
 * Every read the supervisor console makes, served server-side and filtered
 * through ONE `SupervisorScope` per request.
 *
 * The overview reads aggregate docs only — never rosters, careers or
 * sessions — so a school of forty teachers is a handful of round trips. The
 * drill-downs (teacher, class, student) read what the teacher console reads
 * for the same screen, projected: sessions become rows, members become
 * aliases. The system view is the sys-admin's alone.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_SERIES_DAYS = 7;
const CLASSES_CAP = 200;
const TEACHERS_CAP = 100;
/** Firestore's `in` clause takes at most this many values */
const IN_CHUNK = 30;
const USAGE_DOCS_CAP = 2000;
const CLASS_AGGREGATES_CAP = 2000;
const CACHE_TTL_MS = 60_000;
const CACHE_ENTRIES_CAP = 200;

/** One `agoraStats` period doc, as `bumpAgoraStats` writes it (merge-set, so every field may be absent). */
interface AgoraStatsDoc {
	periodType?: string;
	periodKey?: string;
	gamesFinished?: number;
	studentsReached?: number;
	classesPlayed?: number;
	byOutcome?: Partial<Record<keyof AgoraOutcomeTally, number>>;
}

// A 60-second per-instance memo for the two wide views. Keyed by caller AND
// arguments, so a narrowed supervisor never sees a colleague's wider answer.
const cache = new Map<string, { expiresAt: number; value: SupervisorConsoleResponse }>();

function cached<T extends SupervisorConsoleResponse>(
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
function periodFor(days: number | undefined, now: number): AgoraPeriod & { fromMonth: string } {
	const wanted =
		typeof days === 'number' && Number.isFinite(days)
			? Math.round(days)
			: AGORA_TEACHER_USAGE.DEFAULT_SERIES_DAYS;
	const clamped = Math.min(Math.max(wanted, MIN_SERIES_DAYS), AGORA_TEACHER_USAGE.MAX_SERIES_DAYS);
	const fromDay = dayKeyOf(now - (clamped - 1) * DAY_MS);

	return { fromDay, toDay: dayKeyOf(now), fromMonth: fromDay.slice(0, 7) };
}

/** Usage month docs for these teachers from `fromMonth` on, 30 uids per query. */
async function usageMonthsFor(
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
function schoolLessonRows(
	agg: AgoraTeacherAggregate | undefined,
	schoolId: string,
	includeGuest: boolean,
): AgoraTeacherLessonRow[] {
	return (agg?.perLesson ?? []).filter(
		(row) => row.schoolId === schoolId || (includeGuest && row.schoolId === undefined),
	);
}

/**
 * A lesson series from a set of rows alone. The teacher doc's `byMonth` counts
 * every school, so a school-scoped series rebuilds its months from the rows
 * it was given — exact within the row cap, never over.
 */
function seriesFromRows(rows: readonly AgoraTeacherLessonRow[], period: AgoraPeriod): LessonSeries {
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

function classRowOf(cls: AgoraClass, agg: AgoraClassAggregate | undefined): SupervisorClassRow {
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

function emptyOutcomes(): AgoraOutcomeTally {
	return { success: 0, honestDisagreement: 0, collapse: 0, unscored: 0 };
}

async function classAggregatesFor(
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

async function teacherAggregatesFor(
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

function scopeLabel(scope: SupervisorScope): 'all' | 'narrowed' | 'admin' {
	if (scope.kind === 'admin') return 'admin';

	return scope.kind === 'all' ? 'all' : 'narrowed';
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

async function overviewView(
	uid: string,
	data: Extract<SupervisorConsoleRequest, { view: 'overview' }>,
): Promise<SupervisorOverview> {
	const isAdmin = await isSystemAdmin(uid);
	const schools = await supervisedSchools(uid, isAdmin);
	if (!isAdmin && !schools.length) {
		throw new HttpsError('permission-denied', 'You do not supervise any school');
	}
	const selected = data.schoolId
		? schools.find((school) => school.schoolId === data.schoolId)
		: schools[0];
	if (data.schoolId && !selected) {
		throw new HttpsError(
			isAdmin ? 'not-found' : 'permission-denied',
			'You do not supervise this school',
		);
	}

	const schoolRows = schools.map((school) => ({
		schoolId: school.schoolId,
		name: school.name,
		...(school.city ? { city: school.city } : {}),
		classCount: school.classCount,
		teacherCount: (school.teacherIds ?? []).length,
		supervisorCount: (school.supervisorIds ?? []).length,
	}));
	if (!selected) {
		return { role: isAdmin ? 'sysadmin' : 'supervisor', schools: schoolRows, school: null };
	}

	const scope = requireScope(resolveSupervisorScope(selected, uid, isAdmin));
	const now = Date.now();
	const { fromMonth, ...period } = periodFor(data.days, now);

	const classSnaps = await db
		.collection(Collections.agoraClasses)
		.where('schoolId', '==', selected.schoolId)
		.limit(CLASSES_CAP)
		.get();
	const schoolClasses = classSnaps.docs
		.map((snap) => snap.data() as AgoraClass)
		.filter((cls) => cls.status === 'active');
	const classes = schoolClasses
		.filter((cls) => isClassInScope(scope, cls))
		.sort((a, b) => a.name.localeCompare(b.name));
	const allTeacherUids = schoolTeacherUids(selected, schoolClasses).filter((teacherId) =>
		isTeacherInScope(scope, teacherId),
	);
	const teacherUids = allTeacherUids.slice(0, TEACHERS_CAP);
	const truncated = classSnaps.size >= CLASSES_CAP || allTeacherUids.length > TEACHERS_CAP;

	const [classAggs, teacherAggs, names, usageMonths] = await Promise.all([
		classAggregatesFor(classes),
		teacherAggregatesFor(teacherUids),
		teacherDisplayNames(teacherUids),
		usageMonthsFor(teacherUids, fromMonth),
	]);

	const teachers: SupervisorTeacherRow[] = teacherUids.map((teacherId, index) => {
		const agg = teacherAggs.get(teacherId);
		const usage = bucketUsage(
			usageMonths.filter((month) => month.teacherId === teacherId),
			period,
		);
		const lessons = seriesFromRows(schoolLessonRows(agg, selected.schoolId, isAdmin), period);

		return {
			uid: teacherId,
			name: names[index].name,
			lessonsRun: agg?.lessonsRun ?? 0,
			classLessons: agg?.classLessons ?? 0,
			lastLessonAt: agg?.lastLessonAt ?? 0,
			totalDurationMs: agg?.totalDurationMs ?? 0,
			studentGameSlots: agg?.studentGameSlots ?? 0,
			avgClassScore: agg?.avgClassScore ?? null,
			activeMs: usage.days.reduce((sum, day) => sum + day.activeMs, 0),
			classCount: classes.filter((cls) => cls.teacherIds.includes(teacherId)).length,
			lessonsByWeek: lessons.weeks.map((week) => ({
				weekStart: week.weekStart,
				value: week.lessons,
			})),
			minutesByWeek: usage.weeks.map((week) => ({
				weekStart: week.weekStart,
				value: Math.round(week.activeMs / 60_000),
			})),
		};
	});

	const outcomes = emptyOutcomes();
	for (const cls of classes) {
		const agg = classAggs.get(cls.classId);
		if (!agg) continue;
		outcomes.success += agg.outcomes.success;
		outcomes.honestDisagreement += agg.outcomes.honestDisagreement;
		outcomes.collapse += agg.outcomes.collapse;
		outcomes.unscored += agg.outcomes.unscored;
	}
	const schoolRowsOfLessons = teacherUids.flatMap((teacherId) =>
		schoolLessonRows(teacherAggs.get(teacherId), selected.schoolId, isAdmin),
	);

	return {
		role: isAdmin ? 'sysadmin' : 'supervisor',
		schools: schoolRows,
		school: {
			schoolId: selected.schoolId,
			name: selected.name,
			scope: scopeLabel(scope),
			teachers,
			classes: classes.map((cls) => classRowOf(cls, classAggs.get(cls.classId))),
			outcomes,
			usage: bucketUsage(usageMonths, period),
			lessons: seriesFromRows(schoolRowsOfLessons, period),
			period,
			truncated,
		},
	};
}

async function teacherView(
	uid: string,
	data: Extract<SupervisorConsoleRequest, { view: 'teacher' }>,
): Promise<SupervisorTeacherDetail> {
	if (!data.schoolId || typeof data.schoolId !== 'string') {
		throw new HttpsError('invalid-argument', 'schoolId is required');
	}
	if (!data.teacherId || typeof data.teacherId !== 'string') {
		throw new HttpsError('invalid-argument', 'teacherId is required');
	}
	const { scope: found, school, isAdmin } = await supervisorScopeFor(uid, data.schoolId);
	const scope = requireScope(found);
	if (!school) {
		throw new HttpsError('not-found', 'School not found');
	}
	if (!isTeacherInScope(scope, data.teacherId)) {
		throw new HttpsError('permission-denied', 'This teacher is outside your scope');
	}
	const now = Date.now();
	const { fromMonth, ...period } = periodFor(data.days, now);

	const [aggSnap, classSnaps, names, usageMonths] = await Promise.all([
		db.collection(Collections.agoraTeacherAggregates).doc(data.teacherId).get(),
		db
			.collection(Collections.agoraClasses)
			.where(`teacherMap.${data.teacherId}`, '==', true)
			.where('schoolId', '==', data.schoolId)
			.get(),
		teacherDisplayNames([data.teacherId]),
		usageMonthsFor([data.teacherId], fromMonth),
	]);
	const agg = aggSnap.data() as AgoraTeacherAggregate | undefined;
	const classes = classSnaps.docs
		.map((snap) => snap.data() as AgoraClass)
		.filter((cls) => cls.status === 'active' && isClassInScope(scope, cls))
		.sort((a, b) => a.name.localeCompare(b.name));
	const classAggs = await classAggregatesFor(classes);
	const rows = schoolLessonRows(agg, data.schoolId, isAdmin);

	return {
		teacher: names[0],
		aggregate: agg ?? null,
		usage: bucketUsage(usageMonths, period),
		lessons: seriesFromRows(rows, period),
		lessonRows: [...rows].reverse(),
		classes: classes.map((cls) => classRowOf(cls, classAggs.get(cls.classId))),
		period,
	};
}

async function classView(
	uid: string,
	data: Extract<SupervisorConsoleRequest, { view: 'class' }>,
): Promise<SupervisorClassDetail> {
	if (!data.classId || typeof data.classId !== 'string') {
		throw new HttpsError('invalid-argument', 'classId is required');
	}
	const classSnap = await db.collection(Collections.agoraClasses).doc(data.classId).get();
	const cls = classSnap.data() as AgoraClass | undefined;
	if (!cls) {
		throw new HttpsError('not-found', 'Class not found');
	}
	const { scope: found, school } = await supervisorScopeFor(uid, cls.schoolId);
	const scope = requireScope(found);
	if (!isClassInScope(scope, cls)) {
		throw new HttpsError('permission-denied', 'This class is outside your scope');
	}

	const [teachers, memberSnaps, careerSnaps, aggregateSnap, sessionSnaps] = await Promise.all([
		teacherDisplayNames(cls.teacherIds),
		db
			.collection(Collections.agoraClassMembers)
			.where('classId', '==', cls.classId)
			.where('status', '==', 'active')
			.get(),
		db.collection(Collections.agoraStudentAggregates).where('classId', '==', cls.classId).get(),
		db.collection(Collections.agoraClassAggregates).doc(cls.classId).get(),
		db
			.collection(Collections.agoraSessions)
			.where('classId', '==', cls.classId)
			.orderBy('createdAt', 'desc')
			.limit(50)
			.get(),
	]);
	const careers: Record<string, AgoraStudentAggregate> = {};
	for (const snap of careerSnaps.docs) {
		const career = snap.data() as AgoraStudentAggregate;
		careers[career.memberId] = career;
	}

	return {
		classId: cls.classId,
		name: cls.name,
		...(cls.gradeLevel ? { gradeLevel: cls.gradeLevel } : {}),
		schoolId: cls.schoolId,
		schoolName: school?.name ?? '',
		teachers,
		memberCount: cls.memberCount,
		members: memberSnaps.docs
			.map((snap) => toTeacherMember(snap.data() as AgoraClassMember))
			.sort((a, b) => a.alias.localeCompare(b.alias)),
		careers,
		aggregate: (aggregateSnap.data() as AgoraClassAggregate | undefined) ?? null,
		sessions: sessionSnaps.docs.map((snap) => toSupervisorSessionRow(snap.data() as AgoraSession)),
	};
}

async function studentView(
	uid: string,
	data: Extract<SupervisorConsoleRequest, { view: 'student' }>,
): Promise<SupervisorStudentDetail> {
	if (!data.memberId || typeof data.memberId !== 'string') {
		throw new HttpsError('invalid-argument', 'memberId is required');
	}
	const careerSnap = await db
		.collection(Collections.agoraStudentAggregates)
		.doc(data.memberId)
		.get();
	const career = careerSnap.data() as AgoraStudentAggregate | undefined;
	if (!career) {
		throw new HttpsError('not-found', 'Student not found');
	}
	const classSnap = await db.collection(Collections.agoraClasses).doc(career.classId).get();
	const cls = classSnap.data() as AgoraClass | undefined;
	if (!cls) {
		throw new HttpsError('not-found', 'Class not found');
	}
	const { scope: found } = await supervisorScopeFor(uid, cls.schoolId);
	const scope = requireScope(found);
	if (!isClassInScope(scope, cls)) {
		throw new HttpsError('permission-denied', 'This student is outside your scope');
	}
	const [memberSnap, classAggSnap] = await Promise.all([
		db
			.collection(Collections.agoraClassMembers)
			.doc(createAgoraClassMemberId(cls.classId, data.memberId))
			.get(),
		db.collection(Collections.agoraClassAggregates).doc(cls.classId).get(),
	]);
	const member = memberSnap.data() as AgoraClassMember | undefined;
	if (!member) {
		throw new HttpsError('not-found', 'Student not found');
	}
	const classAgg = classAggSnap.data() as AgoraClassAggregate | undefined;

	return {
		memberId: member.memberId,
		alias: member.alias,
		classId: cls.classId,
		className: cls.name,
		classGames: classAgg?.gamesPlayed ?? 0,
		joinedAt: member.joinedAt,
		lastActive: member.lastActive,
		career,
	};
}

async function systemView(
	uid: string,
	data: Extract<SupervisorConsoleRequest, { view: 'system' }>,
): Promise<SupervisorSystemView> {
	if (!(await isSystemAdmin(uid))) {
		throw new HttpsError('permission-denied', 'System admin required');
	}
	const now = Date.now();
	const { fromMonth, ...period } = periodFor(data.days, now);
	const todayKeys = { day: dayKeyOf(now), month: monthKeyOf(now), year: dayKeyOf(now).slice(0, 4) };
	const statsRef = db.collection(Collections.agoraStats);

	const [schoolSnaps, statsSnaps, daySnaps, usageSnaps, classAggSnaps] = await Promise.all([
		db.collection(Collections.agoraSchools).get(),
		db.getAll(
			statsRef.doc(todayKeys.day),
			statsRef.doc(todayKeys.month),
			statsRef.doc(todayKeys.year),
		),
		statsRef.where('periodType', '==', 'day').where('periodKey', '>=', period.fromDay).get(),
		db
			.collection(Collections.agoraTeacherUsage)
			.where('month', '>=', fromMonth)
			.limit(USAGE_DOCS_CAP)
			.get(),
		db.collection(Collections.agoraClassAggregates).limit(CLASS_AGGREGATES_CAP).get(),
	]);

	const schools = schoolSnaps.docs
		.map((snap) => snap.data() as AgoraSchool)
		.sort((a, b) => a.name.localeCompare(b.name));
	const supervisorUids = [...new Set(schools.flatMap((school) => school.supervisorIds ?? []))];
	const supervisorNames = new Map(
		(await teacherDisplayNames(supervisorUids)).map((row) => [row.uid, row]),
	);
	const lastLessonBySchool = new Map<string, number>();
	for (const snap of classAggSnaps.docs) {
		const agg = snap.data() as AgoraClassAggregate;
		lastLessonBySchool.set(
			agg.schoolId,
			Math.max(lastLessonBySchool.get(agg.schoolId) ?? 0, agg.lastPlayedAt),
		);
	}

	// Day docs → daily series over the period (zero-filled) and outcome tallies
	// by Sunday week.
	const dayDocs = new Map<string, AgoraStatsDoc>();
	for (const snap of daySnaps.docs) {
		const doc = snap.data() as AgoraStatsDoc;
		if (doc.periodKey) dayDocs.set(doc.periodKey, doc);
	}
	const dayKeys = dayKeysBetween(period);
	const daily = (pick: (doc: AgoraStatsDoc) => number | undefined) =>
		dayKeys.map((day) => ({ day, value: pick(dayDocs.get(day) ?? {}) ?? 0 }));
	const weekStarts: string[] = [];
	for (const day of dayKeys) {
		const weekStart = weekStartOf(day);
		if (weekStarts[weekStarts.length - 1] !== weekStart) weekStarts.push(weekStart);
	}
	const weekly = (outcome: keyof AgoraOutcomeTally) => {
		const totals = new Map<string, number>();
		for (const day of dayKeys) {
			const weekStart = weekStartOf(day);
			const value = dayDocs.get(day)?.byOutcome?.[outcome] ?? 0;
			totals.set(weekStart, (totals.get(weekStart) ?? 0) + value);
		}

		return weekStarts.map((weekStart) => ({ weekStart, value: totals.get(weekStart) ?? 0 }));
	};

	const usageMonths = usageSnaps.docs.map((snap) => snap.data() as AgoraTeacherUsageMonth);
	const usage = bucketUsage(usageMonths, period);
	const inPeriod = new Set(dayKeys);
	const activeTeachers = new Set<string>();
	for (const month of usageMonths) {
		for (const [day, slice] of Object.entries(month.days)) {
			if (inPeriod.has(day) && slice.activeMs > 0) activeTeachers.add(month.teacherId);
		}
	}

	return {
		schools: schools.map((school) => ({
			schoolId: school.schoolId,
			name: school.name,
			...(school.city ? { city: school.city } : {}),
			status: school.status,
			classCount: school.classCount,
			teacherCount: (school.teacherIds ?? []).length,
			supervisors: (school.supervisorIds ?? []).map(
				(supervisorUid) =>
					supervisorNames.get(supervisorUid) ?? {
						uid: supervisorUid,
						name: supervisorUid.slice(0, 6),
					},
			),
			lastLessonAt: lastLessonBySchool.get(school.schoolId) ?? 0,
		})),
		stats: {
			day: statsSnaps[0].data() ?? null,
			month: statsSnaps[1].data() ?? null,
			year: statsSnaps[2].data() ?? null,
		},
		series: {
			gamesFinished: daily((doc) => doc.gamesFinished),
			studentsReached: daily((doc) => doc.studentsReached),
			classesPlayed: daily((doc) => doc.classesPlayed),
			byOutcomeWeekly: {
				success: weekly('success'),
				honestDisagreement: weekly('honestDisagreement'),
				collapse: weekly('collapse'),
				unscored: weekly('unscored'),
			},
		},
		usage,
		teachersActive: activeTeachers.size,
		period,
	};
}

export const agoraSupervisorConsole = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<SupervisorConsoleRequest>,
	): Promise<SupervisorConsoleResponse> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		if (request.auth?.token.firebase.sign_in_provider === 'anonymous') {
			throw new HttpsError('permission-denied', 'Supervisors must sign in with a full account');
		}

		const data = request.data ?? ({} as SupervisorConsoleRequest);

		try {
			switch (data.view) {
				case 'overview':
					return await cached(`${uid}|overview|${data.schoolId ?? ''}|${data.days ?? ''}`, () =>
						overviewView(uid, data),
					);
				case 'teacher':
					return await teacherView(uid, data);
				case 'class':
					return await classView(uid, data);
				case 'student':
					return await studentView(uid, data);
				case 'system':
					return await cached(`${uid}|system|${data.days ?? ''}`, () => systemView(uid, data));
				default:
					throw new HttpsError('invalid-argument', 'Unknown view');
			}
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.supervisorConsole',
				userId: uid,
				metadata: { view: data.view },
			});
			throw new HttpsError('internal', 'Failed to load supervision data');
		}
	},
);
