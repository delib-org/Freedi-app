import type { CSSProperties } from 'react';
import { CARD_COLOR_INTENSITY } from '@/constants/common';

/**
 * Normalise a stored card-colour intensity to [0, 1].
 * Missing or invalid values fall back to the full palette.
 */
export function clampCardColorIntensity(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return CARD_COLOR_INTENSITY.DEFAULT;
  }

  return Math.min(CARD_COLOR_INTENSITY.MAX, Math.max(CARD_COLOR_INTENSITY.MIN, value));
}

/**
 * Style object that hands the intensity to the card SCSS as a custom property.
 * The SCSS owns how it is applied; this only passes the number down.
 */
export function cardColorIntensityStyle(value: number | undefined): CSSProperties {
  return {
    [CARD_COLOR_INTENSITY.CSS_VAR]: clampCardColorIntensity(value),
  } as CSSProperties;
}
