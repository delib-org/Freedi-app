import type { ChartGeometry, ChartSpec, LayoutOptions } from './types';
import { resolveFrame } from './layout/frame';
import { layoutLine, layoutSparkline } from './layout/line';
import { layoutBars, layoutStackedBars } from './layout/bars';
import { layoutHBars } from './layout/hbars';
import { layoutHistogram } from './layout/histogram';
import { layoutStrip } from './layout/strip';

/**
 * Turn a chart spec into pure SVG geometry. No DOM, no colour: the result is
 * a list of primitives carrying BEM classes, hit boxes with tooltip text,
 * legend entries and an accessible data table.
 */
export function layoutChart(spec: ChartSpec, opts: LayoutOptions = {}): ChartGeometry {
	const ctx = resolveFrame(spec, opts);
	switch (spec.kind) {
		case 'line':
			return layoutLine(spec, ctx);
		case 'sparkline':
			return layoutSparkline(spec, ctx);
		case 'bars':
			return layoutBars(spec, ctx);
		case 'stackedBars':
			return layoutStackedBars(spec, ctx);
		case 'hbars':
			return layoutHBars(spec, ctx);
		case 'histogram':
			return layoutHistogram(spec, ctx);
		case 'strip':
			return layoutStrip(spec, ctx);
	}
}
