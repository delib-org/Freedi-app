import { describe, expect, it } from 'vitest';
import { dayPhaseForIsland, islandPosition, sailorPlacement, shipLayout } from '../seaLayout';

const W = 1280;
const H = 720;

describe('shipLayout', () => {
	it('keeps the original PartySea formulas', () => {
		// distance 0, first of 4 ships
		const near = shipLayout(0, 0, 4, W, H);
		expect(near.x).toBeCloseTo(W * (0.12 + (0.76 * 0.5) / 4), 5);
		expect(near.y).toBeCloseTo(H * 0.7, 5);
		expect(near.scale).toBeCloseTo(0.185, 5);
		expect(near.alpha).toBeCloseTo(1, 5);

		// distance 1 → far horizon, small and faint
		const far = shipLayout(1, 3, 4, W, H);
		expect(far.y).toBeCloseTo(H * 0.2, 5);
		expect(far.scale).toBeCloseTo(0.075, 5);
		expect(far.alpha).toBeCloseTo(0.55, 5);
	});

	it('parks unknown distances far and faded (0.9 / 0.45)', () => {
		const unknown = shipLayout(null, 0, 1, W, H);
		expect(unknown.y).toBeCloseTo(H * (0.2 + 0.5 * 0.1), 5);
		expect(unknown.alpha).toBe(0.45);
	});

	it('fixes x by index, never by distance', () => {
		const a = shipLayout(0, 1, 3, W, H);
		const b = shipLayout(1, 1, 3, W, H);
		expect(a.x).toBe(b.x);
	});
});

describe('islandPosition', () => {
	it('flips posX because admin data measures from the right (RTL chart)', () => {
		expect(islandPosition(25, 40, W, H)).toEqual({ x: W * 0.75, y: H * 0.4 });
		expect(islandPosition(0, 0, W, H)).toEqual({ x: W, y: 0 });
		expect(islandPosition(100, 100, W, H)).toEqual({ x: 0, y: H });
	});
});

describe('dayPhaseForIsland', () => {
	it('advances midday → afternoon across the voyage', () => {
		expect(dayPhaseForIsland(0, 5)).toBeCloseTo(0.45, 5);
		expect(dayPhaseForIsland(4, 5)).toBeCloseTo(0.8, 5);
		expect(dayPhaseForIsland(2, 5)).toBeCloseTo(0.625, 5);
	});

	it('handles single-island voyages and out-of-range indices', () => {
		expect(dayPhaseForIsland(0, 1)).toBeCloseTo(0.45, 5);
		expect(dayPhaseForIsland(9, 5)).toBeCloseTo(0.8, 5);
	});
});

describe('sailorPlacement', () => {
	it('spreads sailors evenly and places them by distance band', () => {
		const close = sailorPlacement(0, 0, 2, W, H);
		const far = sailorPlacement(1, 1, 2, W, H);
		expect(close.y).toBeCloseTo(H * 0.7, 5);
		expect(far.y).toBeCloseTo(H * 0.2, 5);
		expect(close.x).toBeLessThan(far.x);
	});

	it('clamps distances outside 0..1', () => {
		expect(sailorPlacement(5, 0, 1, W, H).y).toBeCloseTo(H * 0.2, 5);
		expect(sailorPlacement(-1, 0, 1, W, H).y).toBeCloseTo(H * 0.7, 5);
	});
});
