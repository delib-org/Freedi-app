import type { TableAssignmentRun } from '@freedi/shared-types';

/** The newest run that is still in play (not superseded); the one the host previews. */
export function latestRun(runs: readonly TableAssignmentRun[]): TableAssignmentRun | null {
	const live = runs.filter((run) => run.status !== 'superseded');
	const pool = live.length > 0 ? live : runs;

	if (pool.length === 0) return null;

	return pool.reduce((best, run) => (run.createdAt > best.createdAt ? run : best));
}
