import { parse } from 'valibot';
import {
	AgoraClassAggregateSchema,
	AgoraStudentAggregateSchema,
	AgoraTeacherAggregateSchema,
} from '@freedi/shared-types';
import type {
	SupervisorOverview,
	SupervisorTeacherDetail,
	SupervisorClassDetail,
	SupervisorStudentDetail,
	SupervisorSystemView,
} from '@freedi/shared-types';
import type {
	ClassIndicatorContext,
	StudentIndicatorContext,
	TeacherIndicatorContext,
	SchoolIndicatorContext,
	SystemIndicatorContext,
} from './contexts';

export function classContext(
	data: Pick<SupervisorClassDetail, 'aggregate' | 'members' | 'careers' | 'memberCount'>,
): ClassIndicatorContext {
	return {
		aggregate: data.aggregate ? parse(AgoraClassAggregateSchema, data.aggregate) : null,
		memberCount: data.memberCount,
		members: data.members,
		careers: Object.fromEntries(
			Object.entries(data.careers).map(([id, value]) => [
				id,
				parse(AgoraStudentAggregateSchema, value),
			]),
		),
	};
}
export function studentContext(
	data: Pick<SupervisorStudentDetail, 'career' | 'classGames'>,
): StudentIndicatorContext {
	return {
		career: data.career ? parse(AgoraStudentAggregateSchema, data.career) : null,
		classGames: data.classGames,
	};
}
export function teacherContext(
	data: SupervisorTeacherDetail,
	granularity: 'day' | 'week' = 'week',
): TeacherIndicatorContext {
	const agg = data.aggregate ? parse(AgoraTeacherAggregateSchema, data.aggregate) : null;
	return {
		lessonsRun: data.lessons.days.reduce((sum, d) => sum + d.lessons, 0),
		classLessons: agg?.classLessons ?? 0,
		totalDurationMs: data.usage.days.reduce((sum, d) => sum + d.activeMs, 0),
		avgClassScore: agg?.avgClassScore ?? null,
		classCount: data.classes.length,
		usageDays: data.usage.days,
		usageWeeks: data.usage.weeks.map((w) => ({ weekStart: w.weekStart, value: w.activeMs })),
		lessonsByWeek: data.lessons.weeks.map((w) => ({ weekStart: w.weekStart, value: w.lessons })),
		scoreByWeek: data.lessons.weeks.map((w) => ({
			weekStart: w.weekStart,
			value: w.avgClassScore,
		})),
		granularity,
	};
}
export function schoolContext(
	data: NonNullable<SupervisorOverview['school']>,
): SchoolIndicatorContext {
	return {
		teacherCount: data.teachers.length,
		classCount: data.classes.length,
		lessonsInPeriod: data.lessons.days.reduce((sum, d) => sum + d.lessons, 0),
		studentGameSlots: data.teachers.reduce((sum, t) => sum + t.studentGameSlots, 0),
		outcomes: data.outcomes,
		classes: data.classes.map((c) => ({
			label: c.name,
			avgClassScore: c.advancement?.avgClassScore ?? null,
		})),
		lessonsByWeek: data.lessons.weeks.map((w) => ({ weekStart: w.weekStart, value: w.lessons })),
		minutesByWeek: data.usage.weeks.map((w) => ({
			weekStart: w.weekStart,
			value: w.activeMs / 60000,
		})),
	};
}
export function systemContext(data: SupervisorSystemView): SystemIndicatorContext {
	const sum = (rows: { value: number }[]): number => rows.reduce((s, d) => s + d.value, 0);
	return {
		totals: {
			gamesFinished: sum(data.series.gamesFinished),
			studentsReached: sum(data.series.studentsReached),
			classesPlayed: sum(data.series.classesPlayed),
		},
		gamesFinishedByDay: data.series.gamesFinished,
		studentsReachedByDay: data.series.studentsReached,
		classesPlayedByDay: data.series.classesPlayed,
		byOutcomeWeekly: data.series.byOutcomeWeekly,
		teachersActive: data.teachersActive,
	};
}
