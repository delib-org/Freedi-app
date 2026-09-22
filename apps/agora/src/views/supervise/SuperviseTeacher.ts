import m from 'mithril';
import { IndicatorGrid } from '../../components/IndicatorGrid';
import { teacherContextFrom } from '../../lib/indicatorContexts';
import { fetchSupervisorTeacher, getSupervisorState, savedPeriod } from '../../lib/supervisor';
import { t } from '../../lib/i18n';
import {
	classesTable,
	granularityToggle,
	lessonsTable,
	privacy,
	resource,
	section,
	shell,
} from './shared';

export interface SuperviseTeacherAttrs extends Record<string, string> {
	schoolId: string;
	uid: string;
}

/** One teacher inside one school: activity, lessons, and the classes they run there */
export function SuperviseTeacher(): m.Component<SuperviseTeacherAttrs> {
	let granularity: 'day' | 'week' = 'week';

	return resource<Awaited<ReturnType<typeof fetchSupervisorTeacher>>, SuperviseTeacherAttrs>(
		(attrs) => fetchSupervisorTeacher(attrs.schoolId, attrs.uid, savedPeriod()),
		(data, attrs) => {
			const school = getSupervisorState().schools.find((s) => s.schoolId === attrs.schoolId);
			const classNames = new Map(data.classes.map((c) => [c.classId, c.name]));

			return shell(
				data.teacher.name,
				[
					data.truncated ? m('p.supervise__notice', t('supervise.truncated')) : null,
					m('.supervise__scope', [
						granularityToggle(granularity, (g) => {
							granularity = g;
						}),
					]),
					m(IndicatorGrid<'teacher'>, {
						scope: 'teacher',
						context: teacherContextFrom(data, granularity),
					}),
					privacy(),
					section(t('supervise.classes'), classesTable(data.classes)),
					section(t('supervise.lessons'), lessonsTable(data.lessonRows, classNames)),
				],
				{ subtitle: school?.name },
			);
		},
		{ notFoundKey: 'supervise.teacher_not_found' },
	);
}
