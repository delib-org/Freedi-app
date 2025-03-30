import { inAppNotificationsSelector } from '@/redux/notificationsSlice/notificationsSlice';
import { useSelector } from 'react-redux';
import { Link } from 'react-router';
import styles from './InAppNotifications.module.scss';

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