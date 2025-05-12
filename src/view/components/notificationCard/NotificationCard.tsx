import React from 'react';
import { Link } from 'react-router';
import styles from './NotificationCard.module.scss';
import { NotificationType, StatementType } from 'delib-npm';

const NotificationCard: React.FC<NotificationType> = (notification) => {
	const isChat = notification?.statementType === StatementType.statement;

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
