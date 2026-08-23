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

export function seaFan(width: number, height: number): SeaFan {
	const cy = height * FAN_BERTH;

	return { cx: width / 2, cy, rx: width * 0.4, ry: cy - height * FAN_HORIZON };
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
): ShipPlacement {
	const value = distance ?? 0.9;
	const fan = seaFan(width, height);
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
export function rangeRings(width: number, height: number): { rx: number; ry: number }[] {
	const fan = seaFan(width, height);

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
