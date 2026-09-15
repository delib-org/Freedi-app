import { describe, expect, it } from 'vitest';
import { BUBBLE, bubblePlacement, readBubbleAnchor } from './villageBubble';

const desktop = { width: 1360, frameTop: 60, frameHeight: 700 };

describe('bubblePlacement', () => {
	it('centres the bubble without a tail when no guide is in view', () => {
		const placed = bubblePlacement(desktop, null);
		expect(placed.width).toBe(BUBBLE.MAX_WIDTH);
		expect(placed.left).toBe((1360 - BUBBLE.MAX_WIDTH) / 2);
		expect(placed.tail).toBeNull();
	});

	it('centres the bubble on a phone even with a guide in view', () => {
		const placed = bubblePlacement(
			{ width: 400, frameTop: 60, frameHeight: 600 },
			{ x: 100, y: 300, speaker: 'x' },
		);
		expect(placed.width).toBe(400 - 2 * BUBBLE.GUTTER);
		expect(placed.left).toBe(BUBBLE.GUTTER);
		expect(placed.tail).toBeNull();
	});

	it('hangs the bubble to the right of a figure on the left, tail pointing left at them', () => {
		const placed = bubblePlacement(desktop, { x: 300, y: 400, speaker: 'נעמה' });
		expect(placed.left).toBe(300 + BUBBLE.GAP);
		expect(placed.tail?.side).toBe('left');
		// The bubble rises above the head; the tail still points at it.
		expect(placed.top).toBeLessThan(60 + 400);
		expect(placed.tail?.top).toBe(60 + 400 - BUBBLE.TAIL / 2);
		expect(placed.tail?.left).toBe(placed.left - BUBBLE.TAIL);
	});

	it('hangs the bubble to the left of a figure on the right, tail pointing right at them', () => {
		const placed = bubblePlacement(desktop, { x: 1000, y: 400, speaker: 'נעמה' });
		expect(placed.left).toBe(1000 - BUBBLE.GAP - BUBBLE.MAX_WIDTH);
		expect(placed.tail?.side).toBe('right');
		expect(placed.tail?.left).toBe(placed.left + BUBBLE.MAX_WIDTH);
	});

	it('hangs the bubble on the side of the guide away from the table, narrowing to fit', () => {
		// The guide right of centre, the paper to their left: the bubble goes right, off the table.
		const placed = bubblePlacement(desktop, { x: 900, y: 400, speaker: '', avoidX: 300 });
		expect(placed.tail?.side).toBe('left');
		expect(placed.left).toBe(900 + BUBBLE.GAP);
		expect(placed.width).toBe(1360 - BUBBLE.GUTTER - (900 + BUBBLE.GAP));
		expect(placed.left + placed.width).toBeLessThanOrEqual(1360 - BUBBLE.GUTTER);
	});

	it('takes the other side when the table side has no room to write', () => {
		const placed = bubblePlacement(desktop, { x: 1200, y: 400, speaker: '', avoidX: 600 });
		expect(placed.tail?.side).toBe('right');
		expect(placed.width).toBe(BUBBLE.MAX_WIDTH);
		expect(placed.left).toBe(1200 - BUBBLE.GAP - BUBBLE.MAX_WIDTH);
	});

	it('never climbs over the HUD, never leaves the screen, and keeps room to write', () => {
		const high = bubblePlacement(desktop, { x: 1340, y: 10, speaker: '' });
		expect(high.top).toBe(BUBBLE.TOP_FLOOR);
		expect(high.left).toBeGreaterThanOrEqual(BUBBLE.GUTTER);
		expect(high.left + high.width).toBeLessThanOrEqual(1360 - BUBBLE.GUTTER);
		const low = bubblePlacement(desktop, { x: 300, y: 690, speaker: '' });
		expect(low.maxHeight).toBeGreaterThanOrEqual(BUBBLE.MIN_HEIGHT);
		expect(low.top + BUBBLE.MIN_HEIGHT).toBeLessThanOrEqual(60 + 700 - BUBBLE.BOTTOM_ROOM);
		expect(low.tail!.top).toBeLessThanOrEqual(
			low.top + low.maxHeight - BUBBLE.TAIL_INSET - BUBBLE.TAIL,
		);
	});
});

describe('readBubbleAnchor', () => {
	it('reads a visible anchor', () => {
		expect(
			readBubbleAnchor({ type: 'agora-village-anchor', visible: true, x: 5, y: 6, speaker: 'a' }),
		).toEqual({ x: 5, y: 6, speaker: 'a' });
		expect(
			readBubbleAnchor({ type: 'agora-village-anchor', visible: true, x: 5, y: 6, avoidX: 2 }),
		).toEqual({ x: 5, y: 6, speaker: '', avoidX: 2 });
		expect(
			readBubbleAnchor({ type: 'agora-village-anchor', visible: true, x: 5, y: 6, avoidX: null }),
		).toEqual({ x: 5, y: 6, speaker: '' });
	});

	it('rejects a hidden guide, another message, and bad numbers', () => {
		expect(
			readBubbleAnchor({ type: 'agora-village-anchor', visible: false, x: 5, y: 6 }),
		).toBeNull();
		expect(readBubbleAnchor({ type: 'agora-village-ready', visible: true, x: 5, y: 6 })).toBeNull();
		expect(
			readBubbleAnchor({ type: 'agora-village-anchor', visible: true, x: Number.NaN, y: 6 }),
		).toBeNull();
		expect(readBubbleAnchor('agora-village-anchor')).toBeNull();
	});
});
