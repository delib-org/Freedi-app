import React from 'react';
import { getEvaluationEntry } from '@freedi/shared-types';
import type { RatingMode } from '@freedi/shared-types';
import RatingIcon from './RatingIcon';

interface EvaluationFaceProps {
  /** The evaluation value this face represents. */
  value: number;
  /** Evaluation mode; undefined = agree-disagree (default). */
  mode?: RatingMode;
  className?: string;
}

/**
 * Renders the visual for a single evaluation step, mode-aware:
 * - 'agree-disagree' (default): the existing SVG thumbs (RatingIcon) — the
 *   look stays exactly as it was before reaction mode existed.
 * - 'reactions': the emoji character (😐/🙂/😊/👍/❤️) for the value, taken
 *   from the shared cross-app scale.
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

  return <RatingIcon rating={value} className={className} />;
}
