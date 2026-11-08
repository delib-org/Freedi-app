import {
	IMAGE_ZOOM,
	RESTING_TRANSFORM,
	clampPan,
	distanceBetween,
	isResting,
	midpointOf,
	zoomTo,
} from '../imageZoomMath';

const IMAGE = { width: 800, height: 400 };
const STAGE = { width: 1000, height: 600 };
const CENTRE = { x: 0, y: 0 };

describe('imageZoomMath', () => {
	describe('isResting', () => {
		it('is true at the fitted size and below it', () => {
			expect(isResting(RESTING_TRANSFORM)).toBe(true);
			expect(isResting({ scale: 0.7, x: 0, y: 0 })).toBe(true);
		});

		it('is false once zoomed in', () => {
			expect(isResting({ scale: 1.5, x: 0, y: 0 })).toBe(false);
		});
	});

	describe('distanceBetween / midpointOf', () => {
		it('measures two fingers', () => {
			expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
			expect(midpointOf({ x: 0, y: 10 }, { x: 20, y: 30 })).toEqual({ x: 10, y: 20 });
		});
	});

	describe('clampPan', () => {
		it('keeps a picture that fits the stage centred', () => {
			expect(clampPan({ scale: 1, x: 300, y: -200 }, IMAGE, STAGE)).toEqual({
				scale: 1,
				x: 0,
				y: 0,
			});
		});

		it('lets an overflowing picture travel only as far as it overflows', () => {
			// 800×400 at 2× is 1600×800 on a 1000×600 stage: 300 px and 100 px to spare.
			expect(clampPan({ scale: 2, x: 999, y: -999 }, IMAGE, STAGE)).toEqual({
				scale: 2,
				x: 300,
				y: -100,
			});
			expect(clampPan({ scale: 2, x: 120, y: 40 }, IMAGE, STAGE)).toEqual({
				scale: 2,
				x: 120,
				y: 40,
			});
		});
	});

	describe('zoomTo', () => {
		it('zooms around the centre without moving the picture', () => {
			expect(zoomTo(RESTING_TRANSFORM, 2, CENTRE, IMAGE, STAGE)).toEqual({ scale: 2, x: 0, y: 0 });
		});

		it('keeps the picture point under the anchor where it is', () => {
			const anchor = { x: 100, y: 50 };
			const zoomed = zoomTo(RESTING_TRANSFORM, 2, anchor, IMAGE, STAGE);

			// The point under the anchor before (100, 50 from the picture centre)
			// is at x + 100·2, y + 50·2 afterwards — still under the anchor.
			expect(zoomed.x + 100 * zoomed.scale).toBeCloseTo(anchor.x);
			expect(zoomed.y + 50 * zoomed.scale).toBeCloseTo(anchor.y);
		});

		it('never exceeds the maximum scale', () => {
			expect(zoomTo(RESTING_TRANSFORM, 99, CENTRE, IMAGE, STAGE).scale).toBe(IMAGE_ZOOM.MAX_SCALE);
		});

		it('stops at the fitted size, centred, when zooming back out', () => {
			expect(zoomTo({ scale: 2, x: 120, y: 40 }, 0.2, CENTRE, IMAGE, STAGE)).toEqual(
				RESTING_TRANSFORM,
			);
		});

		it('lets a live pinch dip under the fitted size, down to its floor', () => {
			const pinched = zoomTo(
				RESTING_TRANSFORM,
				0.7,
				{ x: 200, y: 0 },
				IMAGE,
				STAGE,
				IMAGE_ZOOM.PINCH_FLOOR,
			);
			expect(pinched).toEqual({ scale: 0.7, x: 0, y: 0 });

			expect(
				zoomTo(RESTING_TRANSFORM, 0.1, CENTRE, IMAGE, STAGE, IMAGE_ZOOM.PINCH_FLOOR).scale,
			).toBe(IMAGE_ZOOM.PINCH_FLOOR);
		});
	});
});
