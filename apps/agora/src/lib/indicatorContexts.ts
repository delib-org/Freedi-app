import type {
	ClassIndicatorContext,
	StudentIndicatorContext,
	TeacherIndicatorContext,
	SchoolIndicatorContext,
	SystemIndicatorContext,
} from '@freedi/shared-charts';
import {
	classContext,
	studentContext,
	teacherContext,
	schoolContext,
	systemContext,
} from '@freedi/shared-charts';
import type {
	AgoraClassAggregate,
	AgoraStudentAggregate,
	SupervisorClassDetail,
	SupervisorOverview,
	SupervisorSystemView,
	SupervisorTeacherDetail,
	TeacherConsoleMember,
} from '@freedi/shared-types';

/**
 * What the class page holds after `fetchTeacherClass`: parsed aggregates in
 * a Map. The supervisor's class answer carries the same facts unparsed in a
 * record — both feed the same indicators.
 */
export interface ParsedClassLike {
	members: TeacherConsoleMember[];
	careers: Map<string, AgoraStudentAggregate>;
	aggregate: AgoraClassAggregate | null;
}

export type ClassLike =
	| ParsedClassLike
	| Pick<SupervisorClassDetail, 'aggregate' | 'members' | 'careers' | 'memberCount'>;

function isParsed(detail: ClassLike): detail is ParsedClassLike {
	return detail.careers instanceof Map;
}

/** The class dashboard's context from either the teacher's or the supervisor's answer. */
export function classContextFrom(detail: ClassLike): ClassIndicatorContext {
	if (isParsed(detail)) {
		return {
			aggregate: detail.aggregate,
			memberCount: detail.members.length,
			members: detail.members,
			careers: Object.fromEntries(detail.careers),
		};
	}

	return classContext(detail);
}

/** One student's drawer: a parsed career and how many games the class has played. */
export function studentContextFrom(
	career: AgoraStudentAggregate | null,
	classGames: number,
): StudentIndicatorContext {
	return { career, classGames: Math.max(0, classGames) };
}

export function teacherContextFrom(
	detail: SupervisorTeacherDetail,
	granularity: 'day' | 'week' = 'week',
): TeacherIndicatorContext {
	return teacherContext(detail, granularity);
}

export function schoolContextFrom(
	school: NonNullable<SupervisorOverview['school']>,
): SchoolIndicatorContext {
	return schoolContext(school);
}

export function systemContextFrom(system: SupervisorSystemView): SystemIndicatorContext {
	return systemContext(system);
}

export { studentContext };
