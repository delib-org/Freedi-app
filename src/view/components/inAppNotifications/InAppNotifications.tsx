import { inAppNotificationsSelector } from '@/redux/notificationsSlice/notificationsSlice';
import { useSelector } from 'react-redux';
import { Link } from 'react-router';
import styles from './InAppNotifications.module.scss';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { store } from '@/redux/store';

const InAppNotifications = () => {
	const inAppNotifications = useSelector(inAppNotificationsSelector)
	const { t, dir } = useUserConfig();

	return (
		<div className={`${styles.inAppNotifications} ${styles[dir]}`}>
			<span className={styles.notificationTitle}>{t('Notifications')}</span>

			{inAppNotifications.map((notification) => {

				return (
					<Link to={`/statement/${notification.parentId}`} key={notification.notificationId} className={styles.notificationLink}>
						<div className={styles.notificationCard}>
							<img
								className={styles.avatar}
								src={notification.creatorImage || '/src/assets/images/avatar.jpg'}
								alt='User avatar'
							/>
							<div className={styles.text}>
								<span className={styles.username}>{notification.creatorName}</span>
								{notification.text}
							</div>
						</div>
					</Link>
				);
			})}
		</div>
	)
}

export default InAppNotifications