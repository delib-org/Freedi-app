import m from 'mithril';
import type { SupervisorTeacherDetail } from '@freedi/shared-types';
import { teacherConsole } from '../../lib/callables';
import { IndicatorGrid } from '../../components/IndicatorGrid';
import { teacherContextFrom } from '../../lib/indicatorContexts';
import {
	granularityToggle,
	lessonsTable,
	privacy,
	resource,
	section,
	shell,
} from '../supervise/shared';
import { t } from '../../lib/i18n';

/** The teacher's own activity — the supervisor's teacher page, turned on oneself */
export function TeacherActivity(): m.Component<{ id: string }> {
	let granularity: 'day' | 'week' = 'week';

	return resource<SupervisorTeacherDetail, { id: string }>(
		async () => (await teacherConsole({ view: 'activity' })) as SupervisorTeacherDetail,
		(data) =>
			shell(
				t('supervise.myActivity'),
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
						options: { hide: ['teacher.classes'] },
					}),
					privacy(),
					section(
						t('supervise.lessons'),
						lessonsTable(data.lessonRows, new Map(data.classes.map((c) => [c.classId, c.name]))),
					),
				],
				{ back: '/teach' },
			),
		{ notFoundKey: 'supervise.teacher_not_found', back: '/teach' },
	);
}
