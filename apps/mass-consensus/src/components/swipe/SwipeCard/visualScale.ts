import { useMemo } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import { getEvaluationScale } from '@freedi/shared-types';
import type { EvaluationScaleEntry, EvaluationScaleKey } from '@freedi/shared-types';

type TextDirection = 'ltr' | 'rtl';

/** Mirror of a throw direction (the neutral 'up' stays put). */
function mirrorDirection(direction: EvaluationScaleEntry['direction']): EvaluationScaleEntry['direction'] {
  if (direction === 'left') return 'right';
  if (direction === 'right') return 'left';

  return direction;
}

/**
 * The shared scale runs low to high (-1 to +1) and is laid out that way in
 * right-to-left languages (disagree on the left, agree on the right). In a
 * left-to-right language the order is mirrored so agree comes first, on the
 * left, like the start of a line of text.
 *
 * Only on-screen position changes: `zoneIndex` and `direction` describe the
 * screen position of the entry, while `value`, labels and variants stay
 * attached to it, so the stored evaluation is unchanged.
 */
export function orderScaleForDirection(
  scale: readonly EvaluationScaleEntry[],
  dir: TextDirection | undefined
): readonly EvaluationScaleEntry[] {
  if (dir !== 'ltr') return scale;

  return [...scale].reverse().map((entry, zoneIndex) => ({
    ...entry,
    zoneIndex,
    direction: mirrorDirection(entry.direction),
  }));
}

/** Evaluation scale for `ratingMode`, ordered left to right for the current language. */
export function useVisualScale(ratingMode?: EvaluationScaleKey): readonly EvaluationScaleEntry[] {
  const { dir } = useTranslation();

  return useMemo(() => orderScaleForDirection(getEvaluationScale(ratingMode), dir), [ratingMode, dir]);
}
