import { inAppNotificationsSelector } from '@/redux/notificationsSlice/notificationsSlice';
import { useSelector } from 'react-redux';
import styles from './InAppNotifications.module.scss';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { NotificationType } from '@freedi/shared-types';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import NotificationCard from '../notificationCard/NotificationCard';

const InAppNotifications = () => {
	const creator = useSelector(creatorSelector);
	const inAppNotifications: NotificationType[] = useSelector(inAppNotificationsSelector).filter(
		(n) => n.creatorId !== creator?.uid,
	);
	const { t } = useTranslation();

	return (
		<div className={styles.inAppNotifications}>
			{inAppNotifications && inAppNotifications.length > 0 ? (
				<>
					<span className={styles.notificationTitle}>{t('Notifications')}</span>
					{inAppNotifications.map((notification) => {
						return <NotificationCard key={notification.notificationId} {...notification} />;
					})}
				</>
			) : (
				<div className={styles.noNotifications}>{t('You have no new notifications')}</div>
			)}
		</div>
	);
};

export default InAppNotifications;
