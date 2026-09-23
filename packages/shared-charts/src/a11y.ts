import type { A11yTable, ChartSpec } from './types';

const KIND_NAMES: Record<ChartSpec['kind'], string> = {
	line: 'line chart',
	sparkline: 'sparkline',
	bars: 'bar chart',
	stackedBars: 'stacked bar chart',
	hbars: 'horizontal bar chart',
	histogram: 'histogram',
	strip: 'proportion strip',
};

/**
 * A short, language-neutral-as-possible description for `aria-label` /
 * `<desc>`: the chart kind, the series names and the number of buckets.
 * The data itself is in `a11y.table`, which a renderer prints as a real
 * `<table>` for screen readers.
 */
export function describeChart(spec: ChartSpec, table: A11yTable): string {
	const kind = KIND_NAMES[spec.kind];
	const series = table.head.filter((h) => h !== '');
	const buckets = table.rows.length;
	const parts = [kind];
	if (series.length > 0) parts.push(series.join(', '));
	parts.push(`${buckets} ${buckets === 1 ? 'entry' : 'entries'}`);

	return parts.join('; ');
}
