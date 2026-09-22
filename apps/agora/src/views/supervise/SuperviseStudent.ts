import m from 'mithril';
import { studentContext } from '@freedi/shared-charts';
import { IndicatorGrid } from '../../components/IndicatorGrid';
import { supervisorConsole } from '../../lib/supervisor';
import { resource, shell, date } from './shared';

export function SuperviseStudent(v: m.Vnode<{ id: string }>): m.Component<{ id: string }> {
	return resource(
		() => supervisorConsole({ view: 'student', memberId: v.attrs.id }),
		(data) => {
			const ctx = studentContext(data);

			return shell(
				data.alias,
				[
					m('p', data.className),
					m(IndicatorGrid<'student'>, { scope: 'student', context: ctx }),
					m(
						'ul',
						ctx.career?.perGame
							.slice()
							.reverse()
							.map((g) =>
								m('li', { key: g.sessionId }, `${date(g.playedAt)} · ${g.points.total}`),
							) ?? [],
					),
				],
				`/supervise/class/${data.classId}`,
			);
		},
	);
}
