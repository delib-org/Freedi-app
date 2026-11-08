/**
 * Keeping the swipe card, with its rating row, on screen.
 *
 * The card is capped so its bottom edge (where the rating buttons sit) ends
 * above the survey's fixed bottom bar; the picture and text scroll inside it.
 */

import { SWIPE } from '@/constants/common';

/** Marks the fixed bar at the bottom of the survey screen. */
export const BOTTOM_NAV_ATTR = 'data-mc-bottom-nav';

export interface FitHeightInput {
  /** Visible height of the window, px */
  viewportHeight: number;
  /** Top of the card's slot measured from the top of the document, px */
  cardTopInDocument: number;
  /** Height of the fixed bar at the bottom of the screen, px (0 if none) */
  bottomBarHeight: number;
}

/**
 * Tallest the card may be so that, with the page scrolled to the top, its
 * bottom edge sits just above the bottom bar. Never below the minimum: on a
 * very short screen the page scrolls a little instead of squashing the card.
 */
export function calculateFitHeight({
  viewportHeight,
  cardTopInDocument,
  bottomBarHeight,
}: FitHeightInput): number {
  const available = viewportHeight - cardTopInDocument - bottomBarHeight - SWIPE.CARD_BOTTOM_GAP;

  return Math.max(SWIPE.CARD_MIN_FIT_HEIGHT, Math.floor(available));
}

export type GestureAxis = 'pending' | 'scroll' | 'swipe';

/**
 * A touch that starts on scrollable card content is either a scroll (mostly
 * vertical) or a swipe (mostly horizontal). Undecided until it moves far enough.
 */
export function decideGestureAxis(deltaX: number, deltaY: number): GestureAxis {
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  if (Math.max(absX, absY) < SWIPE.AXIS_LOCK_DISTANCE) return 'pending';

  return absY > absX ? 'scroll' : 'swipe';
}
