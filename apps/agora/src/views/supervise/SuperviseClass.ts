import m from 'mithril';
import { IndicatorGrid } from '../../components/IndicatorGrid';
import { classContextFrom } from '../../lib/indicatorContexts';
import { fetchSupervisorClass } from '../../lib/supervisor';
import { t } from '../../lib/i18n';
import { resource, section, shell } from './shared';

/** One class, read-only: the dashboard and the roster by alias — never a name, never a code */
export function SuperviseClass(): m.Component<{ id: string }> {
	return resource<Awaited<ReturnType<typeof fetchSupervisorClass>>, { id: string }>(
		(attrs) => fetchSupervisorClass(attrs.id),
		(data) => {
			const ctx = classContextFrom(data);

			return shell(
				data.name,
				[
					m(IndicatorGrid<'class'>, { scope: 'class', context: ctx }),
					section(
						t('roster.title', { count: data.members.length }),
						data.members.length === 0
							? m('p.supervise__empty', t('supervise.no_students'))
							: m(
									'.supervise__rows',
									data.members.map((member) => {
										const career = ctx.careers[member.memberId];

										return m(
											m.route.Link,
											{
												key: member.memberId,
												href: `/supervise/student/${member.memberId}`,
												class: 'roster__row',
											},
											[
												m('strong.roster__alias', member.alias),
												m('.roster__row-stats', [
													m(
														'span.roster__stat',
														t('roster.games', { count: career?.gamesPlayed ?? 0 }),
													),
													m(
														'span.roster__stat.roster__stat--points',
														t('roster.points', { points: career?.totals.total ?? 0 }),
													),
												]),
											],
										);
									}),
								),
					),
				],
				{ subtitle: data.schoolName },
			);
		},
		{ notFoundKey: 'supervise.class_not_found' },
	);
}
