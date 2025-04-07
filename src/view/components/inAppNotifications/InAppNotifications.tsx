import { inAppNotificationsSelector } from '@/redux/notificationsSlice/notificationsSlice';
import { useSelector } from 'react-redux';
import { Link } from 'react-router';
import styles from './InAppNotifications.module.scss';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { NotificationType } from 'delib-npm';
import { creatorSelector } from '@/redux/creator/creatorSlice';

const InAppNotifications = () => {
	const creator = useSelector(creatorSelector);
	const inAppNotifications: NotificationType[] = useSelector(inAppNotificationsSelector).filter(n => n.userId !== creator?.uid);

	const { t } = useUserConfig();

	return (
		<div className={styles.inAppNotifications}>
			{inAppNotifications && inAppNotifications.length > 0 ? (
				<>
					<span className={styles.notificationTitle}>{t('Notifications')}</span>
					{inAppNotifications.map((notification) => {

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
						);
					})}
				</>
			) : (
				<div className={styles.noNotifications}>{t('You have no new notifications')}</div>
			)}
		</div>
	)
}

export default InAppNotifications