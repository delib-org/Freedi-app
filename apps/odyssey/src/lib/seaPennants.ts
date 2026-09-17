/**
 * Pure geometry for the sea chart's pennants and hulls — where a ship's name
 * flies, and what part of a hull takes a tap. `seaLayout` says where ships
 * ride; this says how they are labelled and touched. No DOM beyond an
 * optional canvas for measuring text, so it runs in tests unchanged.
 */

/**
 * The chart's own coordinate space; the SVG scales to whatever width it gets.
 *
 * Two of them. `seaLayout` places everything as fractions of a width and a
 * height, so a tall space is as true a reading of the water as a wide one —
 * and on a phone the wide one came out 140px high with twelve ships and their
 * names in it. Narrow frames get the portrait space: the same lanes, the same
 * rings, with room between them.
 *
 * `viewTop` / `viewHeight` are the band of that space the player sees: the
 * maths needs the whole frame, but the bottom is empty foreground water. What
 * stays is the sky with the city on it (a far ship's pennant flies there),
 * every ship, and enough water in front of the berth to be sailing on.
 */
export interface ChartSpace {
	width: number;
	height: number;
	viewTop: number;
	viewHeight: number;
	/** How much larger than the landscape space every hull is drawn. */
	hull: number;
	/** The same, with the whole fleet on the water. */
	hullCrowd: number;
}

export const LANDSCAPE: ChartSpace = {
	width: 1000,
	height: 620,
	viewTop: 20,
	viewHeight: 456,
	hull: 1,
	hullCrowd: 1,
};
/** Hulls are sized against the width, and a phone has little of it: the
 *  portrait space draws every hull half again as large so a ship is a ship
 *  and not a buoy — less so with twelve of them abreast. */
export const PORTRAIT: ChartSpace = {
	width: 1000,
	height: 1300,
	viewTop: 42,
	viewHeight: 956,
	hull: 1.5,
	hullCrowd: 1.15,
};
/** Frames narrower than this, in CSS pixels, get the portrait space. */
export const PORTRAIT_BELOW = 520;

/** The 2.5D hull sprite (public/assets/ship.png): height over width. */
export const SPRITE_RATIO = 1536 / 1024;
/** Where the sprite's waterline sits: the image hangs this far above the anchor. */
export const SPRITE_ABOVE_WATER = 0.93;
/** The player's own hull, in chart units of a landscape space. */
export const YOUR_SHIP_WIDTH = 118;

/**
 * The hull's outline inside its own sprite: x as a fraction of the sprite
 * width from the centreline, y as a fraction of its height from the top.
 * Masthead, sails, hull, keel. The sails are the widest part and reach 0.23
 * either side — the rest of the sprite is transparent, and a target that
 * covered it reached over the ship sailing alongside and took its taps.
 */
const HULL_OUTLINE: ReadonlyArray<readonly [number, number]> = [
	[0, 0.03],
	[0.06, 0.06],
	[0.11, 0.14],
	[0.16, 0.22],
	[0.2, 0.33],
	[0.23, 0.45],
	[0.22, 0.6],
	[0.17, 0.72],
	[0.16, 0.85],
	[0.1, 0.95],
	[0, 0.975],
];
export const OUTLINE_SPAN = 0.46;
/** A far hull is a sliver; its outline is never narrower than this many chart
 *  units. The pennant above it is the thumb-sized target anyway. */
export const MIN_HIT_WIDTH = 40;

/** Pennant geometry, in CSS pixels — the pennants are HTML, not SVG, so a
 *  name is the same size on a phone as on a desk. */
export const TAG_HEIGHT = 24;
const TAG_GAP = 5;
const TAG_STACK = 3;
export const FRAME_PAD = 3;
const TAG_LIFTS = 8;
/** The berth label under the player's boat, which no pennant may cover. */
const BERTH_LABEL_HEIGHT = 26;

