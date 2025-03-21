import { inAppNotificationsSelector } from '@/redux/notificationsSlice/notificationsSlice'
import React from 'react'
import { useSelector } from 'react-redux';
import styles from './InAppNotifications.module.scss'
import { Link } from 'react-router';

const InAppNotifications = () => {
	const inAppNotifications = useSelector(inAppNotificationsSelector)

	return (
		<div className={styles.inAppNotifications}>
			{inAppNotifications.map((notification) => {
				return (
					<Link to={`/statement/${notification.parentId}`} key={notification.notificationId}>
						{notification.text}
					</Link>
				);
			})}
		</div>
	)
}

export default InAppNotifications