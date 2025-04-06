import React from 'react'
import { Link } from 'react-router'
import styles from './NotificationCard.module.scss'
import { NotificationType } from 'delib-npm'

const NotificationCard: React.FC<NotificationType> = (notification) => {
	return (
		<Link
			to={`/statement/${notification.parentId}`}
			key={notification.notificationId}
			className={styles.notificationLink}
		>
			<div className={styles.notificationCard}>
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
	)
}

export default NotificationCard