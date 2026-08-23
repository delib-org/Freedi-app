import { describe, expect, it } from 'vitest';
import {
	dayPhaseForIsland,
	islandDepth,
	islandPosition,
	proximityBandOf,
	proximityBands,
	sailorPlacement,
	shipLayout,
} from '../seaLayout';

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
		const left = islandPosition(100, 100, W, H);
		const right = islandPosition(0, 100, W, H);
		expect(left.x).toBeLessThan(right.x);
		// near row (posY 100) has no squeeze: full width reach
		expect(right.x).toBeCloseTo(W, 5);
		expect(left.x).toBeCloseTo(0, 5);
	});

	it('keeps the archipelago inside the sea band (never on the horizon)', () => {
		expect(islandPosition(50, 0, W, H).y).toBeCloseTo(H * 0.3, 5);
		expect(islandPosition(50, 100, W, H).y).toBeCloseTo(H * 0.78, 5);
		expect(islandPosition(50, 40, W, H).y).toBeGreaterThan(H * 0.3);
		expect(islandPosition(50, 40, W, H).y).toBeLessThan(H * 0.78);
	});

	it('squeezes far rows toward the center (perspective frustum)', () => {
		const farEdge = islandPosition(0, 0, W, H);
		const nearEdge = islandPosition(0, 100, W, H);
		// same posX, but the far one sits closer to the center line
		expect(Math.abs(farEdge.x - W / 2)).toBeLessThan(Math.abs(nearEdge.x - W / 2));
		// center islands stay centered at any depth
		expect(islandPosition(50, 0, W, H).x).toBeCloseTo(W / 2, 5);
	});
});

describe('islandDepth', () => {
	it('makes near islands larger and crisp, far islands smaller and hazy', () => {
		const near = islandDepth(100);
		const far = islandDepth(0);
		expect(near.scale).toBeCloseTo(1.15, 5);
		expect(near.haze).toBeCloseTo(0, 5);
		expect(far.scale).toBeCloseTo(0.6, 5);
		expect(far.haze).toBeCloseTo(0.35, 5);
		expect(islandDepth(50).scale).toBeGreaterThan(far.scale);
		expect(islandDepth(50).scale).toBeLessThan(near.scale);
	});

	it('clamps out-of-range posY', () => {
		expect(islandDepth(-20)).toEqual(islandDepth(0));
		expect(islandDepth(140)).toEqual(islandDepth(100));
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

describe('proximity bands', () => {
	it('names the band a ship is actually drawn in', () => {
		// the band a distance is labelled with must contain the y shipLayout gives it
		for (const distance of [0, 0.2, 0.34, 0.5, 0.7, 0.95, 1]) {
			const y = shipLayout(distance, 0, 1, W, H).y;
			const band = proximityBands(H).find((entry) => entry.key === proximityBandOf(distance));
			expect(band).toBeDefined();
			expect(y).toBeGreaterThanOrEqual(band!.top);
			expect(y).toBeLessThanOrEqual(band!.bottom);
		}
	});

	it('puts an unknown distance where shipLayout parks it — the far band', () => {
		expect(proximityBandOf(null)).toBe('far');
		expect(proximityBandOf(undefined)).toBe('far');
		expect(shipLayout(null, 0, 1, W, H).y).toBeLessThan(
			proximityBands(H).find((band) => band.key === 'far')!.bottom,
		);
	});

	it('stacks the bands nearest-lowest with no gap between them', () => {
		const [far, middle, near] = proximityBands(H);
		expect(far.key).toBe('far');
		expect(near.key).toBe('near');
		expect(far.bottom).toBeCloseTo(middle.top, 5);
		expect(middle.bottom).toBeCloseTo(near.top, 5);
		expect(near.bottom).toBeGreaterThan(middle.bottom);
	});

	it('clamps distances outside 0..1', () => {
		expect(proximityBandOf(-3)).toBe('near');
		expect(proximityBandOf(7)).toBe('far');
	});
});
