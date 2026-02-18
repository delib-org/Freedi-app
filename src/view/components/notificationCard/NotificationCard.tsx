import React from 'react';
import { Link } from 'react-router';
import styles from './NotificationCard.module.scss';
import { NotificationType } from '@freedi/shared-types';
import { isChatMessage, isMassConsensus } from '@/controllers/general/helpers';
import { markNotificationAsReadDB } from '@/controllers/db/inAppNotifications/db_inAppNotifications';

const NotificationCard: React.FC<NotificationType> = (notification) => {
	const notificationType = () => {
		if (isChatMessage(notification.statementType))
			return `/statement-screen/${notification.parentId}/chat`;

		if (isMassConsensus(notification.questionType)) return `/statement/${notification.parentId}`;

		return `/statement/${notification.statementId}`;
	};

	// ✅ Handle click to mark as read (with fallback for missing field)
	const handleClick = async () => {
		// If read field doesn't exist or is false, mark as read
		if (!notification.read || notification.read === undefined) {
			await markNotificationAsReadDB(notification.notificationId);
		}
	};

	return (
		<Link
			to={notificationType()}
			key={notification.notificationId}
			className={`${styles.notificationLink} ${notification.read ? styles.read : styles.unread}`}
			onClick={handleClick}
		>
			<div className={`${styles.notificationCard} ${notification.read ? '' : styles.unread}`}>
				<img
					className={styles.avatar}
					src={notification.creatorImage || '/src/assets/images/avatar.jpg'}
					alt="User avatar"
				/>
				<div className={styles.text}>
					<span className={styles.username}>{notification.creatorName}</span>
					{notification.text}
				</div>
			</div>
		</Link>
	);
};

export default NotificationCard;
