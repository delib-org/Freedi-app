import { StatementSubscription } from '@freedi/shared-types';
import { UI } from '@/constants/common';

/** `createdAt` of the oldest loaded subscription — the cursor for the next page. */
export function oldestCreatedAt(members: ReadonlyArray<StatementSubscription>): number | null {
	if (members.length === 0) return null;

	return members.reduce(
		(oldest, member) => Math.min(oldest, member.createdAt ?? oldest),
		Number.POSITIVE_INFINITY,
	);
}

export type ShowMoreSource = 'local' | 'server' | 'none';

interface ShowMorePlanInput {
	shownCount: number;
	matchingCount: number;
	hasMoreOnServer: boolean;
}

/** "Show 20 more" first pages what is loaded, then asks Firestore for the rest. */
export function planShowMore({
	shownCount,
	matchingCount,
	hasMoreOnServer,
}: ShowMorePlanInput): ShowMoreSource {
	if (matchingCount > shownCount) return 'local';

	return hasMoreOnServer ? 'server' : 'none';
}

/** How many the next "Show more" adds (the button's label). */
export function nextPageSize(input: ShowMorePlanInput): number {
	const source = planShowMore(input);
	if (source === 'local') {
		return Math.min(UI.MEMBERS_LOAD_MORE_COUNT, input.matchingCount - input.shownCount);
	}

	return source === 'server' ? UI.MEMBERS_LOAD_MORE_COUNT : 0;
}
