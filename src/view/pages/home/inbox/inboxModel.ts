import { NotificationType, StatementType } from '@freedi/shared-types';
import { TIME } from '@/constants/common';

export type InboxFilter = 'all' | 'unread' | 'agreements';
export type InboxKind = 'agreement' | 'answer' | 'question' | 'chat';

export const INBOX_FILTERS: { id: InboxFilter; labelKey: string }[] = [
	{ id: 'all', labelKey: 'All' },
	{ id: 'unread', labelKey: 'Unread' },
	{ id: 'agreements', labelKey: 'Agreements' },
];

export function inboxKind(notification: Pick<NotificationType, 'statementType'>): InboxKind {
	switch (notification.statementType) {
		case StatementType.agreement:
			return 'agreement';
		case StatementType.option:
			return 'answer';
		case StatementType.question:
			return 'question';
		default:
			return 'chat';
	}
}

export function filterInbox(
	notifications: NotificationType[],
	filter: InboxFilter,
): NotificationType[] {
	if (filter === 'unread') return notifications.filter((n) => !n.read);
	if (filter === 'agreements') return notifications.filter((n) => inboxKind(n) === 'agreement');

	return notifications;
}

const isSafeInternalPath = (path: string | undefined): path is string =>
	!!path && path.startsWith('/') && !path.startsWith('//') && !path.includes('\\');

/**
 * Deep link to the right question AND tab: a chat message opens the chat on
 * that message, an answer opens the answers tab on that answer, an agreement
 * opens the covenant tab, a new question opens the question itself.
 */
export function inboxDestination(notification: NotificationType): string {
	if (isSafeInternalPath(notification.targetPath)) return notification.targetPath;
	const id = notification.statementId;
	const parent = notification.parentId;
	const kind = inboxKind(notification);
	if (kind === 'question' || !parent || parent === 'top') {
		return id ? `/statement/${encodeURIComponent(id)}` : '/home';
	}
	const parentPath = `/statement/${encodeURIComponent(parent)}`;
	if (kind === 'agreement') return `${parentPath}?tab=covenant`;
	if (kind === 'answer') return `${parentPath}?tab=options#${encodeURIComponent(id)}`;

	return `${parentPath}?tab=chat#${encodeURIComponent(id)}`;
}

const RELATIVE_STEPS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
	{ unit: 'week', ms: TIME.WEEK },
	{ unit: 'day', ms: TIME.DAY },
	{ unit: 'hour', ms: TIME.HOUR },
	{ unit: 'minute', ms: TIME.MINUTE },
];

/** "לפני שעה", "אתמול" — localised by Intl; falls back to a date. */
export function formatRelativeTime(createdAt: number, now: number, locale: string): string {
	const elapsed = Math.max(0, now - createdAt);
	try {
		const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
		if (elapsed > TIME.MONTH) {
			return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(createdAt);
		}
		const step = RELATIVE_STEPS.find(({ ms }) => elapsed >= ms);

		return step
			? format.format(-Math.floor(elapsed / step.ms), step.unit)
			: format.format(0, 'minute');
	} catch {
		return new Date(createdAt).toLocaleDateString();
	}
}
