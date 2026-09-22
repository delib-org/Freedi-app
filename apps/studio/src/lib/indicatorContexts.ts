import { parse } from 'valibot';
import {
	AgoraClassAggregateSchema,
	type SupervisorClassDetail,
	type SupervisorClassRow,
	type SupervisorOverview,
	type SupervisorStudentDetail,
	type SupervisorSystemView,
	type SupervisorTeacherDetail,
} from '@freedi/shared-types';
import {
	classContext,
	schoolContext,
	studentContext,
	systemContext,
	teacherContext,
	type ClassIndicatorContext,
	type SchoolIndicatorContext,
	type StudentIndicatorContext,
	type SystemIndicatorContext,
	type TeacherIndicatorContext,
} from '@freedi/shared-charts';

/**
 * Pure adapters from the supervisor callable's responses to the indicator
 * contexts the registry builds from. They wrap the shared-charts adapters
 * (one source of truth for Agora and Studio) so a page never touches
 * valibot or the aggregate schemas itself.
 */

export function classContextFrom(data: SupervisorClassDetail): ClassIndicatorContext {
	return classContext(data);
}

/**
 * A class as it appears in a list (school overview, teacher detail): the
 * aggregate is there, the roster and careers are not. Enough for the score
 * line and the participation bars; the roster-based indicators read empty.
 */
export function classRowContextFrom(row: SupervisorClassRow): ClassIndicatorContext {
	return {
		aggregate: row.aggregate ? parse(AgoraClassAggregateSchema, row.aggregate) : null,
		memberCount: row.memberCount,
		members: [],
		careers: {},
	};
}

export function studentContextFrom(data: SupervisorStudentDetail): StudentIndicatorContext {
	return studentContext(data);
}

export function teacherContextFrom(
	data: SupervisorTeacherDetail,
	granularity: 'day' | 'week',
): TeacherIndicatorContext {
	return teacherContext(data, granularity);
}

export function schoolContextFrom(
	school: NonNullable<SupervisorOverview['school']>,
): SchoolIndicatorContext {
	return schoolContext(school);
}

export function systemContextFrom(data: SupervisorSystemView): SystemIndicatorContext {
	return systemContext(data);
}
