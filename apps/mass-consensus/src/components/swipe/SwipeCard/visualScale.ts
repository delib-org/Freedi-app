import { useMemo } from 'react';
import { getEvaluationScale } from '@freedi/shared-types';
import type { EvaluationScaleEntry, EvaluationScaleKey } from '@freedi/shared-types';

/** Mirror of a throw direction (the neutral 'up' stays put). */
function mirrorDirection(direction: EvaluationScaleEntry['direction']): EvaluationScaleEntry['direction'] {
  if (direction === 'left') return 'right';
  if (direction === 'right') return 'left';

  return direction;
}

/**
 * The shared scale runs low to high (-1 to +1). On screen it is mirrored in
 * every language, left-to-right and right-to-left alike, so the strongest
 * agree is first, on the left, and the strongest disagree is last, on the right.
 *
 * Only on-screen position changes: `zoneIndex` and `direction` describe the
 * screen position of the entry, while `value`, labels and variants stay
 * attached to it, so the stored evaluation is unchanged.
 */
export function orderScaleForDirection(
  scale: readonly EvaluationScaleEntry[]
): readonly EvaluationScaleEntry[] {
  return [...scale].reverse().map((entry, zoneIndex) => ({
    ...entry,
    zoneIndex,
    direction: mirrorDirection(entry.direction),
  }));
}

/** Evaluation scale for `ratingMode`, ordered left to right: agree first. */
export function useVisualScale(ratingMode?: EvaluationScaleKey): readonly EvaluationScaleEntry[] {
  return useMemo(() => orderScaleForDirection(getEvaluationScale(ratingMode)), [ratingMode]);
}