/** The hull's silhouette as an SVG polygon around its waterline anchor. */
export function hullPolygon(width: number, height: number): string {
	const span = Math.max(width, MIN_HIT_WIDTH / OUTLINE_SPAN);
	const top = -height * SPRITE_ABOVE_WATER;
	const side = (sign: 1 | -1, points: ReadonlyArray<readonly [number, number]>) =>
		points.map(([fx, fy]) => `${(sign * fx * span).toFixed(1)},${(top + fy * height).toFixed(1)}`);

	return [...side(1, HULL_OUTLINE), ...side(-1, [...HULL_OUTLINE].reverse())].join(' ');
}

/** The pennant's type, exactly as `.ship-tag` sets it, so a name can be
 *  measured before it is drawn. */
const TAG_FONT = '600 12.5px Arial, Helvetica, sans-serif';
/** Border, padding, the colour dot and its gap, and a little slack. */
const TAG_CHROME = 36;
/** Per character, when there is no canvas to measure with (tests). */
const TAG_FALLBACK_CHAR = 7;

let textMeter: CanvasRenderingContext2D | null | undefined;

/** How wide a name renders in pennant type, in CSS pixels. */
export function measureName(name: string): number {
	if (textMeter === undefined) {
		textMeter =
			typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
		if (textMeter) textMeter.font = TAG_FONT;
	}

	return textMeter ? textMeter.measureText(name).width : name.length * TAG_FALLBACK_CHAR;
}

/** How wide a pennant renders, so it never has to cut a name short. */
export function tagWidth(name: string): number {
	return TAG_CHROME + Math.ceil(measureName(name));
}

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

export function overlaps(a: Box, b: Box): boolean {
	return a.x < b.x + b.w + 2 && a.x + a.w + 2 > b.x && a.y < b.y + b.h + 2 && a.y + a.h + 2 > b.y;
}

