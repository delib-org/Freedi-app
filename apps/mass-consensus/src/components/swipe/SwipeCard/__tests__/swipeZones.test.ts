import {
  calculateInitialZone,
  centerZoneIndex,
  isVerticalSwipeComplete,
  zoneColorSlot,
} from '../swipeZones';
import { ZONES } from '@/constants/common';

/** A card 300px wide whose left edge sits at x = 100. */
function card(): HTMLDivElement {
  return {
    getBoundingClientRect: () => ({ left: 100, width: 300 }),
  } as unknown as HTMLDivElement;
}

describe('swipeZones', () => {
  describe('calculateInitialZone', () => {
    it('returns null without a card element', () => {
      expect(calculateInitialZone(150, null)).toBeNull();
    });

    it('splits the card into five zones by default', () => {
      expect(calculateInitialZone(110, card())).toBe(0);
      expect(calculateInitialZone(250, card())).toBe(2);
      expect(calculateInitialZone(390, card())).toBe(4);
    });

    it('splits the card into three zones on the three-point scale', () => {
      expect(calculateInitialZone(110, card(), 3)).toBe(0);
      expect(calculateInitialZone(199, card(), 3)).toBe(0);
      expect(calculateInitialZone(201, card(), 3)).toBe(1);
      expect(calculateInitialZone(299, card(), 3)).toBe(1);
      expect(calculateInitialZone(301, card(), 3)).toBe(2);
    });

    it('clamps positions outside the card to the edge zones', () => {
      expect(calculateInitialZone(0, card(), 3)).toBe(0);
      expect(calculateInitialZone(1000, card(), 3)).toBe(2);
      expect(calculateInitialZone(1000, card())).toBe(4);
    });
  });

  describe('centerZoneIndex', () => {
    it('finds the middle zone', () => {
      expect(centerZoneIndex(5)).toBe(ZONES.CENTER_ZONE_INDEX);
      expect(centerZoneIndex(3)).toBe(1);
    });
  });

  describe('zoneColorSlot', () => {
    it('maps a five-step scale straight onto the palette', () => {
      expect([0, 1, 2, 3, 4].map((i) => zoneColorSlot(i, 5))).toEqual([0, 1, 2, 3, 4]);
    });

    it('spreads a three-step scale over the outer colours and the neutral one', () => {
      expect([0, 1, 2].map((i) => zoneColorSlot(i, 3))).toEqual([0, 2, 4]);
    });

    it('falls back to the neutral slot for a single-step scale', () => {
      expect(zoneColorSlot(0, 1)).toBe(2);
    });
  });

  describe('isVerticalSwipeComplete', () => {
    it('needs an upward drag past the threshold', () => {
      expect(isVerticalSwipeComplete(-ZONES.VERTICAL_SWIPE_THRESHOLD)).toBe(true);
      expect(isVerticalSwipeComplete(-ZONES.VERTICAL_SWIPE_THRESHOLD + 1)).toBe(false);
      expect(isVerticalSwipeComplete(50)).toBe(false);
    });
  });
});
