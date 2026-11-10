import type { TableAssignmentMetrics } from '@freedi/shared-types';
import { MIN_KNOWN_POSITIONS } from '@/logic/closeness';

/**
 * The one answer the preview leads with. Only `good` may say the tables are
 * good: the others say plainly what is true instead.
 */
export type PreviewVerdict = 'stale' | 'choicesOnly' | 'unbalanced' | 'good';

export function previewVerdict(metrics: TableAssignmentMetrics, stale: boolean): PreviewVerdict {
	if (stale) return 'stale';
	if (metrics.population.n < MIN_KNOWN_POSITIONS) return 'choicesOnly';

	return metrics.balance.withinTolerance ? 'good' : 'unbalanced';
}
