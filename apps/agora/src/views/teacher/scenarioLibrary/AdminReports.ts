import m from 'mithril';
import { Stars } from '../../../components/scenarioLibrary/Stars';
import { t, tCount } from '../../../lib/i18n';
import type { ReportTarget } from '../../../lib/scenarioLibrary/api';
import type { ReportGroup } from '../../../lib/scenarioLibrary/adminView';

export interface AdminReportsAttrs {
	groups: readonly ReportGroup[];
	/** What each group points at; `null` when it is gone, absent while it loads */
	targets: ReadonlyMap<string, ReportTarget | null>;
	/** The group being resolved right now */
	busy: string | null;
	failed: boolean;
	onResolve: (group: ReportGroup, resolution: 'hidden' | 'dismissed') => void;
}

export const groupKey = (group: Pick<ReportGroup, 'targetKind' | 'targetId'>): string =>
	`${group.targetKind}:${group.targetId}`;

function preview(group: ReportGroup, target: ReportTarget | null | undefined): m.Children {
	if (target === undefined) return m('.spinner', { role: 'status' });
	if (target === null) return m('p.scn-note', t('scenlib.adm_target_gone'));

	return m('.scn-adm__preview', [
		m('p.scn-adm__preview-title', [
			target.title,
			target.stars !== undefined ? [' ', m(Stars, { value: target.stars, size: 16 })] : null,
		]),
		target.text ? m('p.scn-adm__preview-text', target.text) : null,
		group.targetKind === 'scenario'
			? null
			: m(
					m.route.Link,
					{ href: `/teach/library/${group.scenarioId}`, class: 'btn btn--ghost btn--sm' },
					t('scenlib.adm_open'),
				),
	]);
}

/** The open reports, most reported first, each with what it points at and the two ways to close it */
export const AdminReports: m.Component<AdminReportsAttrs> = {
	view({ attrs }) {
		if (attrs.groups.length === 0) {
			return m('p.scn-note', t('scenlib.adm_reports_empty'));
		}

		return m(
			'ul.scn-adm__list',
			{ role: 'list' },
			attrs.groups.map((group) => {
				const key = groupKey(group);
				const target = attrs.targets.get(key);
				const working = attrs.busy === key;

				return m('li.scn-adm__item', { key }, [
					m('.scn-adm__head', [
						m('span.scn-pill', t(`scenlib.adm_kind_${group.targetKind}`)),
						m('strong', tCount('scenlib.adm_report_n', group.reports.length)),
						m('span.scn-post__date', t('scenlib.adm_by', { names: group.reporters.join(', ') })),
					]),
					preview(group, target),
					m(
						'ul.scn-adm__reasons',
						{ role: 'list' },
						group.reasons.length > 0
							? group.reasons.map((reason) => m('li', reason))
							: [m('li.scn-note', t('scenlib.adm_reason_none'))],
					),
					m('.scn-compose__actions', [
						m(
							'button.btn.btn--secondary.btn--sm',
							{
								type: 'button',
								'aria-disabled': working ? 'true' : undefined,
								onclick: () => {
									if (!working) attrs.onResolve(group, 'hidden');
								},
							},
							t('scenlib.adm_hide_resolve'),
						),
						m(
							'button.btn.btn--ghost.btn--sm',
							{
								type: 'button',
								'aria-disabled': working ? 'true' : undefined,
								onclick: () => {
									if (!working) attrs.onResolve(group, 'dismissed');
								},
							},
							t('scenlib.adm_dismiss'),
						),
					]),
				]);
			}),
		);
	},
};
