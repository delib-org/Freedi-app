import { getDir, t } from '../i18n/i18n';

/**
 * Named tuning constants for the Phaser sea stage
 * (docs/phaser-game-design.md §4 — no magic numbers in scene code).
 */

/**
 * The stage was composed for a right-to-left reader: the harbor sits on the
 * right, the islands slide in from the left, the eye starts on the right.
 * Mirror an absolute x for a left-to-right language. Read at call time, so a
 * scene rebuilt after a language change lays itself out the other way round.
 */
export function mirrorX(x: number, width: number, dir = getDir()): number {
	return dir === 'ltr' ? width - x : x;
}

/** The sign of a relative x offset: +1 as composed (RTL), −1 mirrored. */
export function mirrorSign(dir = getDir()): 1 | -1 {
	return dir === 'ltr' ? -1 : 1;
}

/**
 * Font stack for every Phaser Text. Noto Sans Arabic FIRST: its @font-face is
 * scoped by unicode-range to Arabic glyphs, so Hebrew and Latin fall through to
 * Arial without downloading it — but a font listed after Arial would never be
 * reached for Arabic either, since Arial has those glyphs too.
 */
export const STAGE_FONT = '"Noto Sans Arabic", Arial, Helvetica, sans-serif';

/** Party-ship reposition tween (verbatim PartySea timing). */
export const TWEEN_SHIP_MS = 1400;
/** Scene-to-scene crossfade. */
export const TWEEN_FADE_MS = 350;
/** DOM overlay slide/fade. */
export const TWEEN_PANEL_MS = 250;
/** Logbook stamp beat. */
export const TWEEN_STAMP_MS = 300;
/** Compass needle swing on an answered wind. */
export const TWEEN_NEEDLE_MS = 700;
/** Full needle sweep when all winds are complete. */
export const TWEEN_SWEEP_MS = 900;
/** Island slide-in during the voyage. */
export const TWEEN_ISLAND_MS = 900;
/** Day-phase (sky/tint) change. */
export const DAYPHASE_MS = 1200;
/** Boat bobbing loop (verbatim PartySea). */
export const BOB_MS = 2100;

export const PARTICLES_SPLASH = 8;
export const PARTICLES_SPARKLE = 12;
export const PARTICLES_ARRIVAL = 24;
/** Hard cap on simultaneously live burst particles. */
export const PARTICLES_MAX_LIVE = 40;

export const STAR_COUNT = 40;
export const STAR_COUNT_SMALL = 20;
export const GULL_COUNT = 2;
export const STAGGER_FLAGS_MS = 150;
/** Lantern lighting stagger in the homecoming tableau. */
export const STAGGER_LANTERN_MS = 300;

/** Sea-stage palette (mirrors the CSS variables in styles.css). */
export const COLOR_GOLD = 0xe8b958;
export const COLOR_CREAM = 0xfff4d3;
export const COLOR_CYAN = 0x5edfff;
export const COLOR_SKY = 0x9fd7ff;
export const COLOR_NAVY = 0x06192c;
export const COLOR_LANTERN = 0xffd9a0;
/** Neutral pennant colors — order = rank, color carries no meaning. */
export const PENNANT_COLORS = [0xe8b958, 0x5edfff, 0x9fd7ff, 0xfff4d3, 0x7bd4a8] as const;

/** Ocean tint by day phase: dawn → midday → golden hour. */
export const TINT_DAWN = 0x9fc9ff;
export const TINT_NOON = 0xffffff;
export const TINT_GOLDEN = 0xffd9a0;

/** Equal-juice rule (§8.1): the ONLY per-attitude difference allowed is the
 *  neutral nautical glyph on the buoy pennant — never counts, durations,
 *  colors or easing. All three render cream. */
export const ATTITUDE_GLYPHS: Record<'support' | 'livewith' | 'oppose', string> = {
	support: '⚓',
	livewith: '〜',
	oppose: '⛵',
};

/** The player's own ship, named on the water so it is never mistaken for a
 *  party ship. A function: the label is read in the current language when the
 *  boat is spawned, not when this module loads. */
export function myShipLabel(): string {
	return t('stage.myShip');
}

/** The player's boat. On a sea that also carries party ships it draws above
 *  all of them — those are depth-sorted by their y, which reaches into the
 *  hundreds on a tall screen — so the player is never hidden by a party.
 *  Elsewhere it keeps its original depth, under the beats that play above the
 *  mast (the homecoming's arrival flags sit at 110). */
export const BOAT_DEPTH = 100;
export const BOAT_DEPTH_FRONT = 900;

/** The player's boat on the voyage: larger than any party ship, and smaller on
 *  a phone where the fan around it is tighter. */
export const BOAT_SCALE = 0.14;
export const BOAT_SCALE_NARROW = 0.1;

/** Phone-sized canvas: the fan is tighter and every marker on it shrinks. */
export const NARROW_STAGE_WIDTH = 640;
