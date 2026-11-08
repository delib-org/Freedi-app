import { WaitingMember } from '@freedi/shared-types';

type WaitingRef = Pick<WaitingMember, 'statementId'>;

/**
 * Where the header's waiting badge leads: the space on screen when someone
 * waits there, else the space where most people wait (first one on a tie).
 * Null when nobody waits.
 */
export function pickWaitingStatementId(
	waitingList: ReadonlyArray<WaitingRef>,
	currentStatementId?: string,
): string | null {
	if (currentStatementId && waitingList.some((w) => w.statementId === currentStatementId)) {
		return currentStatementId;
	}
	const counts = new Map<string, number>();
	waitingList.forEach(({ statementId }) =>
		counts.set(statementId, (counts.get(statementId) ?? 0) + 1),
	);

	let best: string | null = null;
	counts.forEach((count, statementId) => {
		if (best === null || count > (counts.get(best) ?? 0)) best = statementId;
	});

	return best;
}

const MAX_BADGE_COUNT = 99;

/** "3", or "99+" above 99. */
export function formatWaitingCount(count: number): string {
	return count > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : String(count);
}
