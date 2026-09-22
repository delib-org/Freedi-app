import clsx from 'clsx';
import type { IndicatorOutput, IndicatorSize } from '@freedi/shared-charts';
import { useTranslation } from '@freedi/shared-i18n/react';
import { EmptyState } from '../../atoms';
import ProgressStat from '../../atoms/ProgressStat/ProgressStat';
import Chart from './Chart';
import styles from './Chart.module.scss';

/**
 * IndicatorCard — one registry indicator, already built. A stat becomes a
 * ProgressStat tile (or its string twin when the value is text/unit-ed); a
 * chart becomes a card with title, legend chips, the chart and its table
 * toggle; an empty output is a muted line in a tile or a compact EmptyState.
 */
export interface IndicatorCardProps {
	id: string;
	size: IndicatorSize;
	title: string;
	output: IndicatorOutput;
	/** The translated empty reason, when `output.type === 'empty'`. */
	emptyText?: string;
	className?: string;
}

function StatTile({ value, unit, label }: { value: string; unit?: string; label: string }) {
	return (
		<div className="progress-stat">
			<span className="progress-stat__value">
				{value}
				{unit}
			</span>
			<span className="progress-stat__label">{label}</span>
		</div>
	);
}

export default function IndicatorCard({
	id,
	size,
	title,
	output,
	emptyText,
	className,
}: IndicatorCardProps) {
	const { currentLanguage } = useTranslation();
	const sizeClass = size === 'sm' ? styles.small : size === 'lg' ? styles.large : styles.medium;

	if (output.type === 'stat') {
		const numeric = typeof output.value === 'number' && output.unit === undefined;

		return (
			<section
				className={clsx(styles.item, styles.stat, sizeClass, className)}
				aria-label={title}
				data-indicator={id}
			>
				{numeric ? (
					<ProgressStat value={output.value as number} label={title} />
				) : (
					<StatTile
						value={
							typeof output.value === 'number'
								? new Intl.NumberFormat(currentLanguage).format(output.value)
								: output.value
						}
						unit={output.unit}
						label={title}
					/>
				)}
				{output.hint && <p className={styles.hint}>{output.hint}</p>}
			</section>
		);
	}

	if (output.type === 'empty') {
		return size === 'sm' ? (
			<section
				className={clsx(styles.item, styles.stat, sizeClass, className)}
				aria-label={title}
				data-indicator={id}
			>
				<StatTile value="—" label={title} />
				<p className={styles.muted}>{emptyText}</p>
			</section>
		) : (
			<section
				className={clsx(styles.item, sizeClass, className)}
				aria-label={title}
				data-indicator={id}
			>
				<h3 className={styles.title}>{title}</h3>
				<EmptyState title={emptyText ?? title} compact />
			</section>
		);
	}

	return (
		<section
			className={clsx(styles.item, sizeClass, className)}
			aria-label={title}
			data-indicator={id}
		>
			<h3 className={styles.title}>{title}</h3>
			<Chart spec={output.spec} title={title} height={output.height} legend={output.legend} />
			{output.hint && <p className={styles.hint}>{output.hint}</p>}
		</section>
	);
}
