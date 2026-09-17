import { describe, expect, it } from 'vitest';
import { partyShipPlacement, seaFan } from '../seaLayout';
import {
	FRAME_PAD,
	LANDSCAPE,
	PORTRAIT,
	SPRITE_RATIO,
	TAG_HEIGHT,
	hullPolygon,
	overlaps,
	placePennants,
	tagWidth,
	type ChartSpace,
	type PennantShip,
} from '../seaPennants';

const NAMES = [
	'הליכוד',
	'ש״ס',
	'הציונות הדתית',
	'עוצמה יהודית',
	'יהדות התורה',
	'ישר! עם איזנקוט',
	'כחול לבן',
	'רע״ם',
	'הרשימה המשותפת',
	'הדמוקרטים',
	'ישראל ביתנו',
	'ביחד',
];

/** A fleet laid out the way SeaChart lays it out, at the given distances. */
function fleet(space: ChartSpace, distances: number[], crowd: boolean): PennantShip[] {
	return distances.map((distance, index) => {
		const place = partyShipPlacement(distance, index, distances.length, space.width, space.height);
		const width = 1024 * place.scale * (crowd ? 0.5 * space.hullCrowd : 0.62 * space.hull);

		return {
			partyId: `p${index}`,
			name: NAMES[index % NAMES.length],
			x: place.x,
			y: place.y,
			width,
			height: width * SPRITE_RATIO,
		};
	});
}

function berthOf(space: ChartSpace): { x: number; y: number } {
	const fan = seaFan(space.width, space.height);

	return { x: fan.cx, y: fan.cy };
}

function expectNoOverlapInsideFrame(
	placed: Map<string, { box: { x: number; y: number; w: number; h: number } }>,
	space: ChartSpace,
	scale: number,
) {
	const boxes = [...placed.values()].map((entry) => entry.box);
	for (const box of boxes) {
		expect(box.x).toBeGreaterThanOrEqual(FRAME_PAD);
		expect(box.y).toBeGreaterThanOrEqual(FRAME_PAD);
		expect(box.x + box.w).toBeLessThanOrEqual(space.width * scale - FRAME_PAD + 0.01);
		expect(box.y + box.h).toBeLessThanOrEqual(space.viewHeight * scale - FRAME_PAD + 0.01);
	}
	for (let a = 0; a < boxes.length; a += 1) {
		for (let b = a + 1; b < boxes.length; b += 1) {
			expect(overlaps(boxes[a], boxes[b])).toBe(false);
		}
	}
}

describe('placePennants', () => {
	it('flies a lone pennant right above its mast, with no leader', () => {
		const space = LANDSCAPE;
		const scale = 0.7;
		const [ship] = fleet(space, [0.5], false);
		const placed = placePennants([ship], space, scale, berthOf(space));
		const tag = placed.get('p0');

		expect(tag).toBeDefined();
		expect(tag?.leader).toBeNull();
		const mastY = (ship.y - ship.height * 0.93 - space.viewTop) * scale;
		expect(tag!.box.y + TAG_HEIGHT).toBeLessThan(mastY);
		expect(tag!.box.x + tag!.box.w / 2).toBeCloseTo(ship.x * scale, 0);
	});

	it('keeps five pennants apart on a desk-sized landscape frame', () => {
		const space = LANDSCAPE;
		const scale = 0.71;
		const ships = fleet(space, [0.2, 0.25, 0.4, 0.5, 0.9], false);
		const placed = placePennants(ships, space, scale, berthOf(space));

		expect(placed.size).toBe(5);
		expectNoOverlapInsideFrame(placed, space, scale);
	});

	it('keeps twelve pennants apart on a phone-sized portrait frame', () => {
		const space = PORTRAIT;
		const scale = 0.304;
		const distances = [0.2, 0.9, 0.5, 0.45, 0.6, 0.3, 0.55, 0.85, 0.2, 0.25, 0.3, 0.2];
		const placed = placePennants(fleet(space, distances, true), space, scale, berthOf(space));

		expect(placed.size).toBe(12);
		expectNoOverlapInsideFrame(placed, space, scale);
	});

	it('ties a pennant to its ship with a leader whenever it had to move', () => {
		const space = LANDSCAPE;
		const scale = 0.71;
		// Three ships in one column at close ranges: at most one can have the
		// sky over its own mast, and the others must be tied to their hulls.
		const [near, middle, far] = fleet(space, [0.2, 0.45, 0.9], false);
		const ships = [near, { ...middle, x: near.x }, { ...far, x: near.x }];
		const placed = placePennants(ships, space, scale, berthOf(space));
		const moved = [...placed.values()].filter((entry) => entry.leader !== null);
		expect(moved.length).toBeGreaterThanOrEqual(1);
		for (const entry of moved) {
			const leader = entry.leader!;
			// The leader runs from the ship to the pennant's own edge, in chart units.
			const tagCentreX = (entry.box.x + entry.box.w / 2) / scale;
			expect(Math.abs(leader.to.x - tagCentreX)).toBeLessThanOrEqual(
				entry.box.w / scale / 2 + 0.01,
			);
		}
		expectNoOverlapInsideFrame(placed, space, scale);
	});

	it('never covers the ring captions it is told about', () => {
		const space = LANDSCAPE;
		const scale = 0.71;
		const ships = fleet(space, [0.2, 0.25, 0.4, 0.5, 0.9], false);
		const caption = { x: 500, y: 200, w: 60, h: 18 };
		const placed = placePennants(ships, space, scale, berthOf(space), [caption]);
		for (const entry of placed.values()) {
			expect(overlaps(entry.box, caption)).toBe(false);
		}
	});
});

describe('tagWidth', () => {
	it('grows with the name and always leaves room for the dot and padding', () => {
		expect(tagWidth('ביחד')).toBeGreaterThan(36);
		expect(tagWidth('הרשימה המשותפת')).toBeGreaterThan(tagWidth('ביחד'));
	});
});

describe('hullPolygon', () => {
	it('draws a closed silhouette, mirrored about the mast', () => {
		const points = hullPolygon(100, 150).split(' ');
		expect(points).toHaveLength(22);
		const xs = points.map((point) => Number(point.split(',')[0]));
		expect(Math.max(...xs)).toBeCloseTo(23, 0);
		expect(Math.min(...xs)).toBeCloseTo(-23, 0);
	});

	it('is never narrower than a thumb, however far the ship', () => {
		const xs = hullPolygon(10, 15)
			.split(' ')
			.map((point) => Number(point.split(',')[0]));
		expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(40 - 0.5);
	});
});
