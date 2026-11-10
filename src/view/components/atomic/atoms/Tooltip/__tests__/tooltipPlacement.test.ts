import { resolvePlacement, viewportShift, VIEWPORT_MARGIN_PX } from '../tooltipPlacement';

describe('tooltipPlacement', () => {
	describe('resolvePlacement', () => {
		const VIEWPORT_HEIGHT = 700;
		const HEIGHT = 100;

		it('keeps the requested side when it fits', () => {
			expect(resolvePlacement('top', { top: 300, bottom: 340 }, HEIGHT, VIEWPORT_HEIGHT)).toBe(
				'top',
			);
			expect(resolvePlacement('bottom', { top: 300, bottom: 340 }, HEIGHT, VIEWPORT_HEIGHT)).toBe(
				'bottom',
			);
		});

		it('moves below when there is no room above', () => {
			expect(resolvePlacement('top', { top: 20, bottom: 60 }, HEIGHT, VIEWPORT_HEIGHT)).toBe(
				'bottom',
			);
			expect(resolvePlacement('top-left', { top: 20, bottom: 60 }, HEIGHT, VIEWPORT_HEIGHT)).toBe(
				'bottom-left',
			);
		});

		it('moves above when there is no room below', () => {
			expect(resolvePlacement('bottom', { top: 640, bottom: 680 }, HEIGHT, VIEWPORT_HEIGHT)).toBe(
				'top',
			);
		});

		it('stays put when neither side fits', () => {
			expect(resolvePlacement('top', { top: 20, bottom: 680 }, HEIGHT, VIEWPORT_HEIGHT)).toBe(
				'top',
			);
		});

		it('leaves side positions alone', () => {
			expect(resolvePlacement('left', { top: 0, bottom: 40 }, HEIGHT, VIEWPORT_HEIGHT)).toBe(
				'left',
			);
		});
	});

	describe('viewportShift', () => {
		const VIEWPORT_WIDTH = 375;

		it('does not move a bubble that is on the screen', () => {
			expect(viewportShift(100, 260, VIEWPORT_WIDTH)).toBe(0);
		});

		it('pushes a bubble in from the left edge', () => {
			expect(viewportShift(-20, 140, VIEWPORT_WIDTH)).toBe(20 + VIEWPORT_MARGIN_PX);
		});

		it('pulls a bubble in from the right edge', () => {
			expect(viewportShift(280, 400, VIEWPORT_WIDTH)).toBe(
				VIEWPORT_WIDTH - VIEWPORT_MARGIN_PX - 400,
			);
		});

		it('does nothing when the screen has no width to measure', () => {
			expect(viewportShift(0, 0, 0)).toBe(0);
		});
	});
});
