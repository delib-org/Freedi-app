import { AgoraSession, AgoraSessionMode, AgoraSessionStatus } from '@freedi/shared-types';

/**
 * Does this session update mean "the game just finished, fold it into the
 * aggregates"? Pure — kept out of the trigger file so tests need no
 * firebase-admin bootstrap.
 *
 * Three finish signals, every classroom session produces at least one:
 *  - `classScore` appearing (computeSessionResults at the results stage, or
 *    the hourly sweep) — the scored, bridging path;
 *  - `agreement` appearing — the camp-less, baseline-less agreement path;
 *  - `status` flipping to ended — the convergence path and sweep-ended
 *    sessions that never reached results.
 * A session can produce BOTH; the `aggregatedAt` stamp (checked here AND
 * re-checked inside the aggregation transaction) keeps the second a no-op.
 * Civic sessions never aggregate — they are the Odyssey square's always-on
 * rooms, not classroom games.
 */
export function isNewlyFinishedSession(before: AgoraSession, after: AgoraSession): boolean {
	if (after.sessionMode === AgoraSessionMode.civic) return false;
	if (after.aggregatedAt !== undefined) return false;

	const newlyScored =
		after.classScore?.computedAt !== undefined && before.classScore?.computedAt === undefined;
	const newlyAgreed =
		after.agreement?.computedAt !== undefined && before.agreement?.computedAt === undefined;
	const newlyEnded =
		after.status === AgoraSessionStatus.ended && before.status !== AgoraSessionStatus.ended;

	return newlyScored || newlyAgreed || newlyEnded;
}
