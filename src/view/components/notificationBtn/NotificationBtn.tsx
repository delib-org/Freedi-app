import MailIcon from '@/assets/icons/mailIcon.svg?react';
import { useCallback, useState } from 'react'
import InAppNotifications from '../inAppNotifications/InAppNotifications';
import { useSelector } from 'react-redux';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { NotificationType } from 'delib-npm';
import { inAppNotificationsSelector } from '@/redux/notificationsSlice/notificationsSlice';
import styles from './NotificationBtn.module.scss';
import useClickOutside from '@/controllers/hooks/useClickOutside';

const NotificationBtn = () => {
	const creator = useSelector(creatorSelector);
	const inAppNotificationsList: NotificationType[] = useSelector(inAppNotificationsSelector).filter(n => n.creatorId !== creator?.uid);
	const [showInAppNotifications, setShowInAppNotifications] = useState(false);

	function handleShowInAppNotifications() {
		setShowInAppNotifications(!showInAppNotifications);
	}

	const handleClickOutside = useCallback(() => {
			if (showInAppNotifications) setShowInAppNotifications(false);
		}, [showInAppNotifications, setShowInAppNotifications]);
	
		const notifRef = useClickOutside(handleClickOutside);

	return (
		<button onClick={handleShowInAppNotifications} className={styles.notificationBtn}>
			<div className={styles.icon}>
				{inAppNotificationsList.length > 0 && (
					<div className={styles.redCircle}>
						{inAppNotificationsList.length < 10
							? inAppNotificationsList.length
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