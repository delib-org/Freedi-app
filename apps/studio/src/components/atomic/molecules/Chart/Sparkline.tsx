import type { Slot } from '@freedi/shared-charts';
import Chart from './Chart';
import styles from './Chart.module.scss';

/**
 * Sparkline — a 120px trend for a table cell. Keys are week starts or days;
 * `title` names the series for assistive tech (the cell has no other text).
 */
export interface SparklineProps {
	keys: string[];
	values: number[];
	title: string;
	slot?: Slot;
	variant?: 'line' | 'bars';
}

export default function Sparkline({
	keys,
	values,
	title,
	slot = 1,
	variant = 'line',
}: SparklineProps) {
	return (
		<span className={styles.sparkline}>
			<Chart compact title={title} spec={{ kind: 'sparkline', keys, values, slot, variant }} />
		</span>
	);
}
