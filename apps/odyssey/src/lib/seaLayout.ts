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
 * The sea reads as three bands of distance, and the player has to be able to
 * tell which one a ship is in without measuring pixels.
 *
 * `shipLayout` already encodes proximity in y (near = low, far = horizon) —
 * these bands are that same formula made visible, so nothing is re-ranked and
 * nothing new is claimed. Thirds of the 0..1 distance scale, top to bottom.
 */
export type ProximityBandKey = 'far' | 'middle' | 'near';

export interface ProximityBand {
	key: ProximityBandKey;
	/** screen y of the band's upper edge (the farther side) */
	top: number;
	/** screen y of the band's lower edge (the nearer side) */
	bottom: number;
}

/** Distance thirds. A ship exactly on a boundary belongs to the nearer band. */
const BAND_EDGES: Record<ProximityBandKey, [number, number]> = {
	near: [0, 1 / 3],
	middle: [1 / 3, 2 / 3],
	far: [2 / 3, 1],
};

/** Where `shipLayout` puts a ship of this distance — the one source of truth. */
function bandY(distance: number, height: number): number {
	return height * (0.2 + 0.5 * (1 - distance));
}

/**
 * Outer bands are stretched past their formula edge so a ship sitting on the
 * boundary is drawn inside its own band rather than half out of the sea.
 */
const BAND_OVERSHOOT = 0.06;

export function proximityBands(height: number): ProximityBand[] {
	return (['far', 'middle', 'near'] as const).map((key) => {
		const [from, to] = BAND_EDGES[key];

		return {
			key,
			top: bandY(to, height) - (key === 'far' ? height * BAND_OVERSHOOT : 0),
			bottom: bandY(from, height) + (key === 'near' ? height * BAND_OVERSHOOT : 0),
		};
	});
}

/** Which band a distance falls in. Unknown distances park in the far band,
 *  exactly where `shipLayout` sends them (0.9). */
export function proximityBandOf(distance: number | null | undefined): ProximityBandKey {
	const value = clamp01(distance ?? 0.9);
	if (value < BAND_EDGES.near[1]) return 'near';
	if (value < BAND_EDGES.middle[1]) return 'middle';

	return 'far';
}
