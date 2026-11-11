import m from 'mithril';
import type { TableAssignmentTopic } from '@freedi/shared-types';
import { t } from '@/lib/i18n';

/** The second layer of the preview, closed until asked for. No position figure is stored or shown. */
export interface MetricsPanelAttrs {
	/** Topics that got no table in this seating. */
	unusedTopics: readonly TableAssignmentTopic[];
}

export const MetricsPanel: m.Component<MetricsPanelAttrs> = {
	view({ attrs }) {
		if (attrs.unusedTopics.length === 0) return null;

		return m('details.full-data', [
			m('summary.full-data__summary', t('tableAssignment.preview.fullData')),
			m('.full-data__body', [
				attrs.unusedTopics.map((topic) =>
					m(
						'p',
						{ key: topic.topicId, dir: 'auto' },
						t('tableAssignment.preview.unusedTopic', { topic: topic.title }),
					),
				),
			]),
		]);
	},
};
