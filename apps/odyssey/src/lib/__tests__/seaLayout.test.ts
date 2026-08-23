import { describe, expect, it } from 'vitest';
import {
	dayPhaseForIsland,
	fanAngle,
	islandDepth,
	islandPosition,
	partyShipPlacement,
	proximityBandOf,
	rangeRings,
	sailorPlacement,
	seaFan,
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

describe('the fan', () => {
	it('places a party ship by its distance from the player, not by its lane', () => {
		const fan = seaFan(W, H);
		const near = partyShipPlacement(0, 0, 4, W, H);
		const far = partyShipPlacement(1, 0, 4, W, H);
		const reach = (p: { x: number; y: number }) =>
			Math.hypot((p.x - fan.cx) / fan.rx, (p.y - fan.cy) / fan.ry);
		expect(reach(near)).toBeLessThan(reach(far));
		// same distance, different lanes → same ring
		expect(reach(partyShipPlacement(0.5, 0, 4, W, H))).toBeCloseTo(
			reach(partyShipPlacement(0.5, 3, 4, W, H)),
			5,
		);
	});

	it('fixes the lane by index, never by distance', () => {
		expect(fanAngle(1, 3)).toBe(fanAngle(1, 3));
		expect(fanAngle(0, 3)).toBeGreaterThan(fanAngle(2, 3));
		// lane 0 is the rightmost: a Hebrew reader starts on the right
		expect(partyShipPlacement(0.5, 0, 3, W, H).x).toBeGreaterThan(
			partyShipPlacement(0.5, 2, 3, W, H).x,
		);
	});

	it('keeps the whole fan on screen', () => {
		for (const count of [1, 5, 12]) {
			for (let index = 0; index < count; index++) {
				for (const distance of [0, 0.5, 1, null]) {
					const p = partyShipPlacement(distance, index, count, W, H);
					expect(p.x).toBeGreaterThan(0);
					expect(p.x).toBeLessThan(W);
					expect(p.y).toBeGreaterThan(0);
					expect(p.y).toBeLessThan(H);
				}
			}
		}
	});

	it('parks unknown distances on the outer water, faded', () => {
		const unknown = partyShipPlacement(null, 0, 1, W, H);
		expect(unknown.alpha).toBe(0.45);
		expect(unknown.scale).toBeCloseTo(0.075 + 0.11 * 0.1, 5);
	});

	it('draws a ring for each third, growing outward', () => {
		const rings = rangeRings(W, H);
		expect(rings).toHaveLength(3);
		expect(rings[0].rx).toBeLessThan(rings[1].rx);
		expect(rings[1].rx).toBeLessThan(rings[2].rx);
		// the outermost ring is the fan itself
		expect(rings[2].rx).toBeCloseTo(seaFan(W, H).rx, 5);
	});

	it("puts a ship of a given third inside that third's ring", () => {
		const fan = seaFan(W, H);
		const rings = rangeRings(W, H);
		const ringIndex = { near: 0, middle: 1, far: 2 };
		for (const distance of [0, 0.2, 0.34, 0.5, 0.7, 0.99]) {
			const p = partyShipPlacement(distance, 0, 1, W, H);
			const reach = Math.hypot((p.x - fan.cx) / fan.rx, (p.y - fan.cy) / fan.ry);
			const ring = rings[ringIndex[proximityBandOf(distance)]];
			expect(reach).toBeLessThanOrEqual(ring.rx / fan.rx + 1e-9);
		}
	});

	it('clamps distances outside 0..1', () => {
		expect(proximityBandOf(-3)).toBe('near');
		expect(proximityBandOf(7)).toBe('far');
		expect(proximityBandOf(null)).toBe('far');
	});
});
