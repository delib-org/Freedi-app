import m from 'mithril';
import {
	resolveIndicators,
	type IndicatorScope,
	type IndicatorContextMap,
	type ResolveOptions,
} from '@freedi/shared-charts';
import { Chart } from './Chart';
import { getLang, t } from '../lib/i18n';

export interface IndicatorGridAttrs<S extends IndicatorScope> {
	scope: S;
	context: IndicatorContextMap[S];
	options?: ResolveOptions;
	chartsOnly?: boolean;
}
export function IndicatorGrid<S extends IndicatorScope>(): m.Component<IndicatorGridAttrs<S>> {
	return {
		view: ({ attrs }) =>
			m(
				'.indicator-grid',
				resolveIndicators(attrs.scope, attrs.options)
					.filter((i) => !attrs.chartsOnly || i.size !== 'sm')
					.map((i) => {
						const out = i.build(attrs.context, { t, locale: getLang() });
						const title = t(`indicator.${i.id}`);

						return m(
							'section.card.indicator-grid__item',
							{ key: i.id, class: `indicator-grid__item--${i.size}`, 'aria-label': title },
							[
								m('h3.indicator-grid__title', title),
								out.type === 'chart'
									? m(Chart, { title, spec: out.spec, height: out.height, legend: out.legend })
									: out.type === 'stat'
										? m('p.indicator-grid__value', [
												typeof out.value === 'number'
													? new Intl.NumberFormat(getLang()).format(out.value)
													: out.value,
												out.unit ?? '',
											])
										: m('p.chart__empty', t(`indicator.empty.${out.reasonKey}`)),
								out.type !== 'empty' && out.hint ? m('p', out.hint) : null,
							],
						);
					}),
			),
	};
}
