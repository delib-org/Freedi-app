import { calculateFitHeight, decideGestureAxis } from '../cardFit';
import { SWIPE } from '@/constants/common';

describe('cardFit', () => {
  describe('calculateFitHeight', () => {
    it('ends the card above the bottom bar', () => {
      const height = calculateFitHeight({ viewportHeight: 900, cardTopInDocument: 300, bottomBarHeight: 120 });
      expect(height).toBe(900 - 300 - 120 - SWIPE.CARD_BOTTOM_GAP);
    });

    it('works without a bottom bar', () => {
      expect(calculateFitHeight({ viewportHeight: 800, cardTopInDocument: 100, bottomBarHeight: 0 })).toBe(
        800 - 100 - SWIPE.CARD_BOTTOM_GAP
      );
    });

    it('never goes below the minimum height', () => {
      expect(calculateFitHeight({ viewportHeight: 500, cardTopInDocument: 400, bottomBarHeight: 120 })).toBe(
        SWIPE.CARD_MIN_FIT_HEIGHT
      );
    });

    it('rounds down to whole pixels', () => {
      const height = calculateFitHeight({ viewportHeight: 900.7, cardTopInDocument: 300, bottomBarHeight: 100 });
      expect(Number.isInteger(height)).toBe(true);
    });
  });

  describe('decideGestureAxis', () => {
    it('waits until the touch moved far enough', () => {
      expect(decideGestureAxis(SWIPE.AXIS_LOCK_DISTANCE - 1, 2)).toBe('pending');
    });

    it('treats a mostly vertical move as a scroll', () => {
      expect(decideGestureAxis(3, -20)).toBe('scroll');
    });

    it('treats a mostly horizontal move as a swipe', () => {
      expect(decideGestureAxis(-25, 6)).toBe('swipe');
    });

    it('prefers the swipe on an exact diagonal', () => {
      expect(decideGestureAxis(12, 12)).toBe('swipe');
    });
  });
});
