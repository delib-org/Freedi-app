import m from 'mithril';

/**
 * Small line icons for the teacher console (24 grid, stroke = currentColor).
 * Decorative: the label next to each icon carries the meaning. Inline SVG is
 * not mirrored by the browser in RTL, so the play triangle keeps its direction.
 */

export type ConsoleIconName =
	| 'play'
	| 'pause'
	| 'stop'
	| 'lock'
	| 'check'
	| 'sort'
	| 'barChart'
	| 'ballot'
	| 'shuffle'
	| 'reset';

interface ShapeSpec {
	tag: 'path' | 'rect';
	attrs: Record<string, string>;
}

const path = (d: string): ShapeSpec => ({ tag: 'path', attrs: { d } });
const rect = (x: string, y: string, width: string, height: string, rx = '1'): ShapeSpec => ({
	tag: 'rect',
	attrs: { x, y, width, height, rx },
});

const SHAPES: Record<ConsoleIconName, readonly ShapeSpec[]> = {
	play: [path('M7 4.5v15l12-7.5z')],
	pause: [rect('6', '4', '4', '16'), rect('14', '4', '4', '16')],
	stop: [rect('5', '5', '14', '14', '2')],
	lock: [rect('4', '11', '16', '10', '2'), path('M8 11V7a4 4 0 0 1 8 0v4')],
	check: [path('M20 6 9 17l-5-5')],
	sort: [path('m21 16-4 4-4-4'), path('M17 20V4'), path('m3 8 4-4 4 4'), path('M7 4v16')],
	barChart: [path('M3 3v18h18'), path('M18 17V9'), path('M13 17V5'), path('M8 17v-3')],
	ballot: [
		path('m9 12 2 2 4-4'),
		path('M5 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12H5z'),
		path('M22 19H2'),
	],
	shuffle: [
		path('M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22'),
		path('m18 2 4 4-4 4'),
		path('M2 6h1.9c1.5 0 2.9.9 3.6 2.2'),
		path('M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8'),
		path('m18 14 4 4-4 4'),
	],
	reset: [path('M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8'), path('M3 3v5h5')],
};

export function icon(name: ConsoleIconName): m.Vnode {
	return m(
		'svg.console-icon',
		{
			viewBox: '0 0 24 24',
			fill: 'none',
			stroke: 'currentColor',
			'stroke-width': '2',
			'stroke-linecap': 'round',
			'stroke-linejoin': 'round',
			'aria-hidden': 'true',
			focusable: 'false',
		},
		SHAPES[name].map((shape) => m(shape.tag, shape.attrs)),
	);
}
