import React from 'react';
import { getEvaluationEntry } from '@freedi/shared-types';
import type { EvaluationScaleKey } from '@freedi/shared-types';
import RatingIcon from './RatingIcon';

/** RatingIcon draws its single thumbs at ±0.5 (and the dash at 0). */
const SINGLE_THUMB_STEP = 0.5;

interface EvaluationFaceProps {
  /** The evaluation value this face represents. */
  value: number;
  /** Evaluation scale; undefined = five-step agree-disagree (default). */
  mode?: EvaluationScaleKey;
  className?: string;
}

/**
 * Renders the visual for a single evaluation step, mode-aware:
 * - 'agree-disagree' (default): the existing SVG thumbs (RatingIcon) — the
 *   look stays exactly as it was before reaction mode existed.
 * - 'reactions': the emoji character (😐/🙂/😊/👍/❤️) for the value, taken
 *   from the shared cross-app scale.
 * - 'three-point': the single thumbs of the five-step scale's inner steps.
 *   With nothing milder beside them, -1 / +1 read as plain disagree / agree,
 *   so the doubled "strongly" thumbs would overstate them.
 */
export default function EvaluationFace({ value, mode, className }: EvaluationFaceProps) {
  if (mode === 'reactions') {
    const entry = getEvaluationEntry(value, 'reactions');

    return (
      <span className={className} aria-hidden="true">
        {entry?.emoji ?? ''}
      </span>
    );
  }

  if (mode === 'three-point') {
    return <RatingIcon rating={value * SINGLE_THUMB_STEP} className={className} />;
  }

  return <RatingIcon rating={value} className={className} />;
}
