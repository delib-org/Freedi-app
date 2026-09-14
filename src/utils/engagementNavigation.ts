import { NotificationType } from '@freedi/shared-types';

/** Links to the actual contribution, using the chat's existing hash navigation. */
export function notificationDestination(notification: NotificationType): string {
	const id = notification.statementId;
	const parent = notification.parentId;
	if (
		notification.targetPath?.startsWith('/') &&
		!notification.targetPath.startsWith('//') &&
		!notification.targetPath.includes('\\')
	) {
		return notification.targetPath;
	}
	if (!parent || parent === 'top') return id ? `/statement/${encodeURIComponent(id)}` : '/home';

	return `/statement/${encodeURIComponent(parent)}?tab=chat#${encodeURIComponent(id)}`;
}

export function relevantNotifications(
	notifications: NotificationType[],
	userId: string | undefined,
): NotificationType[] {
	return userId
		? notifications.filter((item) => item.userId === userId && item.creatorId !== userId)
		: [];
}
