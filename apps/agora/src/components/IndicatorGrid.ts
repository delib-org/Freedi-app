import m from 'mithril';
import {
	resolveIndicators,
	type IndicatorScope,
	type IndicatorContextMap,
	type IndicatorOutput,
	type IndicatorSize,
	type ResolveOptions,
} from '@freedi/shared-charts';
import { IndicatorCard } from './IndicatorCard';
import { agoraIndicatorLabels } from '../lib/indicatorLabels';

export interface IndicatorGridAttrs<S extends IndicatorScope> {
	scope: S;
	context: IndicatorContextMap[S];
	/** Ids to leave out or reorder — what this page already prints elsewhere */
	options?: ResolveOptions;
	/** Inside a drawer: shorter charts */
	compact?: boolean;
}

interface Built {
	id: string;
	size: IndicatorSize;
	output: IndicatorOutput;
}

/**
 * A dashboard's tiles, built from the shared registry: the KPI numbers first
 * in one row, then the charts in a grid where `sm` spans a column, `md` two
 * and `lg` the whole row. The grid does not know which indicators exist.
 */
export function IndicatorGrid<S extends IndicatorScope>(): m.Component<IndicatorGridAttrs<S>> {
	return {
		view({ attrs }) {
			const labels = agoraIndicatorLabels();
			const built: Built[] = resolveIndicators(attrs.scope, attrs.options).map((i) => ({
				id: i.id,
				size: i.size,
				output: i.build(attrs.context, labels),
			}));
			const stats = built.filter((b) => b.output.type === 'stat');
			const rest = built.filter((b) => b.output.type !== 'stat');
			const card = (b: Built): m.Children =>
				m(IndicatorCard, {
					key: b.id,
					id: b.id,
					size: b.size,
					output: b.output,
					compact: attrs.compact,
				});

			return m(
				'.indicator-grid',
				{ class: attrs.compact ? 'indicator-grid--compact' : undefined },
				[
					stats.length > 0 ? m('.indicator-grid__stats', stats.map(card)) : null,
					rest.length > 0 ? m('.indicator-grid__charts', rest.map(card)) : null,
				],
			);
		},
	};
}
