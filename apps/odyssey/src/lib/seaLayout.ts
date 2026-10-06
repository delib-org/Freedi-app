/**
 * Pure layout math for the sea stage — extracted from PartySea so scenes and
 * tests share one source of truth (docs/phaser-game-design.md §6).
 */

export interface ShipPlacement {
	x: number;
	y: number;
	scale: number;
	alpha: number;
}

/**
 * Party-ship placement (verbatim the original PartySea formulas):
 * distance 0 → near the player (low, big); 1 → far horizon (high, small);
 * null/undefined → parked far and faded. X is fixed by sortOrder index —
 * never by distance — so ships are never ranked visually.
 */
export function shipLayout(
	distance: number | null | undefined,
	index: number,
	count: number,
	width: number,
	height: number,
): ShipPlacement {
	const value = distance ?? 0.9;
	const safeCount = Math.max(1, count);

	return {
		x: width * (0.12 + (0.76 * (index + 0.5)) / safeCount),
		y: height * (0.2 + 0.5 * (1 - value)),
		scale: 0.075 + 0.11 * (1 - value),
		alpha: distance === null || distance === undefined ? 0.45 : 0.55 + 0.45 * (1 - value),
	};
}

/** Vertical band of the chart that reads as sea (below the horizon/city). */
const CHART_TOP = 0.3;
const CHART_BOTTOM = 0.78;
/** How much the far row squeezes toward the center (perspective frustum). */
const FAR_SQUEEZE = 0.78;

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

/**
 * Island position on the chart. Admin data stores `posX` as percent from the
 * RIGHT edge (the DOM version used `right: posX%`), so Phaser x flips it.
 * The archipelago is kept together: posY maps into the sea band (never onto
 * the horizon), and far rows pull toward the center like a receding seascape.
 */
export function islandPosition(
	posX: number,
	posY: number,
	width: number,
	height: number,
): { x: number; y: number } {
	const t = clamp01(posY / 100);
	const xRaw = width * (1 - posX / 100);
	const squeeze = FAR_SQUEEZE + (1 - FAR_SQUEEZE) * t;

	return {
		x: width / 2 + (xRaw - width / 2) * squeeze,
		y: height * (CHART_TOP + (CHART_BOTTOM - CHART_TOP) * t),
	};
}

/**
 * Atmospheric perspective for an island: nearer (larger posY) → bigger;
 * farther → smaller and hazier. `haze` is 0 (near, crisp) .. ~0.35 (far).
 */
export function islandDepth(posY: number): { scale: number; haze: number } {
	const t = clamp01(posY / 100);

	return {
		scale: 0.6 + 0.55 * t,
		haze: 0.35 * (1 - t),
	};
}

/**
 * Day phase during the voyage: midday (0.45) at the first island advancing
 * to afternoon (0.8) at the last. Progress-driven only — never wall-clock.
 */
export function dayPhaseForIsland(index: number, count: number): number {
	if (count <= 1) return 0.45;
	const t = Math.min(1, Math.max(0, index / (count - 1)));

	return 0.45 + 0.35 * t;
}

/** Fellow-sailor glyph placement: even x spread, y by distance band. */
export function sailorPlacement(
	distance: number,
	index: number,
	count: number,
	width: number,
	height: number,
): { x: number; y: number } {
	const safeCount = Math.max(1, count);

	return {
		x: width * (0.15 + (0.7 * (index + 0.5)) / safeCount),
		y: height * (0.2 + 0.5 * (1 - Math.min(1, Math.max(0, distance)))),
	};
}

/**
 * The voyage sea is read FROM the player's own deck.
 *
 * The player's boat is anchored at the centre of the lower frame and every
 * party ship is placed on a ring around it whose radius is that party's
 * distance — so "which ship is nearest" is answered by looking, with no
 * legend to learn. The rings are ellipses because that is what a circle drawn
 * on the water looks like from a boat sitting on it: far away straight ahead
 * climbs to the horizon, far away off the beam stays low and to the side.
 *
 * Which LANE a ship sails in is fixed by its sortOrder index and never by its
 * distance (design spec §8.2) — the ring says how near, the lane says nothing
 * at all.
 */
export interface SeaFan {
	/** the player's berth, and the centre every ring is drawn around */
	cx: number;
	cy: number;
	/** semi-axes of the outermost ring */
	rx: number;
	ry: number;
}

/** Total angular width of the fan, centred on straight ahead. */
const FAN_SPREAD = (140 * Math.PI) / 180;
/** The innermost ring — a distance of 0 still leaves room for a hull. */
const NEAR_RING = 0.36;
/** How high up the frame the farthest ring reaches, dead ahead. */
const FAN_HORIZON = 0.2;
/** Where the player sits. */
const FAN_BERTH = 0.56;

