import React from 'react';
import { Link } from 'react-router';
import styles from './NotificationCard.module.scss';
import { NotificationType } from '@freedi/shared-types';
import { notificationDestination } from '@/utils/engagementNavigation';
import avatar from '@/assets/images/avatar.jpg';
import { markNotificationAsReadDB } from '@/controllers/db/inAppNotifications/db_inAppNotifications';

const NotificationCard: React.FC<NotificationType> = (notification) => {
	// ✅ Handle click to mark as read (with fallback for missing field)
	const handleClick = async () => {
		// If read field doesn't exist or is false, mark as read
		if (!notification.read || notification.read === undefined) {
			await markNotificationAsReadDB(notification.notificationId);
		}
	};

	return (
		<Link
			to={notificationDestination(notification)}
			key={notification.notificationId}
			className={`${styles.notificationLink} ${notification.read ? styles.read : styles.unread}`}
			onClick={handleClick}
		>
			<div className={`${styles.notificationCard} ${notification.read ? '' : styles.unread}`}>
				<img className={styles.avatar} src={notification.creatorImage || avatar} alt="" />
				<div className={styles.text}>
					{notification.parentStatement && notification.parentStatement !== 'top' && (
						<span className={styles.discussion}>{notification.parentStatement}</span>
					)}
					<span className={styles.username}>{notification.title || notification.creatorName}</span>{' '}
					<span className={styles.message}>{notification.text}</span>
				</div>
			</div>
		</Link>
	);
};

export default NotificationCard;
