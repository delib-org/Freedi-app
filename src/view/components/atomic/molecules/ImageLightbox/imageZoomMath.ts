/**
 * Pure zoom/pan maths for the image lightbox.
 *
 * A transform is `translate(x, y) scale(scale)` applied to an image that sits
 * centred in its stage, so `x`/`y` are the image centre's offset from the
 * stage centre in screen pixels, and anchors are measured from that centre too.
 */

export interface ZoomTransform {
	scale: number;
	x: number;
	y: number;
}

export interface Size {
	width: number;
	height: number;
}

export interface Point {
	x: number;
	y: number;
}

export const IMAGE_ZOOM = {
	/** The picture fitted to the screen. Zooming out from here closes the viewer. */
	MIN_SCALE: 1,
	MAX_SCALE: 4,
	/** One press of a zoom button, or one +/- key. */
	BUTTON_STEP: 1.5,
	DOUBLE_TAP_SCALE: 2.5,
	/** How small a pinch may shrink the picture before the fingers lift. */
	PINCH_FLOOR: 0.5,
	/** A pinch released below this closes the viewer; above it, it springs back. */
	CLOSE_BELOW: 0.85,
	WHEEL_SENSITIVITY: 0.0015,
	/** Wheel events closer together than this are one continuous scroll. */
	WHEEL_GESTURE_GAP_MS: 300,
	DOUBLE_TAP_MS: 300,
	/** Movement under this is a tap, not a drag. */
	TAP_SLOP_PX: 8,
	DOUBLE_TAP_SLOP_PX: 30,
} as const;

export const RESTING_TRANSFORM: ZoomTransform = { scale: 1, x: 0, y: 0 };

const SCALE_EPSILON = 0.001;

function clamp(value: number, min: number, max: number): number {
	// `|| 0` turns the -0 a zero-width range produces into a plain 0.
	return Math.min(Math.max(value, min), max) || 0;
}

/** Is the picture at (or below) its fitted size? */
export function isResting(transform: ZoomTransform): boolean {
	return transform.scale <= IMAGE_ZOOM.MIN_SCALE + SCALE_EPSILON;
}

export function distanceBetween(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpointOf(a: Point, b: Point): Point {
	return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Keep the picture from being dragged off the stage: it may only travel as far
 * as it overflows, and a picture smaller than the stage stays centred.
 */
export function clampPan(transform: ZoomTransform, image: Size, stage: Size): ZoomTransform {
	const maxX = Math.max(0, (image.width * transform.scale - stage.width) / 2);
	const maxY = Math.max(0, (image.height * transform.scale - stage.height) / 2);

	return {
		scale: transform.scale,
		x: clamp(transform.x, -maxX, maxX),
		y: clamp(transform.y, -maxY, maxY),
	};
}

/**
 * Zoom to `nextScale`, keeping the picture point under `anchor` where it is.
 * `floor` lets a live pinch dip under the fitted size; there the picture simply
 * shrinks around the centre.
 */
export function zoomTo(
	transform: ZoomTransform,
	nextScale: number,
	anchor: Point,
	image: Size,
	stage: Size,
	floor: number = IMAGE_ZOOM.MIN_SCALE,
): ZoomTransform {
	const scale = clamp(nextScale, floor, IMAGE_ZOOM.MAX_SCALE);
	if (scale <= IMAGE_ZOOM.MIN_SCALE) {
		return { scale, x: 0, y: 0 };
	}

	const ratio = scale / transform.scale;

	return clampPan(
		{
			scale,
			x: anchor.x - (anchor.x - transform.x) * ratio,
			y: anchor.y - (anchor.y - transform.y) * ratio,
		},
		image,
		stage,
	);
}
