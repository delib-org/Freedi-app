import type { ChartKind, ChartSpec, LayoutContext, LayoutOptions, Padding, SlotOrMuted } from '../types';

export const DEFAULT_WIDTH = 600;
export const DEFAULT_HEIGHT = 220;
export const SPARKLINE_WIDTH = 120;
export const SPARKLINE_HEIGHT = 32;
export const STRIP_HEIGHT = 28;
export const HBAR_ROW_HEIGHT = 28;
export const DEFAULT_MAX_X_LABELS = 6;
export const BAR_GAP = 2;
export const BAR_RX = 4;
export const LINE_STROKE = 2;
export const DOT_R = 4;
export const TICK_GAP = 6;
export const TICK_COUNT = 4;
export const Y_TICK_COLUMN = 44;
export const HBAR_LABEL_COLUMN = 120;
export const HBAR_VALUE_COLUMN = 56;

const AXIS_PADDING: Padding = { top: 10, right: 16, bottom: 24, left: Y_TICK_COLUMN };
const SPARK_PADDING: Padding = { top: 2, right: 2, bottom: 2, left: 2 };
const STRIP_PADDING: Padding = { top: 0, right: 0, bottom: 0, left: 0 };
const HBAR_PADDING: Padding = { top: 4, right: HBAR_VALUE_COLUMN, bottom: 4, left: HBAR_LABEL_COLUMN };

function defaultPadding(kind: ChartKind, dir: 'ltr' | 'rtl'): Padding {
	let base: Padding;
	switch (kind) {
		case 'sparkline':
			base = SPARK_PADDING;
			break;
		case 'strip':
			base = STRIP_PADDING;
			break;
		case 'hbars':
			base = HBAR_PADDING;
			break;
		default:
			base = AXIS_PADDING;
	}
	// The tick / label column sits on the reading-start side.
	if (dir === 'rtl') return { ...base, left: base.right, right: base.left };

	return base;
}

function defaultSize(spec: ChartSpec): { width: number; height: number } {
	switch (spec.kind) {
		case 'sparkline':
			return { width: SPARKLINE_WIDTH, height: SPARKLINE_HEIGHT };
		case 'strip':
			return { width: DEFAULT_WIDTH, height: STRIP_HEIGHT };
		case 'hbars':
			return {
				width: DEFAULT_WIDTH,
				height: Math.max(HBAR_ROW_HEIGHT, spec.rows.length * HBAR_ROW_HEIGHT) + HBAR_PADDING.top + HBAR_PADDING.bottom,
			};
		default:
			return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
	}
}

export function resolveFrame(spec: ChartSpec, opts: LayoutOptions = {}): LayoutContext {
	const dir = opts.dir ?? 'ltr';
	const size = defaultSize(spec);
	const width = opts.width ?? size.width;
	const height = opts.height ?? size.height;
	const padding: Padding = { ...defaultPadding(spec.kind, dir), ...opts.padding };
	const maxXLabels = opts.maxXLabels ?? (spec.kind === 'sparkline' ? 0 : DEFAULT_MAX_X_LABELS);

	return {
		width,
		height,
		dir,
		locale: opts.locale ?? 'en',
		maxXLabels,
		plot: {
			x: padding.left,
			y: padding.top,
			w: Math.max(0, width - padding.left - padding.right),
			h: Math.max(0, height - padding.top - padding.bottom),
		},
	};
}

/** `chart__bar--s3`, `chart__strip-part--muted`, … */
export function slotClass(element: string, slot: SlotOrMuted): string {
	return `chart__${element}--${slot === 'muted' ? 'muted' : `s${slot}`}`;
}
