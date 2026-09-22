import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import clsx from 'clsx';
import { layoutChart, type ChartSpec, type Primitive } from '@freedi/shared-charts';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button } from '../../atoms';
import styles from './Chart.module.scss';

/**
 * Chart — the React renderer of `@freedi/shared-charts` geometry. The layout
 * decides every coordinate and BEM class; this component only turns
 * primitives into SVG elements, wires the hover/focus hits to one HTML
 * tooltip, and offers the accessible data table the geometry carries.
 * Colour comes from `styles/_chart.scss` through the app's `--chart-*` tokens.
 */

export interface ChartProps {
	spec: ChartSpec;
	/** Already translated; becomes the SVG's accessible name and the table caption. */
	title: string;
	height?: number;
	/** Print the legend chips under the plot. */
	legend?: boolean;
	/** Sparkline mode: fixed small box, no hits, no table. */
	compact?: boolean;
	className?: string;
}

const MIN_WIDTH = 240;
const DEFAULT_WIDTH = 600;
const COMPACT = { width: 180, height: 56 };
const HEIGHTS = { default: 260, strip: 64, hbarRow: 40, hbarPad: 8 };
const MAX_X_LABELS = 5;
const PERCENT = 100;

function documentDir(): 'ltr' | 'rtl' {
	return typeof document !== 'undefined' && document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr';
}

function defaultHeight(spec: ChartSpec): number {
	if (spec.kind === 'strip') return HEIGHTS.strip;
	if (spec.kind === 'hbars')
		return Math.max(1, spec.rows.length) * HEIGHTS.hbarRow + HEIGHTS.hbarPad;

	return HEIGHTS.default;
}

function primitive(p: Primitive, key: number): ReactNode {
	switch (p.type) {
		case 'rect':
			return (
				<rect key={key} className={p.cls} x={p.x} y={p.y} width={p.w} height={p.h} rx={p.rx} />
			);
		case 'path':
			return <path key={key} className={p.cls} d={p.d} />;
		case 'line':
			return <line key={key} className={p.cls} x1={p.x1} x2={p.x2} y1={p.y1} y2={p.y2} />;
		case 'circle':
			return <circle key={key} className={p.cls} cx={p.cx} cy={p.cy} r={p.r} />;
		case 'text':
			return (
				<text
					key={key}
					className={p.cls}
					x={p.x}
					y={p.y}
					textAnchor={p.anchor}
					dominantBaseline={p.baseline}
				>
					{p.text}
				</text>
			);
	}
}

export default function Chart({
	spec,
	title,
	height,
	legend = false,
	compact = false,
	className,
}: ChartProps) {
	const { t, currentLanguage } = useTranslation();
	const ref = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(DEFAULT_WIDTH);
	const [active, setActive] = useState<number | null>(null);
	const [table, setTable] = useState(false);

	useEffect(() => {
		const node = ref.current;
		if (!node || compact || typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(([entry]) =>
			setWidth(Math.max(MIN_WIDTH, Math.round(entry.contentRect.width))),
		);
		observer.observe(node);

		return () => observer.disconnect();
	}, [compact]);

	const g = layoutChart(spec, {
		width: compact ? COMPACT.width : width,
		height: compact ? COMPACT.height : (height ?? defaultHeight(spec)),
		dir: documentDir(),
		locale: currentLanguage,
		maxXLabels: MAX_X_LABELS,
	});
	const hit = active === null ? undefined : g.hits.find((h) => h.index === active);
	const tipStyle: CSSProperties | undefined = hit
		? ({
				'--chart-tip-x': `${((hit.x + hit.w / 2) / g.viewBox.w) * PERCENT}%`,
				'--chart-tip-y': `${(hit.y / g.viewBox.h) * PERCENT}%`,
			} as CSSProperties)
		: undefined;

	return (
		<div
			ref={ref}
			className={clsx('chart', table && 'chart--table', compact && styles.compact, className)}
			onKeyDown={(e) => {
				if (e.key === 'Escape') setActive(null);
			}}
		>
			<svg
				className="chart__svg"
				viewBox={`0 0 ${g.viewBox.w} ${g.viewBox.h}`}
				preserveAspectRatio="xMidYMid meet"
				direction="ltr"
				role="img"
				aria-label={title}
			>
				<title>{title}</title>
				<desc>{g.a11y.desc}</desc>
				{g.primitives.map(primitive)}
				{!compact &&
					g.hits.map((h) => (
						<rect
							key={h.index}
							className={clsx('chart__hit', h.index === active && styles.hitActive)}
							x={h.x}
							y={h.y}
							width={h.w}
							height={h.h}
							tabIndex={0}
							aria-label={`${h.label}: ${h.lines.map((l) => `${l.label} ${l.value}`).join(', ')}`}
							onMouseEnter={() => setActive(h.index)}
							onMouseLeave={() => setActive(null)}
							onFocus={() => setActive(h.index)}
							onBlur={() => setActive(null)}
						/>
					))}
			</svg>
			{hit && !table && (
				<div className={clsx('chart__tip', styles.tip)} style={tipStyle} role="status">
					<div className="chart__tip-title">{hit.label}</div>
					{hit.lines.map((l, i) => (
						<div key={i} className="chart__tip-line">
							{l.slot !== undefined && (
								<i
									aria-hidden="true"
									className={clsx(
										'chart__swatch',
										`chart__swatch--${l.slot === 'muted' ? 'muted' : `s${l.slot}`}`,
									)}
								/>
							)}
							<span>{l.label}</span>
							<span className="chart__tip-value">{l.value}</span>
						</div>
					))}
				</div>
			)}
			{legend && g.legend.length > 0 && (
				<ul className="chart__legend">
					{g.legend.map((l, i) => (
						<li
							key={i}
							className={clsx(
								'chart__legend-item',
								`chart__legend-item--${l.slot === 'muted' ? 'muted' : `s${l.slot}`}`,
							)}
						>
							<i aria-hidden="true" />
							{l.icon ? `${l.icon} ` : ''}
							{l.label}
						</li>
					))}
				</ul>
			)}
			{!compact && (
				<>
					<Button
						className="chart__table-toggle"
						variant="secondary"
						size="small"
						text={t(table ? 'Hide table' : 'Show as table')}
						onClick={() => {
							setTable(!table);
							setActive(null);
						}}
					/>
					<table className="chart__table">
						<caption>{title}</caption>
						<thead>
							<tr>
								{g.a11y.table.head.map((h, i) => (
									<th key={i} scope="col">
										{h || t(i === 0 ? 'Category' : 'Value')}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{g.a11y.table.rows.map((row, i) => (
								<tr key={i}>
									{row.map((cell, j) =>
										j === 0 ? (
											<th key={j} scope="row">
												{cell}
											</th>
										) : (
											<td key={j}>{cell}</td>
										),
									)}
								</tr>
							))}
						</tbody>
					</table>
				</>
			)}
		</div>
	);
}
