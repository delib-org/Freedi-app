import type { TableAssignmentTableStats } from '@freedi/shared-types';

/** Below this many known positions a table shows no composition at all (brief section 7). */
export const MIN_KNOWN_POSITIONS = 3;

export type Closeness = 'veryClose' | 'close' | 'far' | 'notEnough';

const VERY_CLOSE_SHARE = 0.5;
const EPSILON = 1e-9;

export function hasKnownPositions(stats: Pick<TableAssignmentTableStats, 'n' | 'mean'>): boolean {
	return stats.n >= MIN_KNOWN_POSITIONS && stats.mean.length > 0;
}

/** How close a table is to the room, in the host's words. */
export function closenessOf(stats: TableAssignmentTableStats, tolerance: number): Closeness {
	if (!hasKnownPositions(stats)) return 'notEnough';
	if (stats.deviation <= tolerance * VERY_CLOSE_SHARE + EPSILON) return 'veryClose';

	return stats.deviation <= tolerance + EPSILON ? 'close' : 'far';
}
