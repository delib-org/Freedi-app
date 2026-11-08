import { clampCardColorIntensity, cardColorIntensityStyle } from '../cardColorIntensity';

describe('cardColorIntensity', () => {
  describe('clampCardColorIntensity', () => {
    it('falls back to full colour when the value is missing', () => {
      expect(clampCardColorIntensity(undefined)).toBe(1);
    });

    it('falls back to full colour for NaN and Infinity', () => {
      expect(clampCardColorIntensity(Number.NaN)).toBe(1);
      expect(clampCardColorIntensity(Number.POSITIVE_INFINITY)).toBe(1);
    });

    it('keeps values inside the range', () => {
      expect(clampCardColorIntensity(0)).toBe(0);
      expect(clampCardColorIntensity(0.4)).toBe(0.4);
      expect(clampCardColorIntensity(1)).toBe(1);
    });

    it('clamps values outside the range', () => {
      expect(clampCardColorIntensity(-0.5)).toBe(0);
      expect(clampCardColorIntensity(2)).toBe(1);
    });
  });

  describe('cardColorIntensityStyle', () => {
    it('exposes the clamped value as the card CSS variable', () => {
      expect(cardColorIntensityStyle(0.25)).toEqual({ '--card-color-intensity': 0.25 });
      expect(cardColorIntensityStyle(undefined)).toEqual({ '--card-color-intensity': 1 });
      expect(cardColorIntensityStyle(3)).toEqual({ '--card-color-intensity': 1 });
    });
  });
});
