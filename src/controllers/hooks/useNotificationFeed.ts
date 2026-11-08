import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useAuthentication } from './useAuthentication';
import { listenToInAppNotifications } from '@/controllers/db/inAppNotifications/db_inAppNotifications';
import { resetNotificationFeed } from '@/redux/notificationsSlice/notificationsSlice';

export function useNotificationFeed(): void {
	const { user, isLoading } = useAuthentication();
	const dispatch = useDispatch();
	useEffect(() => {
		if (isLoading) return;
		dispatch(resetNotificationFeed());
		if (!user) return;

		return listenToInAppNotifications();
	}, [user?.uid, isLoading, dispatch]);
}
