import MailIcon from '@/assets/icons/mailIcon.svg?react';
import { useState } from 'react'
import InAppNotifications from '../inAppNotifications/InAppNotifications';
import { useSelector } from 'react-redux';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { NotificationType } from 'delib-npm';
import { inAppNotificationsSelector } from '@/redux/notificationsSlice/notificationsSlice';
import styles from './NotificationBtn.module.scss';

const NotificationBtn = () => {
	const creator = useSelector(creatorSelector);
	const InAppNotificationsList: NotificationType[] = useSelector(inAppNotificationsSelector).filter(n => n.creatorId !== creator?.uid);
	const [showInAppNotifications, setShowInAppNotifications] = useState(false);

	function handleShowInAppNotifications() {
		setShowInAppNotifications(!showInAppNotifications);
	}

	return (
		<button onClick={handleShowInAppNotifications} className={styles.notificationBtn}>
			<div className={styles.icon}>
				{InAppNotificationsList.length > 0 && (
					<div className={styles.redCircle}>
						{InAppNotificationsList.length < 10
							? InAppNotificationsList.length
							: `9+`}
					</div>
				)}
			</div>
			<MailIcon />
			{showInAppNotifications && <InAppNotifications />}
		</button>
	)
}

export default NotificationBtn