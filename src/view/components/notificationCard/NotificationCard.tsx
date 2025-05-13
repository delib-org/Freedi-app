import React from 'react';
import { Link } from 'react-router';
import styles from './NotificationCard.module.scss';
import { NotificationType } from 'delib-npm';
import { isChatMessage } from '@/controllers/general/helpers';

const NotificationCard: React.FC<NotificationType> = (notification) => {
	const isChat = isChatMessage(notification.statementType);

	return (
		<Link
			to={
				isChat
					? `/statement-screen/${notification.parentId}/chat`
					: `/statement/${notification.statementId}`
			}
			key={notification.notificationId}
			className={styles.notificationLink}
		>
			<div className={styles.notificationCard}>
				<img
					className={styles.avatar}
					src={
						notification.creatorImage ||
						'/src/assets/images/avatar.jpg'
					}
					alt='User avatar'
				/>
				<div className={styles.text}>
					<span className={styles.username}>
						{notification.creatorName}
					</span>
					{notification.text}
				</div>
			</div>
		</Link>
	);
};

export default NotificationCard;
