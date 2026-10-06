import { ZONES } from '@/constants/common';

/** Number of colour slots in the rating palette (`--zone-0` … `--zone-4`, hate … love). */
const COLOR_SLOTS = 5;

// Calculate initial zone from touch/click position. `totalZones` is the number
// of steps on the active scale (five by default, three on the -1 · 0 · +1 scale).
export function calculateInitialZone(
  clientX: number,
  cardElement: HTMLDivElement | null,
  totalZones: number = ZONES.TOTAL_ZONES
): number | null {
  if (!cardElement) return null;
  const rect = cardElement.getBoundingClientRect();
  const zoneWidth = rect.width / totalZones;
  const offsetX = clientX - rect.left;
  let zoneIndex = Math.floor(offsetX / zoneWidth);
  zoneIndex = Math.max(0, Math.min(totalZones - 1, zoneIndex));

  // Universal layout: first zone (red) on left, last zone (green) on right
  // Visual position directly maps to zone index
  return zoneIndex;
}

/** Index of the middle (neutral, swipe-up) zone of a scale with `totalZones` steps. */
export function centerZoneIndex(totalZones: number): number {
  return Math.floor(totalZones / 2);
}

/**
 * Spread a scale's positions over the five-colour rating palette, so a shorter
 * scale still runs from the strongest red to the strongest green
 * (3 steps → slots 0, 2, 4; 5 steps → 0, 1, 2, 3, 4).
 */
export function zoneColorSlot(zoneIndex: number, totalZones: number): number {
  if (totalZones <= 1) return centerZoneIndex(COLOR_SLOTS);

  return Math.round((zoneIndex * (COLOR_SLOTS - 1)) / (totalZones - 1));
}

// Check if vertical swipe meets threshold
export function isVerticalSwipeComplete(dragY: number): boolean {
  return dragY <= -ZONES.VERTICAL_SWIPE_THRESHOLD; // Negative = upward
}