/** A ship as the pennant layout sees it: its anchor and hull, in chart units. */
export interface PennantShip {
	partyId: string;
	name: string;
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface TagPlacement {
	/** The pennant, in CSS pixels inside the frame. */
	box: Box;
	/** The line tying a pennant to its ship, in chart units — only when the
	 *  pennant had to fly away from its own mast or keel. */
	leader: { from: { x: number; y: number }; to: { x: number; y: number } } | null;
}

/** A hull's silhouette as a pixel box, for keeping pennants off it. */
function hullBox(
	x: number,
	y: number,
	width: number,
	height: number,
	space: ChartSpace,
	scale: number,
): Box {
	const w = width * OUTLINE_SPAN * scale;

	return {
		x: x * scale - w / 2,
		y: (y - height * SPRITE_ABOVE_WATER - space.viewTop) * scale,
		w,
		h: height * SPRITE_ABOVE_WATER * scale,
	};
}

/**
 * Where each pennant flies, in CSS pixels inside the frame.
 *
 * Above the masthead, where there is sky. A pennant that would land on
 * another — or on another ship's masts — goes beside the masthead, then
 * below the keel if that water is free, and otherwise climbs or drops on a
 * leader line, so it still reads as this ship's. Nearest ships are placed
 * first and keep their natural spot: they are the answer the player came
 * for. On a crowded horizon the masts stop counting as obstacles, and as a
 * last resort any free row will do.
 *
 * `berth` is the player's own boat, which no pennant may cover, and
 * `reserved` is anything else already written on the water.
 */
export function placePennants(
	ships: PennantShip[],
	space: ChartSpace,
	scale: number,
	berth: { x: number; y: number },
	reserved: Box[] = [],
): Map<string, TagPlacement> {
	const frame = { w: space.width * scale, h: space.viewHeight * scale };
	const yourWidth = YOUR_SHIP_WIDTH * space.hull;
	const yours = hullBox(berth.x, berth.y, yourWidth, yourWidth * SPRITE_RATIO, space, scale);
	const taken: Box[] = [{ ...yours, h: yours.h + BERTH_LABEL_HEIGHT }, ...reserved];
	const out = new Map<string, TagPlacement>();
	const order = [...ships].sort((a, b) => b.y - a.y);
	const hulls = new Map(
		ships.map((ship) => [
			ship.partyId,
			hullBox(ship.x, ship.y, ship.width, ship.height, space, scale),
		]),
	);

	for (const ship of order) {
		const w = tagWidth(ship.name);
		const shipX = ship.x * scale;
		const centred = Math.min(Math.max(shipX - w / 2, FRAME_PAD), frame.w - FRAME_PAD - w);
		const mastY = (ship.y - ship.height * SPRITE_ABOVE_WATER - space.viewTop) * scale;
		const keelY = (ship.y - space.viewTop) * scale;
		const halfHull = Math.max(ship.width * OUTLINE_SPAN, MIN_HIT_WIDTH) * scale * 0.5;
		const otherHulls = [...hulls]
			.filter(([partyId]) => partyId !== ship.partyId)
			.map(([, box]) => box);
		const free = (box: Box, strict: boolean): boolean =>
			box.x >= FRAME_PAD &&
			box.x + box.w <= frame.w - FRAME_PAD &&
			box.y >= FRAME_PAD &&
			box.y + box.h <= frame.h - FRAME_PAD &&
			!taken.some((other) => overlaps(other, box)) &&
			(!strict || !otherHulls.some((hull) => overlaps(hull, box)));
		const at = (x: number, y: number): Box => ({ x, y, w, h: TAG_HEIGHT });

		/**
		 * Where a pennant may fly, best first: over the mast; beside the
		 * masthead, right then left (a flag on a pole — and on a phone the water
		 * either side of the fan is the only room there is); under the keel;
		 * then climbing or dropping in rows, tied to the ship by a line.
		 */
		const spots: { box: Box; tie: 'none' | 'side' | 'above' | 'below' }[] = [
			{ box: at(centred, mastY - TAG_GAP - TAG_HEIGHT), tie: 'none' },
			{ box: at(shipX + halfHull + TAG_GAP, mastY - 2), tie: 'side' },
			{ box: at(shipX - halfHull - TAG_GAP - w, mastY - 2), tie: 'side' },
			{ box: at(centred, keelY + TAG_GAP), tie: 'none' },
		];
		for (let step = 1; step <= TAG_LIFTS; step += 1) {
			spots.push({
				box: at(centred, mastY - TAG_GAP - TAG_HEIGHT - step * (TAG_HEIGHT + TAG_STACK)),
				tie: 'above',
			});
			spots.push({
				box: at(centred, keelY + TAG_GAP + step * (TAG_HEIGHT + TAG_STACK)),
				tie: 'below',
			});
		}
		for (
			let row = FRAME_PAD;
			row + TAG_HEIGHT <= frame.h - FRAME_PAD;
			row += TAG_HEIGHT + TAG_STACK
		) {
			// Any row will do by now — under the ship first, then the open water
			// at either edge of the frame, which is where a phone has room.
			for (const column of [centred, frame.w - FRAME_PAD - w, FRAME_PAD]) {
				spots.push({ box: at(column, row), tie: row < mastY ? 'above' : 'below' });
			}
		}

		// First pass keeps off other ships' masts; second only off other
		// pennants, for a crowded horizon.
		const chosen =
			spots.find((spot) => free(spot.box, true)) ??
			spots.find((spot) => free(spot.box, false)) ??
			spots[0];
		const box = { ...chosen.box, y: Math.max(FRAME_PAD, chosen.box.y) };
		taken.push(box);

		const mastUnits = { x: ship.x, y: ship.y - ship.height * SPRITE_ABOVE_WATER };
		const keelUnits = { x: ship.x, y: ship.y };
		const toUnits = (x: number, y: number) => ({ x: x / scale, y: y / scale + space.viewTop });
		let leader: TagPlacement['leader'] = null;
		if (chosen.tie === 'side') {
			const nearEdge = box.x > shipX ? box.x : box.x + box.w;
			leader = { from: mastUnits, to: toUnits(nearEdge, box.y + TAG_HEIGHT / 2) };
		} else if (chosen.tie === 'above') {
			leader = { from: mastUnits, to: toUnits(box.x + w / 2, box.y + TAG_HEIGHT) };
		} else if (chosen.tie === 'below') {
			leader = { from: keelUnits, to: toUnits(box.x + w / 2, box.y) };
		}
		out.set(ship.partyId, { box, leader });
	}

	return out;
}
