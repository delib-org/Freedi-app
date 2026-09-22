import m from 'mithril';
import { classContext } from '@freedi/shared-charts';
import { IndicatorGrid } from '../../components/IndicatorGrid';
import { supervisorConsole } from '../../lib/supervisor';
import { t } from '../../lib/i18n';
import { resource, shell } from './shared';

export function SuperviseClass(v: m.Vnode<{ id: string }>): m.Component<{ id: string }> {
	return resource(
		() => supervisorConsole({ view: 'class', classId: v.attrs.id }),
		(data) => {
			const ctx = classContext(data);

			return shell(data.name, [
				m('p', data.schoolName),
				m(IndicatorGrid<'class'>, { scope: 'class', context: ctx }),
				m(
					'div.stack',
					data.members.map((member) =>
						m(
							m.route.Link,
							{
								key: member.memberId,
								href: `/supervise/student/${member.memberId}`,
								class: 'card roster__row',
							},
							[
								m('strong', member.alias),
								m(
									'span',
									t('roster.points', { points: ctx.careers[member.memberId]?.totals.total ?? 0 }),
								),
							],
						),
					),
				),
			]);
		},
	);
}
