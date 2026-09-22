import m from 'mithril';
import { teacherContext } from '@freedi/shared-charts';
import type { SupervisorTeacherDetail } from '@freedi/shared-types';
import { teacherConsole } from '../../lib/callables';
import { IndicatorGrid } from '../../components/IndicatorGrid';
import { resource, shell, privacy, lessons } from '../supervise/shared';
import { t } from '../../lib/i18n';

export function TeacherActivity(): m.Component<{ id: string }> {
	return resource(
		async () => (await teacherConsole({ view: 'activity' })) as SupervisorTeacherDetail,
		(data) =>
			shell(
				t('supervise.myActivity'),
				[
					data.truncated ? m('p.supervise__notice', t('supervise.truncated')) : null,
					m(IndicatorGrid<'teacher'>, {
						scope: 'teacher',
						context: teacherContext(data),
						options: { hide: ['teacher.classes'] },
					}),
					privacy(),
					lessons(data.lessonRows),
				],
				'/teach',
			),
	);
}
