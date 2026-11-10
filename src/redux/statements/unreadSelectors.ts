import { computeUnreadMessages } from '@/helpers/unreadMessages';
import { statementSelector, statementSubscriptionSelector } from './statementsSlice';

type StatementsRoot = Parameters<ReturnType<typeof statementSelector>>[0];

/**
 * Unread messages under one statement for the signed-in person. Returns a
 * number, so a card re-renders only when its own number changes.
 *
 * The person's seen marker comes from the subscription doc in Redux (top-level
 * ones, listened to) and from the seenMessageCounts map (the rest of the
 * tree, fetched once); when both exist the larger wins, since a marker only
 * ever grows. No marker anywhere = never opened = no number.
 */
export const unreadMessagesSelector =
	(statementId: string | undefined) =>
	(state: StatementsRoot): number => {
		if (!statementId) return 0;
		const subscription = statementSubscriptionSelector(statementId)(state);
		const mapped = state.statements.seenMessageCounts[statementId];
		if (!subscription && mapped === undefined) return 0;

		const count =
			statementSelector(statementId)(state)?.descendantMessageCount ??
			state.statements.fetchedMessageCounts[statementId];

		return computeUnreadMessages(count, {
			seenMessageCount: Math.max(subscription?.seenMessageCount ?? 0, mapped ?? 0),
		});
	};
