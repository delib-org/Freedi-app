import MailIcon from '@/assets/icons/mailIcon.svg?react';
import { useCallback, useState } from 'react';
import InAppNotifications from '../inAppNotifications/InAppNotifications';
import { useSelector, useDispatch } from 'react-redux';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { NotificationType } from '@freedi/shared-types';
import {
	inAppNotificationsSelector,
	markNotificationsAsViewedInList,
} from '@/redux/notificationsSlice/notificationsSlice';
import styles from './NotificationBtn.module.scss';
import useClickOutside from '@/controllers/hooks/useClickOutside';
import { markNotificationsAsViewedInListDB } from '@/controllers/db/inAppNotifications/db_inAppNotifications';
import UnreadBadge from '../unreadBadge/UnreadBadge';

const NotificationBtn = () => {
	const creator = useSelector(creatorSelector);
	const dispatch = useDispatch();

	// ✅ Get all notifications (for dropdown display)
	const allNotificationsList: NotificationType[] = useSelector(inAppNotificationsSelector).filter(
		(n) => n.creatorId !== creator?.uid,
	);

	// ✅ Count only UNREAD notifications for badge (with fallback for missing field)
	const unreadCount = allNotificationsList.filter((n) => !n.read || n.read === undefined).length;

	const [showInAppNotifications, setShowInAppNotifications] = useState(false);

	function handleShowInAppNotifications() {
		setShowInAppNotifications(!showInAppNotifications);

		// ✅ Mark unread notifications as viewed after 2 seconds
		if (!showInAppNotifications && unreadCount > 0) {
			setTimeout(() => {
				const unreadIds = allNotificationsList
					.filter((n) => !n.read && !n.viewedInList)
					.map((n) => n.notificationId);

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
		<div
			onClick={handleShowInAppNotifications}
			className={styles.notificationBtn}
			role="button"
			tabIndex={0}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') handleShowInAppNotifications();
			}}
		>
			{unreadCount > 0 && (
				<UnreadBadge
					count={unreadCount}
					position="absolute"
					ariaLabel={`${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`}
				/>
			)}
			<MailIcon />
			{showInAppNotifications && (
				<div
					ref={(node) => {
						if (notifRef) notifRef.current = node;
					}}
				>
					<InAppNotifications />
				</div>
			)}
		</div>
	);
};

export default NotificationBtn;
