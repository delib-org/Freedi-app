import { ZONES } from '@/constants/common';

// Calculate initial zone from touch/click position
export function calculateInitialZone(clientX: number, cardElement: HTMLDivElement | null): number | null {
  if (!cardElement) return null;
  const rect = cardElement.getBoundingClientRect();
  const zoneWidth = rect.width / ZONES.TOTAL_ZONES;
  const offsetX = clientX - rect.left;
  let zoneIndex = Math.floor(offsetX / zoneWidth);
  zoneIndex = Math.max(0, Math.min(ZONES.TOTAL_ZONES - 1, zoneIndex));

  // Universal layout: zone 0 (red) on left, zone 4 (green) on right
  // Visual position directly maps to zone index
  return zoneIndex;
}

// Check if vertical swipe meets threshold
export function isVerticalSwipeComplete(dragY: number): boolean {
  return dragY <= -ZONES.VERTICAL_SWIPE_THRESHOLD; // Negative = upward
}
