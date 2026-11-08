import { useEffect } from 'react';
import { useAppSelector } from './reduxHooks';
import { inAppNotificationsSelector } from '@/redux/notificationsSlice/notificationsSlice';
import { markMultipleNotificationsAsReadDB } from '@/controllers/db/inAppNotifications/db_inAppNotifications';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { relevantNotifications } from '@/utils/engagementNavigation';

/** Read receipts follow messages actually visible for two seconds, including virtualized lists. */
export function useReadVisibleNotifications(
	container: HTMLElement | null,
	statementId?: string,
): void {
	const notifications = useAppSelector(inAppNotificationsSelector);
	const user = useAppSelector(creatorSelector);
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
							}, 2000),
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
