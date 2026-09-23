import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	AgoraClassAggregate,
	AgoraOutcomeTally,
	AgoraSchool,
	AgoraTeacherUsageMonth,
	Collections,
	SupervisorConsoleRequest,
	SupervisorSystemView,
	bucketUsage,
	dayKeyOf,
	dayKeysBetween,
	monthKeyOf,
	weekStartOf,
} from '@freedi/shared-types';
import { isSystemAdmin } from '../utils/httpAuth';
import { teacherDisplayNames } from './teacherLookup';
import { AgoraStatsDoc, USAGE_DOCS_CAP, CLASS_AGGREGATES_CAP, periodFor } from './supervisorData';

export async function systemView(
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
