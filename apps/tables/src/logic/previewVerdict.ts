import type { TableAssignmentMetrics } from '@freedi/shared-types';

/**
 * The one answer the preview leads with. Only `good` may say the tables are
 * good: the others say plainly what is true instead.
 */
export type PreviewVerdict = 'stale' | 'choicesOnly' | 'unbalanced' | 'good';

export function previewVerdict(metrics: TableAssignmentMetrics, stale: boolean): PreviewVerdict {
	if (stale) return 'stale';
	// A run from before the flag existed has no answer: do not claim the room is known.
	if (metrics.hasEnoughPositions !== true) return 'choicesOnly';

	return metrics.balance.withinTolerance ? 'good' : 'unbalanced';
}
