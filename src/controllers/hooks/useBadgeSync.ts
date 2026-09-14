import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import {
	inAppNotificationsSelector,
	notificationFeedOwnerSelector,
} from '@/redux/notificationsSlice/notificationsSlice';
import { useAuthentication } from './useAuthentication';
import { relevantNotifications } from '@/utils/engagementNavigation';
import '../../../public/badge-store.js';

let pendingSync: Promise<void> = Promise.resolve();
/** Wait for the authenticated feed before replacing a background count. */
export const useBadgeSync = (): void => {
	const { user, isLoading } = useAuthentication();
	const notifications = useSelector(inAppNotificationsSelector);
	const owner = useSelector(notificationFeedOwnerSelector);
	const count = relevantNotifications(notifications, user?.uid).filter((n) => !n.read).length;
	useEffect(() => {
		if (isLoading || (user && owner !== user.uid)) return;
		const sync = (): void => {
			pendingSync = pendingSync
				.then(async () => {
					try {
						await globalThis.FreeDiBadgeStore.update({
							count,
							userId: user?.uid ?? null,
							notificationIds: notifications.flatMap((n) => [
								n.notificationId,
								`statement:${n.statementId}`,
							]),
						});
					} catch {
						/* Some private browsing modes disable IndexedDB. */
					}
					await globalThis.FreeDiBadgeStore.apply(count);
				})
				.catch(() => {});
		};
		sync();
		const onVisible = (): void => {
			if (document.visibilityState === 'visible') sync();
		};
		document.addEventListener('visibilitychange', onVisible);
		window.addEventListener('focus', sync);

		return () => {
			document.removeEventListener('visibilitychange', onVisible);
			window.removeEventListener('focus', sync);
		};
	}, [count, owner, user?.uid, isLoading, notifications]);
};
export default useBadgeSync;
