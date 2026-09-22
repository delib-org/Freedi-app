import {
	resolveIndicators,
	type IndicatorScope,
	type IndicatorContextMap,
	type ResolveOptions,
} from '@freedi/shared-charts';
import { useTranslation } from '@freedi/shared-i18n/react';
import { indicatorEnglish } from '@/i18n/indicatorEnglish';
import Chart from './Chart';
import styles from './IndicatorGrid.module.scss';

export default function IndicatorGrid<S extends IndicatorScope>({
	scope,
	context,
	options,
	chartsOnly = false,
}: {
	scope: S;
	context: IndicatorContextMap[S];
	options?: ResolveOptions;
	chartsOnly?: boolean;
}) {
	const { tWithParams, currentLanguage } = useTranslation();
	const label = (key: string, params?: Record<string, string>): string =>
		tWithParams(indicatorEnglish[key] ?? key, params ?? {});

	return (
		<div className={styles.grid}>
			{resolveIndicators(scope, options)
				.filter((i) => !chartsOnly || i.size !== 'sm')
				.map((i) => {
					const out = i.build(context, { t: label, locale: currentLanguage });
					const title = label(`indicator.${i.id}`);

					return (
						<section
							key={i.id}
							className={`${styles.item} ${i.size === 'sm' ? styles.small : i.size === 'lg' ? styles.large : ''}`}
							aria-label={title}
						>
							<h3 className={styles.title}>{title}</h3>
							{out.type === 'chart' ? (
								<Chart spec={out.spec} title={title} height={out.height} legend={out.legend} />
							) : out.type === 'stat' ? (
								<p className={styles.value}>
									{typeof out.value === 'number'
										? new Intl.NumberFormat(currentLanguage).format(out.value)
										: out.value}
									{out.unit}
								</p>
							) : (
								<p className="chart__empty">{label(`indicator.empty.${out.reasonKey}`)}</p>
							)}
							{out.type !== 'empty' && out.hint && <p>{out.hint}</p>}
						</section>
					);
				})}
		</div>
	);
}