/** Where the fan sits in the frame, as fractions of its height. A sea that
 *  shares the frame with other things (the homecoming tableau's islands)
 *  moves the fan; the voyage uses the defaults. */
export interface FanFrame {
	berth?: number;
	horizon?: number;
}

export function seaFan(width: number, height: number, frame: FanFrame = {}): SeaFan {
	const cy = height * (frame.berth ?? FAN_BERTH);

	return { cx: width / 2, cy, rx: width * 0.4, ry: cy - height * (frame.horizon ?? FAN_HORIZON) };
}

/** A ship's lane, by index only. Lane 0 is the rightmost — this is a Hebrew
 *  game and the eye starts on the right. */
export function fanAngle(index: number, count: number): number {
	const safeCount = Math.max(1, count);

	return FAN_SPREAD / 2 - (FAN_SPREAD * (index + 0.5)) / safeCount;
}

/** The ring a distance sits on, as a fraction of the outermost ring. */
function ringOf(distance: number): number {
	return NEAR_RING + (1 - NEAR_RING) * clamp01(distance);
}

/**
 * Party-ship placement on the fan. Scale and alpha keep the original
 * PartySea response to distance — nearer is larger and more solid — which is
 * now telling the same story as the radius rather than a second one.
 */
export function partyShipPlacement(
	distance: number | null | undefined,
	index: number,
	count: number,
	width: number,
	height: number,
	frame: FanFrame = {},
): ShipPlacement {
	const value = distance ?? 0.9;
	const fan = seaFan(width, height, frame);
	const ring = ringOf(value);
	const angle = fanAngle(index, count);

	return {
		x: fan.cx + Math.sin(angle) * fan.rx * ring,
		y: fan.cy - Math.cos(angle) * fan.ry * ring,
		scale: 0.075 + 0.11 * (1 - clamp01(value)),
		alpha: distance === null || distance === undefined ? 0.45 : 0.55 + 0.45 * (1 - clamp01(value)),
	};
}

/** The two rings that divide the sea into near / middle / far, as semi-axis
 *  pairs. Drawn, not labelled — the words live in the card a tap opens. */
export function rangeRings(
	width: number,
	height: number,
	frame: FanFrame = {},
): { rx: number; ry: number }[] {
	const fan = seaFan(width, height, frame);

	return [1 / 3, 2 / 3, 1].map((distance) => ({
		rx: fan.rx * ringOf(distance),
		ry: fan.ry * ringOf(distance),
	}));
}

/**
 * Which third of the sea a distance falls in. Unknown distances park in the
 * far ring, exactly where `partyShipPlacement` sends them (0.9).
 */
export type ProximityBandKey = 'far' | 'middle' | 'near';

export function proximityBandOf(distance: number | null | undefined): ProximityBandKey {
	const value = clamp01(distance ?? 0.9);
	if (value < 1 / 3) return 'near';
	if (value < 2 / 3) return 'middle';

	return 'far';
}

/**
 * Below this spread the ships really are equally far from the player, and
 * stretching them apart would draw a difference that is not there.
 */
const MIN_RELATIVE_SPREAD = 0.01;

/**
 * Where each ship sails, relative to the rest of the fleet.
 *
 * An absolute distance is a mean over every stance the player marked, and
 * party routes are continuous scores — so for almost any player every party
 * lands between ~0.35 and ~0.5, and the whole fleet rides the same ring.
 * The sea's job is to show which parties sail NEAR your route and which sail
 * far, so it stretches that band: the nearest reference ship rides the
 * innermost ring, the farthest the horizon, the rest in proportion between.
 *
 * `referenceIds` names the ships that set the scale (the parties). Any other
 * ship (an elder) is placed on that same scale, clamped to the sea, so an
 * elder can never push the parties together. Unknown distances stay null.
 * The true distance is still the number a card puts in words.
 */
export function relativeDistances(
	distances: Record<string, number | null | undefined>,
	referenceIds: readonly string[] = Object.keys(distances),
): Record<string, number | null> {
	const known = referenceIds
		.map((id) => distances[id])
		.filter((value): value is number => typeof value === 'number');
	const min = Math.min(...known);
	const spread = Math.max(...known) - min;
	const stretch = known.length >= 2 && spread >= MIN_RELATIVE_SPREAD;

	return Object.fromEntries(
		Object.entries(distances).map(([id, value]): [string, number | null] => {
			if (typeof value !== 'number') return [id, null];

			return [id, stretch ? clamp01((value - min) / spread) : value];
		}),
	);
}
