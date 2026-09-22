import m from 'mithril';
import { teacherContext } from '@freedi/shared-charts';
import { IndicatorGrid } from '../../components/IndicatorGrid';
import { supervisorConsole } from '../../lib/supervisor';
import { t } from '../../lib/i18n';
import { resource, shell, classes, lessons, privacy } from './shared';

export function SuperviseTeacher(v: m.Vnode<{ id: string }>): m.Component<{ id: string }> {
	const schoolId = String(m.route.param('schoolId') ?? '');
	let granularity: 'day' | 'week' = 'week';

	return resource(
		() => supervisorConsole({ view: 'teacher', teacherId: v.attrs.id, schoolId, days: 90 }),
		(data) =>
			shell(data.teacher.name, [
				data.truncated ? m('p.supervise__notice', t('supervise.truncated')) : null,
				m(
					'.supervise__controls',
					['day', 'week'].map((g) =>
						m(
							'button.btn.btn--sm.btn--secondary',
							{
								'aria-pressed': granularity === g,
								onclick: () => {
									granularity = g as 'day' | 'week';
								},
							},
							t(`supervise.${g}`),
						),
					),
				),
				m(IndicatorGrid<'teacher'>, {
					scope: 'teacher',
					context: teacherContext(data, granularity),
				}),
				privacy(),
				classes(data.classes),
				lessons(data.lessonRows),
			]),
	);
}
