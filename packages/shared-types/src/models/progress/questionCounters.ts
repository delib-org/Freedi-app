/**
 * Counters about a question that change once per person.
 *
 * A question document is delivered to everyone present each time it changes,
 * so a counter written there on every arrival or first rating costs people x
 * people reads. The exact number lives on `questionProgress`, which is read
 * one-shot and has no listeners. The question document keeps a copy that only
 * moves at the milestones below, for readers that have no progress doc.
 */

/** Every count up to `upTo` that is a multiple of `step` is copied to the question. */
const MILESTONE_TIERS: ReadonlyArray<{ upTo: number; step: number }> = [
	{ upTo: 20, step: 1 },
	{ upTo: 100, step: 5 },
	{ upTo: 1000, step: 25 },
];
const LARGE_COUNT_STEP = 100;

/**
 * True when `count` should be copied onto the question document. Small groups
 * stay exact; a 1,000-person question moves the copy about 70 times, not 1,000.
 */
export function isCounterMilestone(count: number): boolean {
	if (!Number.isInteger(count) || count < 0) return false;
	const tier = MILESTONE_TIERS.find(({ upTo }) => count <= upTo);

	return count % (tier?.step ?? LARGE_COUNT_STEP) === 0;
}

/** The parts of a progress doc these readers need; null while it has not loaded. */
export type CounterProgress = {
	entered?: number;
	members?: number;
} | null | undefined;

interface MembersScope {
	numberOfMembers?: number;
}

interface ViewsScope {
	viewed?: { individualViews?: number };
}

/**
 * Members of a question. `progress.members` is an exact recount, so it wins
 * whenever present; older questions fall back to the statement field.
 */
export function resolveMemberCount(
	progress: CounterProgress,
	statement: MembersScope | undefined,
): number | undefined {
	return progress?.members ?? statement?.numberOfMembers;
}

/**
 * People who opened a question. Views recorded before `entered` existed live
 * only on the statement, so the larger of the two is the one to show.
 * Undefined when neither has anything, so callers can show "not recorded".
 */
export function resolveViewCount(
	progress: CounterProgress,
	statement: ViewsScope | undefined,
): number | undefined {
	const views = Math.max(progress?.entered ?? 0, statement?.viewed?.individualViews ?? 0);

	return views > 0 ? views : undefined;
}
