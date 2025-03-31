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
				// const userId = notification.userId;
				const user = store.getState().creator.creator;
				const avatarSrc = user?.photoURL || '/images/avatar.png';

				return (
					<div key={notification.notificationId} className={styles.notificationCard}>
						{/* <img
							className={styles.avatar}
							src={avatarSrc}
							alt={user?.displayName ? user.displayName : 'User avatar'}
						/> */}
						<div className={styles.text}>
							{/* <span className={styles.username}>{user?.displayName}</span> */}
							<Link to={`/statement/${notification.parentId}`}>
								{notification.text}
							</Link>
						</div>

					</div>

				);
			})}
		</div>
	)
}

export default InAppNotifications