import React from 'react';
import { Link } from 'react-router';
import styles from './NotificationCard.module.scss';
import { NotificationType, StatementType } from 'delib-npm';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { useSelector } from 'react-redux';

const NotificationCard: React.FC<NotificationType> = (notification) => {
	const statement = useSelector(statementSelector(notification.statementId));
	const isMessage =
		statement?.statementType === StatementType.question ||
		statement?.statementType === StatementType.option;

	return (
		<Link
			to={
				isMessage
					? `/statement/${notification.statementId}`
					: `/statement-screen/${notification.parentId}/chat`
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
