import clsx from 'clsx';
import {
	resolveIndicators,
	type IndicatorContextMap,
	type IndicatorScope,
} from '@freedi/shared-charts';
import { useIndicatorLabels } from '@/lib/indicatorLabels';
import IndicatorCard from './IndicatorCard';
import styles from './Chart.module.scss';

/**
 * IndicatorGrid — every indicator of one scope, in registry order, after
 * `hide`/`order`. Titles and legends come from the dictionaries through
 * `useIndicatorLabels`; the registry never sees a sentence.
 */
export interface IndicatorGridProps<S extends IndicatorScope> {
	scope: S;
	ctx: IndicatorContextMap[S];
	hide?: string[];
	order?: string[];
	/** Tight two-up row for a list card (e.g. a class card in the school page). */
	mini?: boolean;
	className?: string;
}

export default function IndicatorGrid<S extends IndicatorScope>({
	scope,
	ctx,
	hide,
	order,
	mini = false,
	className,
}: IndicatorGridProps<S>) {
	const labels = useIndicatorLabels();
	const indicators = resolveIndicators(scope, { hide, order });

	return (
		<div className={clsx(styles.grid, mini && styles.mini, className)}>
			{indicators.map((indicator) => {
				const output = indicator.build(ctx, labels);

				return (
					<IndicatorCard
						key={indicator.id}
						id={indicator.id}
						size={mini ? 'md' : indicator.size}
						title={labels.t(`indicator.${indicator.id}`)}
						output={output}
						emptyText={
							output.type === 'empty' ? labels.t(`indicator.empty.${output.reasonKey}`) : undefined
						}
					/>
				);
			})}
		</div>
	);
}
