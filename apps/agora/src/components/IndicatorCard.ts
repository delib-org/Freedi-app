import m from 'mithril';
import type { IndicatorOutput, IndicatorSize } from '@freedi/shared-charts';
import { Chart } from './Chart';
import { getLang, t } from '../lib/i18n';

export interface IndicatorCardAttrs {
	/** The registry id — the title is `indicator.<id>` */
	id: string;
	size: IndicatorSize;
	output: IndicatorOutput;
	/** Inside a drawer: shorter charts that still fill the width */
	compact?: boolean;
}

const COMPACT_HEIGHT = 140;

/**
 * One tile of a dashboard. A `stat` is a number with its label; a `chart`
 * is a card with a title, the legend, the picture and the table toggle; an
 * `empty` is one quiet line saying why there is nothing yet.
 */
export function IndicatorCard(): m.Component<IndicatorCardAttrs> {
	return {
		view({ attrs }) {
			const { id, size, output, compact } = attrs;
			const title = t(`indicator.${id}`);

			if (output.type === 'stat') {
				const value =
					typeof output.value === 'number'
						? new Intl.NumberFormat(getLang()).format(output.value)
						: output.value;

				return m('.indicator.indicator--stat', { 'aria-label': title }, [
					m('.indicator__value', [
						value,
						output.unit ? m('span.indicator__unit', output.unit) : null,
					]),
					m('.indicator__label', title),
					output.hint ? m('.indicator__hint', output.hint) : null,
				]);
			}

			if (output.type === 'empty') {
				return m('.indicator.indicator--empty', { class: `indicator--${size}` }, [
					m('.indicator__label', title),
					m('p.indicator__empty', t(`indicator.empty.${output.reasonKey}`)),
				]);
			}

			return m(
				'section.indicator.indicator--chart',
				{
					class: [`indicator--${size}`, compact ? 'indicator--compact' : '']
						.filter(Boolean)
						.join(' '),
					'aria-label': title,
				},
				[
					m('h3.indicator__title', title),
					m(Chart, {
						title,
						spec: output.spec,
						// A drawer chart is a glance, not a study: shorter, still full width
						height: compact
							? Math.min(output.height ?? COMPACT_HEIGHT, COMPACT_HEIGHT)
							: output.height,
						legend: output.legend ?? true,
					}),
					output.hint ? m('p.indicator__hint', output.hint) : null,
				],
			);
		},
	};
}
