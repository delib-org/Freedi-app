export interface SeenMarker {
	seenMessageCount?: number;
}

/**
 * Messages (chat messages + answers) below a statement that this person has
 * not seen. The server counts them on the statement
 * (`descendantMessageCount`); the person's subscription remembers how many
 * there were when they last opened it (`seenMessageCount`).
 *
 * - No subscription (never opened) -> 0, show nothing.
 * - A subscription without a marker counts as 0 seen.
 * - Never negative (a delete can leave the marker ahead of the count).
 */
export function computeUnreadMessages(
	descendantMessageCount: number | undefined,
	subscription: SeenMarker | undefined,
): number {
	if (!subscription) return 0;

	return Math.max(0, (descendantMessageCount ?? 0) - (subscription.seenMessageCount ?? 0));
}
