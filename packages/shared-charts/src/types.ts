/**
 * Chart geometry types. Everything here is a plain value: no DOM, no colour,
 * no framework. A renderer (Mithril in Agora, React in Studio) walks
 * `ChartGeometry.primitives` and emits SVG elements carrying the BEM classes
 * below; `styles/_chart.scss` gives those classes their colour from the
 * `--chart-*` tokens of whichever app is rendering.
 */

export type Granularity = 'day' | 'week' | 'month';

/** One of six categorical colour slots (`--chart-1` … `--chart-6`). */
export type Slot = 1 | 2 | 3 | 4 | 5 | 6;

/** A slot, or the neutral "not a category" colour. */
export type SlotOrMuted = Slot | 'muted';

export interface Series {
	id: string;
	label: string;
	values: number[];
	slot: Slot;
}

export interface HBarRow {
	label: string;
	/** `null` = no value yet; renders a zero-width muted bar plus `note`. */
	value: number | null;
	slot?: Slot;
	/** Per-row maximum (defaults to the largest value in the chart). */
	max?: number;
	/** Small text printed instead of the value (e.g. "no score yet"). */
	note?: string;
}

export interface StripPart {
	label: string;
	value: number;
	slot: SlotOrMuted;
	icon?: string;
}

export type ChartSpec =
	| {
			kind: 'line';
			keys: string[];
			granularity: Granularity;
			series: Series[];
			yMax?: number;
			yDomainFrom?: 'zero' | 'data';
			showDots?: boolean;
			unit?: string;
	  }
	| {
			kind: 'sparkline';
			keys: string[];
			values: number[];
			slot?: Slot;
			variant?: 'line' | 'bars';
	  }
	| {
			kind: 'bars';
			keys: string[];
			granularity: Granularity;
			series: [Series];
			yMax?: number;
			unit?: string;
	  }
	| {
			kind: 'stackedBars';
			categories: string[];
			series: Series[];
			normalize?: boolean;
			unit?: string;
	  }
	| { kind: 'hbars'; rows: HBarRow[]; unit?: string }
	| {
			kind: 'histogram';
			values: number[];
			binCount?: number;
			highlightValue?: number;
			highlightLabel?: string;
	  }
	| { kind: 'strip'; parts: StripPart[] };

export type ChartKind = ChartSpec['kind'];

export interface Padding {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

export interface LayoutOptions {
	width?: number;
	height?: number;
	dir?: 'ltr' | 'rtl';
	locale?: string;
	/** Upper bound on x-axis labels; the first and last keys are always kept. */
	maxXLabels?: number;
	padding?: Partial<Padding>;
}

export type TextAnchor = 'start' | 'middle' | 'end';
export type TextBaseline = 'auto' | 'middle' | 'hanging';

interface PrimitiveBase {
	/** BEM class, e.g. `chart__bar--s2`. Never a colour. */
	cls: string;
}

export interface RectPrimitive extends PrimitiveBase {
	type: 'rect';
	x: number;
	y: number;
	w: number;
	h: number;
	rx?: number;
	/** Bucket index this shape belongs to (tooltips, focus). */
	hit?: number;
}

export interface PathPrimitive extends PrimitiveBase {
	type: 'path';
	d: string;
	hit?: number;
	/** Bounding box of a bar/segment drawn as a path (for tests and tooltips). */
	box?: { x: number; y: number; w: number; h: number };
}

export interface LinePrimitive extends PrimitiveBase {
	type: 'line';
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	dashed?: boolean;
}

export interface CirclePrimitive extends PrimitiveBase {
	type: 'circle';
	cx: number;
	cy: number;
	r: number;
	hit?: number;
}

export interface TextPrimitive extends PrimitiveBase {
	type: 'text';
	x: number;
	y: number;
	text: string;
	anchor: TextAnchor;
	baseline: TextBaseline;
}

export type Primitive =
	| RectPrimitive
	| PathPrimitive
	| LinePrimitive
	| CirclePrimitive
	| TextPrimitive;

export interface HitLine {
	label: string;
	/** Already formatted for display. */
	value: string;
	slot?: SlotOrMuted;
}

/** One hover/focus target per bucket, with its tooltip content ready to print. */
export interface Hit {
	index: number;
	x: number;
	y: number;
	w: number;
	h: number;
	label: string;
	lines: HitLine[];
}

export interface LegendItem {
	label: string;
	slot: SlotOrMuted;
	icon?: string;
}

export interface A11yTable {
	head: string[];
	rows: string[][];
}

export interface ChartGeometry {
	viewBox: { w: number; h: number };
	plot: { x: number; y: number; w: number; h: number };
	primitives: Primitive[];
	hits: Hit[];
	legend: LegendItem[];
	a11y: { desc: string; table: A11yTable };
}

/** Everything a layout needs once the options have been resolved. */
export interface LayoutContext {
	width: number;
	height: number;
	dir: 'ltr' | 'rtl';
	locale: string;
	maxXLabels: number;
	plot: { x: number; y: number; w: number; h: number };
}
