import { db } from '../db';
import {
	Collections,
	dayKeyOf,
	monthKeyOf,
	bucketUsage,
	lessonSeries,
	emptyTeacherAggregate,
	type AgoraTeacherAggregate,
	type AgoraTeacherUsageMonth,
	type SupervisorTeacherDetail,
} from '@freedi/shared-types';
/** Self-service mirror of the usage numbers shared with supervisors. Identity is always the caller. */
export async function teacherActivity(uid: string): Promise<SupervisorTeacherDetail> {
	const now = Date.now();
	const period = { fromDay: dayKeyOf(now - 89 * 24 * 60 * 60 * 1000), toDay: dayKeyOf(now) };
	const [aggSnap, months] = await Promise.all([
		db.collection(Collections.agoraTeacherAggregates).doc(uid).get(),
		db
			.collection(Collections.agoraTeacherUsage)
			.where('teacherId', '==', uid)
			.where('month', '>=', monthKeyOf(now - 89 * 24 * 60 * 60 * 1000))
			.get(),
	]);
	const aggregate =
		(aggSnap.data() as AgoraTeacherAggregate | undefined) ?? emptyTeacherAggregate(uid);

	return {
		teacher: { uid, name: '' },
		aggregate,
		usage: bucketUsage(
			months.docs.map((d) => d.data() as AgoraTeacherUsageMonth),
			period,
		),
		lessons: lessonSeries(aggregate, period),
		lessonRows: [...aggregate.perLesson].reverse(),
		classes: [],
		period,
		truncated: aggregate.lessonsRun > aggregate.perLesson.length,
	};
}
