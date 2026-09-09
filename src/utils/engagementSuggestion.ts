import { NotificationType, Statement } from '@freedi/shared-types';
import { notificationDestination } from './engagementNavigation';

export interface EngagementSuggestion {
	title: string;
	body: string;
	action: string;
	to?: string;
	count?: number;
}
interface SuggestionContext {
	statement?: Statement;
	unread: NotificationType[];
	options: Statement[];
	evaluatedIds: Set<string>;
	halted: boolean;
	firstSpaceId?: string;
}

export function getEngagementSuggestion({
	statement,
	unread,
	options,
	evaluatedIds,
	halted,
	firstSpaceId,
}: SuggestionContext): EngagementSuggestion {
	const updates = unread.filter((n) => !statement || n.parentId === statement.statementId);
	const next = [...updates].sort((a, b) => b.createdAt - a.createdAt)[0];
	if (next)
		return {
			title: 'A little catch-up?',
			body:
				updates.length === 1
					? 'One unread update is waiting for you.'
					: '{{count}} unread updates are waiting for you.',
			count: updates.length,
			action: 'See what is new',
			to: notificationDestination(next),
		};
	if (statement) {
		const candidates = options.filter(
			(option) => !option.hide && !evaluatedIds.has(option.statementId),
		);
		if (!halted && statement.statementSettings?.showEvaluation !== false && candidates.length)
			return {
				title: 'Your perspective can help.',
				body: 'Take a look at a proposal and share how well it works for you.',
				action: 'Explore a proposal',
				to: `/statement/${encodeURIComponent(candidates[0].statementId)}`,
			};

		return {
			title: 'Let us think together.',
			body: 'Read a different point of view. What could make the idea work better?',
			action: 'Join the conversation',
			to: `/statement/${encodeURIComponent(statement.statementId)}?tab=chat`,
		};
	}
	if (firstSpaceId)
		return {
			title: 'One small step together.',
			body: 'Pick up a conversation and see what you can add.',
			action: 'Continue a conversation',
			to: `/statement/${encodeURIComponent(firstSpaceId)}`,
		};

	return {
		title: 'Hello, I am your little guide.',
		body: 'Every shared solution starts with a question. What would you like to work on together?',
		action: 'Start with a question.',
	};
}
