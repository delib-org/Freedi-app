import m from 'mithril';
import type { TableAssignmentMetrics, TableAssignmentTopic } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { hasKnownPositions } from '@/logic/closeness';
import { describeMetrics } from '@/logic/metrics';

/** The second layer of the preview, closed until asked for. The numbers are stored rounded. */
export interface MetricsPanelAttrs {
	metrics: TableAssignmentMetrics;
	/** Topics that got no table in this seating. */
	unusedTopics: readonly TableAssignmentTopic[];
}

export const MetricsPanel: m.Component<MetricsPanelAttrs> = {
	view({ attrs }) {
		const view = describeMetrics(attrs.metrics);
		const known = hasKnownPositions(attrs.metrics.population);

		return m('details.full-data', [
			m('summary.full-data__summary', t('tableAssignment.preview.fullData')),
			m('.full-data__body', [
				known
					? m(
							'p',
							t('tableAssignment.preview.distance', {
								max: view.balanceMax,
								tolerance: view.tolerance,
							}),
						)
					: null,
				attrs.unusedTopics.map((topic) =>
					m(
						'p',
						{ key: topic.topicId, dir: 'auto' },
						t('tableAssignment.preview.unusedTopic', { topic: topic.title }),
					),
				),
				m('p', t('tableAssignment.preview.rounded')),
			]),
		]);
	},
};
