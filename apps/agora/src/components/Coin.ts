import m from 'mithril';

export interface CoinAttrs {
	/** Rendered edge length in px */
	size?: number;
}

/** Gradient and arc ids are document-global: every coin on the page needs its own */
let nextCoinId = 0;

/** The legend, struck into the ring: the state on top, the value below */
export const COIN_STATE = 'REPUBLIC OF ELAIA';
export const COIN_VALUE = 'ONE OBOL';

const CX = 32;
const CY = 32;

interface Leaf {
	x: number;
	y: number;
	angle: number;
}

/**
 * One olive branch of the wreath: pairs of leaves along an arc around the
 * numeral, each springing from the stem and leaning towards the tip, with a
 * last leaf at the tip itself. `from`→`to` are angles in degrees (0 = right,
 * 90 = down), so the left branch sweeps up 104→222 and the right one mirrors it.
 */
function branchLeaves(from: number, to: number): Leaf[] {
	const radius = 12.2;
	const pairs = 4;
	const leaves: Leaf[] = [];
	const sweep = Math.sign(to - from);
	const leafAt = (deg: number, side: number, lean: number): Leaf => {
		const rad = (deg * Math.PI) / 180;
		// Towards the tip along the arc, and away from the centre
		const tx = -Math.sin(rad) * sweep;
		const ty = Math.cos(rad) * sweep;
		const nx = Math.cos(rad);
		const ny = Math.sin(rad);
		const dx = tx + lean * side * nx;
		const dy = ty + lean * side * ny;
		const len = Math.hypot(dx, dy);

		return {
			x: CX + radius * nx + (2.3 * dx) / len,
			y: CY + 1 + radius * ny + (2.3 * dy) / len,
			angle: (Math.atan2(dy, dx) * 180) / Math.PI,
		};
	};
	const step = (to - from) / pairs;

	for (let i = 0; i < pairs; i++) {
		const deg = from + step * i;
		leaves.push(leafAt(deg, 1, 0.75), leafAt(deg + step * 0.35, -1, 0.75));
	}
	leaves.push(leafAt(to - step * 0.2, 0, 0));

	return leaves;
}

const LEAVES: Leaf[] = [...branchLeaves(104, 222), ...branchLeaves(76, -42)];

/** Two olives inside the wreath, low on each branch */
const OLIVES = [
	{ x: 23.2, y: 39.4 },
	{ x: 40.8, y: 39.4 },
];

function arcPoint(deg: number, radius: number): string {
	const rad = (deg * Math.PI) / 180;

	return `${(CX + radius * Math.cos(rad)).toFixed(2)} ${(CY + 1 + radius * Math.sin(rad)).toFixed(2)}`;
}

/** The two stems the leaves hang on */
const STEMS = [
	`M${arcPoint(98, 12.2)}A12.2 12.2 0 0 1 ${arcPoint(226, 12.2)}`,
	`M${arcPoint(82, 12.2)}A12.2 12.2 0 0 0 ${arcPoint(-46, 12.2)}`,
];

/** A serif numeral 1, drawn rather than typed so it never waits for a font */
const NUMERAL = 'M29.8 22.2L34.3 21V38.6L37 39.5V41.6H27.1V39.5L29.8 38.6V26.4L26.9 27.4V25.2Z';

/**
 * The game's coin: one obol of the Republic of Elaia — a fictional olive-hill
 * state whose citizens meet in the agora. A real-looking two-metal coin: a
 * milled edge, a raised rim, a nickel ring carrying the legend in spaced
 * capitals, a bronze core inside a beaded circle, and on it the numeral 1 in
 * an olive wreath. At HUD size the legend melts into texture; the wreath and
 * the 1 still read.
 *
 * Drawn inline, not as an <img>, so its metals are tokens (`--coin-*` in
 * tokens.scss) that a look or a forced-colours screen can re-point.
 */
export function Coin(): m.Component<CoinAttrs> {
	const id = `agora-coin-${++nextCoinId}`;

	return {
		view(vnode) {
			const size = vnode.attrs.size ?? 32;

			return m(
				'svg.coin',
				{
					xmlns: 'http://www.w3.org/2000/svg',
					viewBox: '0 0 64 64',
					width: size,
					height: size,
					'aria-hidden': 'true',
					focusable: 'false',
				},
				[
					m('defs', [
						m('linearGradient', { id: `${id}-ring`, x1: '0', y1: '0', x2: '1', y2: '1' }, [
							m('stop.coin__stop--ring-hi', { offset: '0' }),
							m('stop.coin__stop--ring', { offset: '0.55' }),
							m('stop.coin__stop--ring-lo', { offset: '1' }),
						]),
						m('linearGradient', { id: `${id}-core`, x1: '0', y1: '0', x2: '1', y2: '1' }, [
							m('stop.coin__stop--core-hi', { offset: '0' }),
							m('stop.coin__stop--core', { offset: '0.5' }),
							m('stop.coin__stop--core-lo', { offset: '1' }),
						]),
						// The legend's baselines: over the top clockwise, under the bottom anticlockwise
						m('path', { id: `${id}-top`, d: 'M9.2 32A22.8 22.8 0 0 1 54.8 32' }),
						m('path', { id: `${id}-bottom`, d: 'M6.2 32A25.8 25.8 0 0 0 57.8 32' }),
					]),
					m('circle.coin__ring', { cx: CX, cy: CY, r: 30.6, fill: `url(#${id}-ring)` }),
					// The reeded edge and the raised rim inside it
					m('circle.coin__mill', { cx: CX, cy: CY, r: 30.6 }),
					m('circle.coin__rim', { cx: CX, cy: CY, r: 28.4 }),
					m('text.coin__legend', [
						m('textPath', { href: `#${id}-top`, startOffset: '50%' }, COIN_STATE),
					]),
					m('text.coin__legend', [
						m('textPath', { href: `#${id}-bottom`, startOffset: '50%' }, COIN_VALUE),
					]),
					m('circle.coin__stop-dot', { cx: 6.4, cy: 33.6, r: 0.9 }),
					m('circle.coin__stop-dot', { cx: 57.6, cy: 33.6, r: 0.9 }),
					m('circle.coin__core', { cx: CX, cy: CY, r: 19.4, fill: `url(#${id}-core)` }),
					m('circle.coin__beads', { cx: CX, cy: CY, r: 17.4 }),
					m('g.coin__wreath', [
						...STEMS.map((d) => m('path.coin__stem', { d })),
						...LEAVES.map((leaf) =>
							m('ellipse.coin__leaf', {
								cx: leaf.x.toFixed(2),
								cy: leaf.y.toFixed(2),
								rx: 2.5,
								ry: 1.1,
								transform: `rotate(${leaf.angle.toFixed(1)} ${leaf.x.toFixed(2)} ${leaf.y.toFixed(2)})`,
							}),
						),
						...OLIVES.map((o) => m('circle.coin__olive', { cx: o.x, cy: o.y, r: 1.15 })),
					]),
					m('path.coin__numeral', { d: NUMERAL }),
				],
			);
		},
	};
}
