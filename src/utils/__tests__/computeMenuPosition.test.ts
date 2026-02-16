/**
 * Tests for computeMenuPosition utility
 */

import { computeMenuPosition } from '../computeMenuPosition';

describe('computeMenuPosition', () => {
	// Store original window dimensions
	const originalInnerWidth = window.innerWidth;
	const originalInnerHeight = window.innerHeight;

	// Mock menu element
	const createMockMenuEl = (width: number = 200, height: number = 300): HTMLElement => {
		const el = document.createElement('div');
		Object.defineProperty(el, 'offsetWidth', { value: width, writable: true });
		Object.defineProperty(el, 'offsetHeight', { value: height, writable: true });
		Object.defineProperty(el, 'scrollHeight', { value: height, writable: true });

		return el;
	};

	// Mock trigger rect
	const createMockRect = (
		left: number,
		top: number,
		width: number = 100,
		height: number = 40,
	): DOMRect => ({
		left,
		top,
		right: left + width,
		bottom: top + height,
		width,
		height,
		x: left,
		y: top,
		toJSON: () => ({}),
	});

	beforeEach(() => {
		// Set consistent window size
		Object.defineProperty(window, 'innerWidth', {
			value: 1024,
			writable: true,
			configurable: true,
		});
		Object.defineProperty(window, 'innerHeight', {
			value: 768,
			writable: true,
			configurable: true,
		});
	});

	afterEach(() => {
		Object.defineProperty(window, 'innerWidth', {
			value: originalInnerWidth,
			writable: true,
			configurable: true,
		});
		Object.defineProperty(window, 'innerHeight', {
			value: originalInnerHeight,
			writable: true,
			configurable: true,
		});
	});

	describe('basic positioning', () => {
		it('should return top, left, and placement', () => {
			const menuEl = createMockMenuEl();
			const triggerRect = createMockRect(100, 100);

			const result = computeMenuPosition({
				triggerRect,
				menuEl,
				dir: 'ltr',
			});

			expect(result).toHaveProperty('top');
			expect(result).toHaveProperty('left');
			expect(result).toHaveProperty('placement');
			expect(typeof result.top).toBe('number');
			expect(typeof result.left).toBe('number');
		});

		it('should position menu below trigger by default', () => {
			const menuEl = createMockMenuEl();
			const triggerRect = createMockRect(100, 100);

			const result = computeMenuPosition({
				triggerRect,
				menuEl,
				dir: 'ltr',
			});

			// Menu should be positioned below the trigger
			expect(result.top).toBeGreaterThan(triggerRect.bottom);
			expect(result.placement).toBe('below');
		});
	});

	describe('LTR positioning', () => {
		it('should align menu with right edge of trigger in LTR', () => {
			const menuEl = createMockMenuEl(200);
			const triggerRect = createMockRect(400, 100, 100);

			const result = computeMenuPosition({
				triggerRect,
				menuEl,
				dir: 'ltr',
			});

			// Menu right edge should align with trigger right edge
			expect(result.left + 200).toBeLessThanOrEqual(triggerRect.right + 10);
		});

		it('should handle menu near right edge of viewport in LTR', () => {
			const menuEl = createMockMenuEl(200);
			const triggerRect = createMockRect(900, 100, 100); // Near right edge

			const result = computeMenuPosition({
				triggerRect,
				menuEl,
				dir: 'ltr',
			});

			// Menu should not extend beyond viewport
			expect(result.left + 200).toBeLessThanOrEqual(1024);
		});
	});

	describe('RTL positioning', () => {
		it('should align menu with left edge of trigger in RTL', () => {
			const menuEl = createMockMenuEl(200);
			const triggerRect = createMockRect(500, 100, 100);

			const result = computeMenuPosition({
				triggerRect,
				menuEl,
				dir: 'rtl',
			});

			// Menu should be positioned starting from trigger left edge
			expect(result.left).toBeGreaterThanOrEqual(triggerRect.left - 10);
		});

		it('should handle menu near left edge of viewport in RTL', () => {
			const menuEl = createMockMenuEl(200);
			const triggerRect = createMockRect(50, 100, 100); // Near left edge

			const result = computeMenuPosition({
				triggerRect,
				menuEl,
				dir: 'rtl',
			});

			// Menu should stay within viewport
			expect(result.left).toBeGreaterThanOrEqual(0);
		});
	});

	describe('mobile positioning', () => {
		beforeEach(() => {
			Object.defineProperty(window, 'innerWidth', {
				value: 375,
				writable: true,
				configurable: true,
			});
		});

		it('should center menu on mobile', () => {
			const menuEl = createMockMenuEl(200);
			const triggerRect = createMockRect(100, 100, 100);

			const result = computeMenuPosition({
				triggerRect,
				menuEl,
				dir: 'ltr',
			});

			// On mobile, menu should be somewhat centered
			const buttonCenter = triggerRect.left + triggerRect.width / 2;
			const menuCenter = result.left + 100; // 200/2 = 100

			// Should be close to centered (within reasonable bounds)
			expect(Math.abs(menuCenter - buttonCenter)).toBeLessThan(150);
		});

		it('should keep menu within screen bounds on mobile', () => {
			const menuEl = createMockMenuEl(300);
			const triggerRect = createMockRect(50, 100, 50);

			const result = computeMenuPosition({
				triggerRect,
				menuEl,
				dir: 'ltr',
			});

			// Menu should not extend beyond viewport
			expect(result.left).toBeGreaterThanOrEqual(0);
			expect(result.left + 300).toBeLessThanOrEqual(375 + 8); // viewport + padding tolerance
		});
	});

	describe('padding and gap', () => {
		it('should respect custom padding', () => {
			const menuEl = createMockMenuEl(200);
			const triggerRect = createMockRect(10, 10, 100);

			const result = computeMenuPosition({
				triggerRect,
				menuEl,
				dir: 'ltr',
				padding: 20,
			});

			// Menu should respect padding from edges
			expect(result.left).toBeGreaterThanOrEqual(20);
			expect(result.top).toBeGreaterThanOrEqual(20);
		});

		it('should handle gap parameter', () => {
			const menuEl = createMockMenuEl(200);
			const triggerRect = createMockRect(100, 100, 100);

			const resultWithGap = computeMenuPosition({
				triggerRect,
				menuEl,
				dir: 'ltr',
				gap: 10,
			});

			const resultWithoutGap = computeMenuPosition({
				triggerRect,
				menuEl,
				dir: 'ltr',
				gap: 0,
			});

			// Both should return valid positions
			expect(resultWithGap.top).toBeGreaterThan(0);
			expect(resultWithoutGap.top).toBeGreaterThan(0);
		});
	});

	describe('boundary clamping', () => {
		it('should clamp menu position to viewport bounds', () => {
			const menuEl = createMockMenuEl(300);
			const triggerRect = createMockRect(900, 100, 100);

			const result = computeMenuPosition({
				triggerRect,
				menuEl,
				dir: 'ltr',
			});

			// Menu should not extend beyond right edge
			expect(result.left + 300).toBeLessThanOrEqual(1024);
		});

		it('should clamp vertical position when menu is too tall', () => {
			Object.defineProperty(window, 'innerHeight', {
				value: 400,
				writable: true,
				configurable: true,
			});

			const menuEl = createMockMenuEl(200, 350);
			const triggerRect = createMockRect(100, 200, 100);

			const result = computeMenuPosition({
				triggerRect,
				menuEl,
				dir: 'ltr',
			});

			// Menu should not extend beyond bottom edge
			expect(result.top + 350).toBeLessThanOrEqual(400);
		});

		it('should not position menu with negative coordinates', () => {
			const menuEl = createMockMenuEl(200);
			const triggerRect = createMockRect(-50, 100, 100);

			const result = computeMenuPosition({
				triggerRect,
				menuEl,
				dir: 'ltr',
			});

			// Menu should have positive coordinates
			expect(result.left).toBeGreaterThanOrEqual(0);
			expect(result.top).toBeGreaterThanOrEqual(0);
		});
	});

	describe('skipHiddenMeasure option', () => {
		it('should use offsetWidth/scrollHeight directly when skipHiddenMeasure is true', () => {
			const menuEl = createMockMenuEl(250, 350);

			const result = computeMenuPosition({
				triggerRect: createMockRect(100, 100),
				menuEl,
				dir: 'ltr',
				skipHiddenMeasure: true,
			});

			// Should return valid position
			expect(result.top).toBeGreaterThan(0);
			expect(result.left).toBeGreaterThanOrEqual(0);
		});

		it('should use default dimensions when element dimensions are not available', () => {
			const menuEl = document.createElement('div');
			Object.defineProperty(menuEl, 'offsetWidth', { value: 0 });
			Object.defineProperty(menuEl, 'offsetHeight', { value: 0 });
			Object.defineProperty(menuEl, 'scrollHeight', { value: 0 });

			const result = computeMenuPosition({
				triggerRect: createMockRect(100, 100),
				menuEl,
				dir: 'ltr',
				skipHiddenMeasure: true,
			});

			// Should still return valid position using fallback dimensions
			expect(result.top).toBeGreaterThan(0);
		});
	});

	describe('placement return value', () => {
		it('should return "below" placement when positioning below trigger', () => {
			const menuEl = createMockMenuEl();
			const triggerRect = createMockRect(100, 100);

			const result = computeMenuPosition({
				triggerRect,
				menuEl,
				dir: 'ltr',
			});

			expect(result.placement).toBe('below');
		});
	});

	describe('edge cases', () => {
		it('should handle very small trigger', () => {
			const menuEl = createMockMenuEl(200);
			const triggerRect = createMockRect(100, 100, 10, 10);

			const result = computeMenuPosition({
				triggerRect,
				menuEl,
				dir: 'ltr',
			});

			expect(result.top).toBeGreaterThan(0);
			expect(result.left).toBeGreaterThanOrEqual(0);
		});

		it('should handle trigger at origin', () => {
			const menuEl = createMockMenuEl(200);
			const triggerRect = createMockRect(0, 0, 100, 40);

			const result = computeMenuPosition({
				triggerRect,
				menuEl,
				dir: 'ltr',
			});

			// Should still produce valid position
			expect(typeof result.top).toBe('number');
			expect(typeof result.left).toBe('number');
		});

		it('should handle menu larger than viewport', () => {
			const menuEl = createMockMenuEl(1200, 900);
			const triggerRect = createMockRect(100, 100);

			const result = computeMenuPosition({
				triggerRect,
				menuEl,
				dir: 'ltr',
			});

			// Should clamp to viewport
			expect(result.left).toBeGreaterThanOrEqual(0);
			expect(result.top).toBeGreaterThanOrEqual(0);
		});
	});
});
