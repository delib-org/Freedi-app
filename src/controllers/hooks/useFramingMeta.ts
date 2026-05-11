import { useMemo } from 'react';
import { Statement, Framing } from '@freedi/shared-types';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { createFramingsByParentSelector } from '@/redux/framings/framingsSlice';
import type { RootState } from '@/redux/store';

export interface FramingMeta {
	framingId: string;
	name: string;
	description: string;
	createdBy: Framing['createdBy'];
	createdAt: number;
	/** Number of clusters in this framing, derived from live Statement docs. */
	clusterCount: number;
	/**
	 * True when at least one option under the parent was created after the
	 * framing was built — i.e. the framing may not represent the live pool.
	 */
	isStale: boolean;
	/**
	 * Reserved for future async-job tracking. Currently always false; the chip
	 * UI uses it to render a spinner state when wired.
	 */
	isComputing: boolean;
}

const selectFramingsByParent = createFramingsByParentSelector(
	(s: RootState) => s.framings.byParent,
);

/**
 * Returns per-framing display metadata for the chip row. Pure derivation
 * over Redux — no Firestore reads.
 */
export function useFramingMeta(parentId: string | undefined): FramingMeta[] {
	const framings = useAppSelector(selectFramingsByParent(parentId));
	const statements = useAppSelector((s: RootState) => s.statements.statements);

	return useMemo<FramingMeta[]>(() => {
		if (!parentId) return [];

		const optionsUnderParent: Statement[] = statements.filter(
			(s) => s.parentId === parentId && s.isCluster !== true && !s.hide,
		);
		const newestOptionCreatedAt = optionsUnderParent.reduce<number>(
			(max, s) => Math.max(max, s.createdAt ?? 0),
			0,
		);

		return framings
			.filter((f) => f.isActive)
			.map<FramingMeta>((f) => {
				// Count clusters from Redux rather than `f.clusterIds.length` so
				// the badge tracks what the user actually sees on the page (a
				// cluster removed from Redux but still listed in clusterIds
				// would otherwise inflate the count).
				const liveClusters = statements.filter(
					(s) => s.parentId === parentId && s.isCluster === true && s.framingId === f.framingId,
				);

				return {
					framingId: f.framingId,
					name: f.name,
					description: f.description,
					createdBy: f.createdBy,
					createdAt: f.createdAt,
					clusterCount: liveClusters.length,
					isStale: newestOptionCreatedAt > f.createdAt,
					isComputing: false,
				};
			});
	}, [parentId, framings, statements]);
}
