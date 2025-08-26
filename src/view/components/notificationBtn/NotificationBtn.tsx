import MailIcon from '@/assets/icons/mailIcon.svg?react';
import { useCallback, useState, useEffect } from 'react'
import InAppNotifications from '../inAppNotifications/InAppNotifications';
import { useSelector, useDispatch } from 'react-redux';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { NotificationType } from 'delib-npm';
import { inAppNotificationsSelector, markNotificationsAsViewedInList } from '@/redux/notificationsSlice/notificationsSlice';
import styles from './NotificationBtn.module.scss';
import useClickOutside from '@/controllers/hooks/useClickOutside';
import { markNotificationsAsViewedInListDB } from '@/controllers/db/inAppNotifications/db_inAppNotifications';

const NotificationBtn = () => {
	const creator = useSelector(creatorSelector);
	const dispatch = useDispatch();
	
	// ✅ Get all notifications (for dropdown display)
	const allNotificationsList: NotificationType[] = useSelector(inAppNotificationsSelector)
		.filter(n => n.creatorId !== creator?.uid);
	
	// ✅ Count only UNREAD notifications for badge (with fallback for missing field)
	const unreadCount = allNotificationsList.filter(n => !n.read || !('read' in n)).length;
	
	const [showInAppNotifications, setShowInAppNotifications] = useState(false);

	function handleShowInAppNotifications() {
		setShowInAppNotifications(!showInAppNotifications);
		
		// ✅ Mark unread notifications as viewed after 2 seconds
		if (!showInAppNotifications && unreadCount > 0) {
			setTimeout(() => {
				const unreadIds = allNotificationsList
					.filter(n => !n.read && !n.viewedInList)
					.map(n => n.notificationId);
				
				if (unreadIds.length > 0) {
					dispatch(markNotificationsAsViewedInList(unreadIds));
					markNotificationsAsViewedInListDB(unreadIds);
				}
			}, 2000);
		}
	}

	const handleClickOutside = useCallback(() => {
		if (showInAppNotifications) setShowInAppNotifications(false);
	}, [showInAppNotifications, setShowInAppNotifications]);
	
	const notifRef = useClickOutside(handleClickOutside);

	return (
		<button onClick={handleShowInAppNotifications} className={styles.notificationBtn}>
			<div className={styles.icon}>
				{/* ✅ Show badge only if there are UNREAD notifications */}
				{unreadCount > 0 && (
					<div className={styles.redCircle}>
						{unreadCount < 10
							? unreadCount
							: `9+`}
					</div>
				)}
			</div>
			<MailIcon />
			{showInAppNotifications && <div ref={(node) => {
				if (notifRef) notifRef.current = node;}}>
					<InAppNotifications />
				</div>}
		</button>
	)
}

export default NotificationBtn