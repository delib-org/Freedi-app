import m from 'mithril';
import type { SupportBySide as SupportResult } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { supportBars, supportPercent } from '@/lib/classroom/c3Logic';

export interface SupportBySideAttrs {
	result: SupportResult;
	/** The gate (-1..+1 mean support) both sides must reach. */
	gate: number;
}

/**
 * Three bars of mean support for the decision (close to Jonathan / in the
 * middle / close to Noa), each with "n of m rated", a gate tick, and one
 * verdict line: teal when the sides came closer, terracotta when not yet.
 */
export const SupportBySide: m.Component<SupportBySideAttrs> = {
	view({ attrs }) {
		const { result, gate } = attrs;
		const bars = supportBars(result);
		const gatePct = supportPercent(gate);

		return m('section.support', { 'aria-label': t('summary.by_side') }, [
			m(
				'ul.support__bars',
				bars.map((bar) =>
					m('li.support__row', { key: bar.camp }, [
						m('p.support__label', t(`summary.side_${bar.camp}`)),
						m(
							'div.support__track',
							{
								role: 'img',
								'aria-label': t('summary.bar_label', {
									side: t(`summary.side_${bar.camp}`),
									n: bar.n,
									m: bar.m,
								}),
							},
							[
								m('span.support__fill', {
									class: `support__fill--${bar.camp}`,
									style: `--pct: ${bar.percent}%`,
								}),
								m('span.support__gate', { style: `--pct: ${gatePct}%`, 'aria-hidden': 'true' }),
							],
						),
						m('p.support__count', t('summary.n_of_m', { n: bar.n, m: bar.m })),
					]),
				),
			),
			result.verdict === 'insufficient'
				? m('p.support__verdict', t('summary.verdict_wait'))
				: m(
						'p.support__verdict',
						{
							class:
								result.verdict === 'closer'
									? 'support__verdict--closer'
									: 'support__verdict--apart',
							role: 'status',
						},
						result.verdict === 'closer' ? t('summary.verdict_closer') : t('summary.verdict_apart'),
					),
		]);
	},
};
