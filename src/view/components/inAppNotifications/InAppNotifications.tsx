import React from 'react';
import { X } from 'lucide-react';
import { inAppNotificationsSelector } from '@/redux/notificationsSlice/notificationsSlice';
import { useSelector } from 'react-redux';
import styles from './InAppNotifications.module.scss';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { NotificationType } from '@freedi/shared-types';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import NotificationCard from '../notificationCard/NotificationCard';
import {
	markMultipleNotificationsAsReadDB,
	clearAllInAppNotificationsDB,
} from '@/controllers/db/inAppNotifications/db_inAppNotifications';
import NotificationDeliveryControls from '../notifications/NotificationDeliveryControls';
import { relevantNotifications } from '@/utils/engagementNavigation';
import { logError } from '@/utils/errorHandling';

const InAppNotifications = ({ onClose }: { onClose?: () => void }) => {
	const creator = useSelector(creatorSelector);
	const inAppNotifications: NotificationType[] = relevantNotifications(
		useSelector(inAppNotificationsSelector),
		creator?.uid,
	);
	const { t } = useTranslation();

	const unreadIds = inAppNotifications
		.filter((n) => !n.read || n.read === undefined)
		.map((n) => n.notificationId);

	async function handleMarkAllAsRead(e: React.MouseEvent) {
		e.stopPropagation();
		try {
			if (unreadIds.length === 0) return;
			await markMultipleNotificationsAsReadDB(unreadIds);
		} catch (error) {
			logError(error, { operation: 'inAppNotifications.handleMarkAllAsRead' });
		}
	}

	async function handleClearMailbox(e: React.MouseEvent) {
		e.stopPropagation();
		try {
			await clearAllInAppNotificationsDB();
		} catch (error) {
			logError(error, { operation: 'inAppNotifications.handleClearMailbox' });
		}
	}

	return (
		<div className={styles.inAppNotifications} role="region" aria-label={t('Notifications')}>
			{onClose && (
				<button className={styles.close} onClick={onClose} type="button" aria-label={t('Close')}>
					<X size={20} />
				</button>
			)}
			<NotificationDeliveryControls />
			{inAppNotifications && inAppNotifications.length > 0 ? (
				<>
					<div className={styles.header}>
						<span className={styles.notificationTitle}>{t('Notifications')}</span>
						<div className={styles.actions}>
							{unreadIds.length > 0 && (
								<button className={styles.actionBtn} onClick={handleMarkAllAsRead} type="button">
									{t('Mark all as read')}
								</button>
							)}
							<button className={styles.actionBtn} onClick={handleClearMailbox} type="button">
								{t('Clear mailbox')}
							</button>
						</div>
					</div>
					<div className={styles.notificationsList}>
						{inAppNotifications.map((notification) => {
							return <NotificationCard key={notification.notificationId} {...notification} />;
						})}
					</div>
				</>
			) : (
				<div className={styles.noNotifications}>{t('You have no new notifications')}</div>
			)}
		</div>
	);
};

export default InAppNotifications;
