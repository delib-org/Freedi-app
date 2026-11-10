import m from 'mithril';

/** The app's few icons, drawn in the current text colour and hidden from screen readers. */

const HIDDEN = { 'aria-hidden': 'true', focusable: 'false' } as const;
const STROKED = {
	fill: 'none',
	stroke: 'currentColor',
	'stroke-linecap': 'round',
	'stroke-linejoin': 'round',
} as const;

function strokedIcon(size: number, strokeWidth: number, shapes: m.Children): m.Vnode {
	return m(
		'svg',
		{
			width: size,
			height: size,
			viewBox: '0 0 24 24',
			...HIDDEN,
			...STROKED,
			'stroke-width': strokeWidth,
		},
		shapes,
	);
}

export function accessibilityIcon(): m.Vnode {
	return m('svg', { width: 24, height: 24, viewBox: '0 0 24 24', ...HIDDEN }, [
		m('circle', { cx: 12, cy: 4, r: 2, fill: 'currentColor' }),
		m('path', {
			d: 'M4 7.5 12 9l8-1.5M12 9v5m0 0-3.5 7M12 14l3.5 7',
			...STROKED,
			'stroke-width': 2,
		}),
	]);
}

export function closeIcon(): m.Vnode {
	return strokedIcon(20, 2.2, m('path', { d: 'M6 6l12 12M18 6L6 18' }));
}

export function checkIcon(size: number): m.Vnode {
	return strokedIcon(size, 3, m('path', { d: 'M5 12.5l4.5 4.5L19 7.5' }));
}

export function lockIcon(): m.Vnode {
	return strokedIcon(20, 2, [
		m('rect', { x: 5, y: 11, width: 14, height: 10, rx: 2 }),
		m('path', { d: 'M8 11V7a4 4 0 0 1 8 0v4' }),
	]);
}

export function infoIcon(): m.Vnode {
	return strokedIcon(22, 2, [
		m('circle', { cx: 12, cy: 12, r: 9 }),
		m('path', { d: 'M12 11v5M12 7.5v.01' }),
	]);
}

const HANDLE_DOTS: ReadonlyArray<readonly [number, number]> = [
	[7, 6],
	[19, 6],
	[7, 17],
	[19, 17],
	[7, 28],
	[19, 28],
];

export function dragHandleIcon(): m.Vnode {
	return m(
		'svg',
		{ width: 26, height: 34, viewBox: '0 0 26 34', fill: 'currentColor', ...HIDDEN },
		HANDLE_DOTS.map(([cx, cy]) => m('circle', { cx, cy, r: 3.2 })),
	);
}
