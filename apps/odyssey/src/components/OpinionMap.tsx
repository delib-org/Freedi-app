import { useMemo } from 'react';
import type { OpinionMapResult, OpinionPoint } from '../lib/opinionMap';

/**
 * SVG renderer for the 2D opinion map (doc §3 honesty rules):
 * - equal scale on both axes — it's a distance map, not a chart;
 * - no axis ticks or labeled directions — a scale bar instead;
 * - fidelity shown; when r < 0.8 the map is misleading → not drawn.
 */

const VIEW_WIDTH = 640;
const VIEW_HEIGHT = 440;
const PADDING = 56;
const SCALE_BAR_UNITS = [0.5, 0.25, 0.1];

interface Placed {
	point: OpinionPoint;
	cx: number;
	cy: number;
}

export default function OpinionMap({ result }: { result: OpinionMapResult | null }) {
	const layout = useMemo(() => {
		if (!result) return null;
		const xs = result.points.map((point) => point.x);
		const ys = result.points.map((point) => point.y);
		const minX = Math.min(...xs);
		const maxX = Math.max(...xs);
		const minY = Math.min(...ys);
		const maxY = Math.max(...ys);
		const span = Math.max(maxX - minX, maxY - minY, 1e-6);
		// One scale for both axes — equal-scale requirement.
		const scale = Math.min(VIEW_WIDTH - 2 * PADDING, VIEW_HEIGHT - 2 * PADDING) / span;
		const centerX = (minX + maxX) / 2;
		const centerY = (minY + maxY) / 2;

		const placed: Placed[] = result.points.map((point) => ({
			point,
			cx: VIEW_WIDTH / 2 + (point.x - centerX) * scale,
			cy: VIEW_HEIGHT / 2 - (point.y - centerY) * scale,
		}));

		const barUnit =
			SCALE_BAR_UNITS.find((unit) => unit * scale <= VIEW_WIDTH * 0.4) ?? SCALE_BAR_UNITS[2];

		return { placed, scale, barUnit };
	}, [result]);

	if (!result || !layout) {
		return (
			<p className="m-0 opacity-80 text-[15px]">
				עדיין אין מספיק מפליגים עם תשובות משותפות כדי לצייר את מפת הדעות.
			</p>
		);
	}

	const { fidelity } = result;
	if (!result.reliable) {
		return (
			<p className="m-0 opacity-80 text-[15px]">
				⚠️ החפיפה בין המסלולים עדיין דלה מכדי לצייר מפה אמינה (r ={` ${fidelity.r.toFixed(2)}`}).
				המפה תופיע כשיהיו יותר תשובות משותפות.
			</p>
		);
	}

	const barLength = layout.barUnit * layout.scale;

	return (
		<div className="flex flex-col gap-2">
			<svg
				viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
				role="img"
				aria-label="מפת דעות דו-ממדית: קרבה בין נקודות משמעה דמיון בתשובות"
				className="w-full rounded-xl border border-[rgba(94,223,255,0.35)] bg-[rgba(4,18,34,0.8)]"
			>
				{layout.placed.map(({ point, cx, cy }) => (
					<g key={point.id}>
						{point.kind === 'me' ? (
							<circle cx={cx} cy={cy} r={11} fill="none" stroke="#e8b958" strokeWidth={2} />
						) : null}
						<circle
							cx={cx}
							cy={cy}
							r={point.kind === 'party' ? 7 : point.kind === 'me' ? 6.5 : 4.5}
							fill={
								point.kind === 'party'
									? (point.color ?? '#9fd7ff')
									: point.kind === 'me'
										? '#e8b958'
										: '#5edfff'
							}
							stroke={point.kind === 'party' ? '#ffffff' : 'none'}
							strokeWidth={point.kind === 'party' ? 1.2 : 0}
							opacity={point.kind === 'sailor' ? 0.85 : 1}
						/>
						<text
							x={cx}
							y={cy + (point.kind === 'party' ? 22 : 18)}
							textAnchor="middle"
							fontSize={point.kind === 'sailor' ? 11 : 13}
							fill={point.kind === 'me' ? '#e8b958' : '#d5ecf7'}
							fontWeight={point.kind === 'sailor' ? 400 : 700}
						>
							{point.label}
						</text>
					</g>
				))}

				{/* Scale bar — the only measure on the map; axes stay unlabeled. */}
				<g transform={`translate(${PADDING / 2}, ${VIEW_HEIGHT - 22})`}>
					<line x1={0} y1={0} x2={barLength} y2={0} stroke="#d5ecf7" strokeWidth={2} />
					<line x1={0} y1={-5} x2={0} y2={5} stroke="#d5ecf7" strokeWidth={2} />
					<line x1={barLength} y1={-5} x2={barLength} y2={5} stroke="#d5ecf7" strokeWidth={2} />
					<text x={barLength / 2} y={-9} textAnchor="middle" fontSize={11} fill="#d5ecf7">
						מרחק {layout.barUnit}
					</text>
				</g>
			</svg>
			<p className="m-0 text-[12px] opacity-70">
				קרבה במפה = דמיון בתשובות. לצירים אין כיוון או משמעות קבועה. נאמנות המפה: r ={' '}
				{fidelity.r.toFixed(2)} · מתח {fidelity.stress.toFixed(2)} · שני הצירים נושאים{' '}
				{Math.round(fidelity.varianceRatio * 100)}% מהמבנה.
			</p>
		</div>
	);
}
