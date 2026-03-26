/** Period granularity for admin statistics */
export type StatsPeriodType = 'day' | 'month' | 'year';

/**
 * Pre-computed aggregate statistics document stored in the `adminStats` collection.
 *
 * Doc ID format: `{collection}_{periodKey}`
 * Examples:
 *   - `statements_2026-03-18`  (daily)
 *   - `evaluations_2026-03`    (monthly)
 *   - `votes_2026`             (yearly)
 */
export interface AdminStatDoc {
	/** Source collection name (e.g. 'statements', 'evaluations', 'votes', 'statementsSubscribe', 'users') */
	collection: string;
	/** Granularity of this aggregate */
	periodType: StatsPeriodType;
	/** Period key: 'YYYY-MM-DD' | 'YYYY-MM' | 'YYYY' */
	periodKey: string;
	/** Total count for this period */
	total: number;
	/** Breakdown by statement type (statements collection only) */
	byType?: Record<string, number>;
	/** Breakdown by source app (statements collection only) */
	byApp?: Record<string, number>;
	/** Count of top-level statements (parentId === 'top') */
	topLevel?: number;
	/** Last update timestamp in milliseconds */
	lastUpdate: number;
}

/** Helper to build the doc ID for an adminStats document */
export function getAdminStatDocId(collectionName: string, periodKey: string): string {
	return `${collectionName}_${periodKey}`;
}
