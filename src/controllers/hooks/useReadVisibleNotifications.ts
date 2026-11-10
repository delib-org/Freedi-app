import { useEffect } from 'react';
import { useAppSelector } from './reduxHooks';
import { inAppNotificationsSelector } from '@/redux/notificationsSlice/notificationsSlice';
import {
	markMultipleNotificationsAsReadDB,
	markStatementNotificationsAsReadDB,
} from '@/controllers/db/inAppNotifications/db_inAppNotifications';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { relevantNotifications } from '@/utils/engagementNavigation';
import { NOTIFICATION } from '@/constants/common';

/** Read receipts follow messages actually visible for two seconds, including virtualized lists. */
export function useReadVisibleNotifications(
	container: HTMLElement | null,
	statementId?: string,
): void {
	const notifications = useAppSelector(inAppNotificationsSelector);
	const user = useAppSelector(creatorSelector);
	// The feed is bounded, so with a full backlog this question's older notices may
	// not be loaded and could never be seen as visible. Clear them by query instead.
	const backlogIsFull =
		notifications.filter((n) => !n.read).length >= NOTIFICATION.UNREAD_LISTENER_LIMIT;
	useEffect(() => {
		if (!container || !statementId || !backlogIsFull) return;
		const timer = setTimeout(() => {
			if (document.visibilityState === 'visible')
				void markStatementNotificationsAsReadDB(statementId);
		}, NOTIFICATION.READ_RECEIPT_DELAY_MS);

		return () => clearTimeout(timer);
	}, [container, statementId, backlogIsFull]);
	useEffect(() => {
		if (!container || !statementId || typeof IntersectionObserver === 'undefined') return;
		const unread = relevantNotifications(notifications, user?.uid).filter(
			(n) => !n.read && n.parentId === statementId,
		);
		if (!unread.length) return;
		const timers = new Map<Element, ReturnType<typeof setTimeout>>();
		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					clearTimeout(timers.get(entry.target));
					timers.delete(entry.target);
					if (!entry.isIntersecting || document.visibilityState !== 'visible') return;
					const ids = unread
						.filter((n) => n.statementId === entry.target.getAttribute('data-contribution-id'))
						.map((n) => n.notificationId);
					if (ids.length)
						timers.set(
							entry.target,
							setTimeout(() => {
								timers.delete(entry.target);
								if (document.visibilityState === 'visible' && entry.target.isConnected)
									void markMultipleNotificationsAsReadDB(ids);
							}, NOTIFICATION.READ_RECEIPT_DELAY_MS),
						);
				});
			},
			{ threshold: 0.1 },
		);
		const refresh = (): void => {
			observer.disconnect();
			timers.forEach(clearTimeout);
			timers.clear();
			if (document.visibilityState === 'visible')
				container
					.querySelectorAll('[data-contribution-id]')
					.forEach((element) => observer.observe(element));
		};
		const mutations = new MutationObserver(refresh);
		mutations.observe(container, { childList: true, subtree: true });
		document.addEventListener('visibilitychange', refresh);
		refresh();

		return () => {
			observer.disconnect();
			mutations.disconnect();
			timers.forEach(clearTimeout);
			document.removeEventListener('visibilitychange', refresh);
		};
	}, [container, statementId, notifications, user?.uid]);
}
