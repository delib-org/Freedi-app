import { useState, useEffect, useRef, type ReactNode } from 'react';
import { layoutChart, type ChartSpec, type Primitive } from '@freedi/shared-charts';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button } from '../../atoms';

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
}: {
	spec: ChartSpec;
	title: string;
	height?: number;
	legend?: boolean;
	compact?: boolean;
}) {
	const { t, dir, currentLanguage } = useTranslation();
	const ref = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(600);
	useEffect(() => {
		const node = ref.current;
		if (!node) return;
		const observer = new ResizeObserver(([entry]) =>
			setWidth(Math.max(240, Math.round(entry.contentRect.width))),
		);
		observer.observe(node);

		return () => observer.disconnect();
	}, []);
	const [active, setActive] = useState<number | null>(null);
	const [table, setTable] = useState(false);
	const g = layoutChart(spec, {
		width: compact ? 180 : width,
		height: compact
			? 64
			: (height ??
				(spec.kind === 'strip'
					? 64
					: spec.kind === 'hbars'
						? Math.max(1, spec.rows.length) * 40 + 8
						: 260)),
		dir,
		locale: currentLanguage,
		maxXLabels: 5,
	});
	const hit = g.hits.find((h) => h.index === active);

	return (
		<div
			ref={ref}
			className={`chart ${table ? 'chart--table' : ''}`}
			onKeyDown={(e) => {
				if (e.key === 'Escape') setActive(null);
			}}
		>
			<svg
				className="chart__svg"
				viewBox={`0 0 ${g.viewBox.w} ${g.viewBox.h}`}
				direction="ltr"
				preserveAspectRatio="xMidYMid meet"
				role="group"
				aria-label={title}
			>
				<title>{title}</title>
				<desc>{`${title}. ${g.legend.map((item) => item.label).join(', ')}`}</desc>
				{g.primitives.map(primitive)}
				{g.hits.map((h) => (
					<rect
						key={h.index}
						className="chart__hit"
						x={h.x}
						y={h.y}
						width={h.w}
						height={h.h}
						tabIndex={compact ? undefined : 0}
						aria-label={`${h.label}: ${h.lines.map((l) => `${l.label} ${l.value}`).join(', ')}`}
						onMouseEnter={() => setActive(h.index)}
						onMouseLeave={() => setActive(null)}
						onFocus={() => setActive(h.index)}
						onBlur={() => setActive(null)}
					/>
				))}
			</svg>
			{hit && !table && (
				<div className="chart__tip" role="status">
					<strong>{hit.label}</strong>
					{hit.lines.map((l, i) => (
						<div key={i}>
							{l.label}: {l.value}
						</div>
					))}
				</div>
			)}
			{legend && (
				<ul className="chart__legend">
					{g.legend.map((l, i) => (
						<li
							key={i}
							className={`chart__legend-item chart__legend-item--${l.slot === 'muted' ? 'muted' : `s${l.slot}`}`}
						>
							<i aria-hidden="true" />
							{l.icon} {l.label}
						</li>
					))}
				</ul>
			)}
			{!compact && (
				<>
					<Button
						className="chart__table-toggle"
						variant="secondary"
						text={t(table ? 'Hide data table' : 'Show data table')}
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
