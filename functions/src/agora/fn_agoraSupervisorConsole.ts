import { systemView } from './supervisorSystem';
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	AgoraClass,
	AgoraClassAggregate,
	AgoraClassMember,
	AgoraSession,
	AgoraStudentAggregate,
	AgoraTeacherAggregate,
	Collections,
	SupervisorClassDetail,
	SupervisorConsoleRequest,
	SupervisorConsoleResponse,
	SupervisorOverview,
	SupervisorStudentDetail,
	SupervisorTeacherDetail,
	SupervisorTeacherRow,
	bucketUsage,
	functionConfig,
	isClassInScope,
	isTeacherInScope,
	resolveSupervisorScope,
	schoolTeacherUids,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { isSystemAdmin } from '../utils/httpAuth';
import { teacherDisplayNames } from './teacherLookup';
import { toSupervisorSessionRow, toTeacherMember } from './consoleShapes';
import { requireScope, supervisedSchools, supervisorScopeFor } from './supervisorScope';

import {
	CLASSES_CAP,
	TEACHERS_CAP,
	cached,
	periodFor,
	usageMonthsFor,
	schoolLessonRows,
	seriesFromRows,
	scopedAggregate,
	classRowOf,
	emptyOutcomes,
	classAggregatesFor,
	teacherAggregatesFor,
	scopeLabel,
} from './supervisorData';

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
	let truncated = classSnaps.size >= CLASSES_CAP || allTeacherUids.length > TEACHERS_CAP;

	const [classAggs, teacherAggs, names, usageMonths] = await Promise.all([
		classAggregatesFor(classes),
		teacherAggregatesFor(teacherUids),
		teacherDisplayNames(teacherUids),
		usageMonthsFor(teacherUids, fromMonth),
	]);

	truncated ||= [...teacherAggs.values()].some((agg) => agg.lessonsRun > agg.perLesson.length);

	const teachers: SupervisorTeacherRow[] = teacherUids.map((teacherId, index) => {
		const source = teacherAggs.get(teacherId);
		const agg = scopedAggregate(source, selected.schoolId);
		const usage = bucketUsage(
			usageMonths.filter((month) => month.teacherId === teacherId),
			period,
		);
		const lessons = seriesFromRows(schoolLessonRows(agg, selected.schoolId), period);

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
		schoolLessonRows(teacherAggs.get(teacherId), selected.schoolId),
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
	const { scope: found, school } = await supervisorScopeFor(uid, data.schoolId);
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
	if (!schoolTeacherUids(school, classes).includes(data.teacherId)) {
		throw new HttpsError('permission-denied', 'This teacher is outside your scope');
	}
	const rows = schoolLessonRows(agg, data.schoolId);

	return {
		teacher: names[0],
		aggregate: scopedAggregate(agg, data.schoolId) ?? null,
		truncated: !!agg && agg.lessonsRun > agg.perLesson.length,
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

	// Under a narrowed scope the class is shared with co-teachers the
	// supervisor does not watch: the class itself (roster, careers, its
	// aggregate) is visible, but only the watched teachers' names and lessons.
	const watchedTeacherIds = cls.teacherIds.filter((teacherId) =>
		isTeacherInScope(scope, teacherId),
	);
	const [teachers, memberSnaps, careerSnaps, aggregateSnap, sessionSnaps] = await Promise.all([
		teacherDisplayNames(watchedTeacherIds),
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
		sessions: sessionSnaps.docs
			.map((snap) => snap.data() as AgoraSession)
			.filter((session) => isTeacherInScope(scope, session.teacherId))
			.map(toSupervisorSessionRow),
	};
}

async function studentView(
	uid: string,
	data: Extract<SupervisorConsoleRequest, { view: 'student' }>,
): Promise<SupervisorStudentDetail> {
	if (!data.memberId || typeof data.memberId !== 'string') {
		throw new HttpsError('invalid-argument', 'memberId is required');
	}
	const members = await db
		.collection(Collections.agoraClassMembers)
		.where('memberId', '==', data.memberId)
		.limit(1)
		.get();
	const member = members.docs[0]?.data() as AgoraClassMember | undefined;
	if (!member) throw new HttpsError('not-found', 'Student not found');
	const careerSnap = await db
		.collection(Collections.agoraStudentAggregates)
		.doc(data.memberId)
		.get();
	const career = careerSnap.data() as AgoraStudentAggregate | undefined;
	const classSnap = await db.collection(Collections.agoraClasses).doc(member.classId).get();
	const cls = classSnap.data() as AgoraClass | undefined;
	if (!cls) {
		throw new HttpsError('not-found', 'Class not found');
	}
	const { scope: found } = await supervisorScopeFor(uid, cls.schoolId);
	const scope = requireScope(found);
	if (!isClassInScope(scope, cls)) {
		throw new HttpsError('permission-denied', 'This student is outside your scope');
	}
	const classAggSnap = await db.collection(Collections.agoraClassAggregates).doc(cls.classId).get();
	const classAgg = classAggSnap.data() as AgoraClassAggregate | undefined;

	return {
		memberId: member.memberId,
		alias: member.alias,
		classId: cls.classId,
		className: cls.name,
		classGames: classAgg?.gamesPlayed ?? 0,
		joinedAt: member.joinedAt,
		lastActive: member.lastActive,
		career: career ?? null,
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
				case 'overview': {
					const admin = await isSystemAdmin(uid);
					const schools = await supervisedSchools(uid, admin);
					const access = JSON.stringify([
						admin,
						schools.map((s) => [s.schoolId, s.status, s.lastUpdate, s.supervisorScopes?.[uid]]),
					]);

					return await cached(
						`${uid}|${access}|overview|${data.schoolId ?? ''}|${data.days ?? ''}`,
						() => overviewView(uid, data),
					);
				}
				case 'teacher':
					return await teacherView(uid, data);
				case 'class':
					return await classView(uid, data);
				case 'student':
					return await studentView(uid, data);
				case 'system':
					if (!(await isSystemAdmin(uid)))
						throw new HttpsError('permission-denied', 'System admin required');

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
