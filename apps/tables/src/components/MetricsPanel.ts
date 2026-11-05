import m from 'mithril';
import type { TableAssignmentMetrics } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { describeMetrics } from '@/logic/metrics';

/**
 * "Table composition" (הרכב השולחנות) and how well choices were met. Balance
 * is shown as the worst table's deviation against the host's tolerance, with
 * an explicit within / outside flag: never a single score.
 */
export interface MetricsPanelAttrs {
	metrics: TableAssignmentMetrics;
}

export const MetricsPanel: m.Component<MetricsPanelAttrs> = {
	view({ attrs }) {
		const view = describeMetrics(attrs.metrics);

		return m('section.card', [
			m('h2.card__title', t('tableAssignment.metrics.choices')),
			m('dl.counts', [
				...view.rankRows.map((row) =>
					m('div.counts__item', { key: `rank-${row.rank}` }, [
						m('dt', t('tableAssignment.metrics.rank', { rank: row.rank })),
						m('dd', String(row.count)),
					]),
				),
				m('div.counts__item', { key: 'none' }, [
					m('dt', t('tableAssignment.metrics.outside')),
					m('dd', String(view.outsideChoices)),
				]),
				m('div.counts__item', { key: 'noPreference' }, [
					m('dt', t('tableAssignment.metrics.noPreference')),
					m('dd', String(view.withoutPreferences)),
				]),
			]),
			m('h2.card__title', t('tableAssignment.composition')),
			m('dl.counts', [
				m('div.counts__item', [
					m('dt', t('tableAssignment.metrics.balanceMax')),
					m('dd', view.balanceMax),
				]),
				m('div.counts__item', [
					m('dt', t('tableAssignment.metrics.balanceMean')),
					m('dd', view.balanceMean),
				]),
				m('div.counts__item', [
					m('dt', t('tableAssignment.metrics.tolerance')),
					m('dd', view.tolerance),
				]),
			]),
			m(
				'p.notice',
				{
					class: view.withinTolerance ? 'notice--ok' : 'notice--warn',
					role: 'status',
				},
				t(
					view.withinTolerance
						? 'tableAssignment.metrics.within'
						: 'tableAssignment.metrics.outsideTolerance',
				),
			),
			m('p.card__hint', t('tableAssignment.balance.explain')),
		]);
	},
};
