import m from 'mithril';
import { t } from '@/lib/i18n';
import type { MetricsView } from '@/logic/metrics';

/** How many got each choice, before publishing: the cost of balancing, in plain counts. */
export interface ChoiceSummaryAttrs {
	view: MetricsView;
}

interface Segment {
	id: string;
	labelKey: string;
	count: number;
}

const RANK_LABELS = ['first', 'second', 'third'] as const;

function segmentsOf(view: MetricsView): Segment[] {
	const ranks = view.rankRows.map((row, index) => ({
		id: RANK_LABELS[index] ?? 'third',
		labelKey: `tableAssignment.choice.${RANK_LABELS[index] ?? 'third'}`,
		count: row.count,
	}));

	return [
		...ranks,
		{ id: 'outside', labelKey: 'tableAssignment.choice.outside', count: view.outsideChoices },
		{ id: 'none', labelKey: 'tableAssignment.choice.none', count: view.withoutPreferences },
	].filter((segment) => segment.count > 0);
}

export const ChoiceSummary: m.Component<ChoiceSummaryAttrs> = {
	view({ attrs }) {
		const segments = segmentsOf(attrs.view);

		return m('.choices', [
			m(
				'.choices__bar',
				{ 'aria-hidden': 'true' },
				segments.map((segment) =>
					m(`span.choices__segment.choices__segment--${segment.id}`, {
						key: segment.id,
						style: { '--share': segment.count },
					}),
				),
			),
			m(
				'ul.choices__legend',
				segments.map((segment) =>
					m('li.choices__item', { key: segment.id }, [
						m(`span.choices__swatch.choices__segment--${segment.id}`, { 'aria-hidden': 'true' }),
						m('strong', String(segment.count)),
						' ',
						t(segment.labelKey),
					]),
				),
			),
		]);
	},
};
