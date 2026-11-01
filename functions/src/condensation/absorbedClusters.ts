import { FieldValue } from 'firebase-admin/firestore';
import type { Statement } from '@freedi/shared-types';

/**
 * Shared by every path that joins cluster B (the loser) into cluster A (the
 * winner). B's own direct votes live on B's statement doc, so they would be
 * orphaned once B is hidden. Recording B in `A.absorbedClusterIds` lets the
 * recompute (`recomputeClusterEvaluation`) keep counting them for A.
 *
 * Transitive: a loser that had already absorbed other clusters hands those
 * ids over too, so a chain C into B into A ends with A listing both B and C.
 */

export interface AbsorbedLoser {
	statementId: string;
	absorbedClusterIds?: string[];
}

/** The ids the winner must gain when `losers` are folded into `winnerId`. */
export function collectAbsorbedIds(winnerId: string, losers: AbsorbedLoser[]): string[] {
	const ids = new Set<string>();
	for (const loser of losers) {
		ids.add(loser.statementId);
		for (const inherited of loser.absorbedClusterIds ?? []) ids.add(inherited);
	}
	// A cluster can never absorb itself (guards against cyclic merges).
	ids.delete(winnerId);

	return [...ids];
}

/**
 * Update fragment to spread into the winner's existing write. Uses
 * `arrayUnion` so concurrent merges into the same winner cannot lose ids.
 * Returns an empty object when there is nothing to add.
 */
export function absorbedClusterIdsUpdate(
	winnerId: string,
	losers: Array<Pick<Statement, 'statementId' | 'absorbedClusterIds'>>,
): { absorbedClusterIds?: FieldValue } {
	const ids = collectAbsorbedIds(winnerId, losers);
	if (ids.length === 0) return {};

	return { absorbedClusterIds: FieldValue.arrayUnion(...ids) };
}
