import React from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { NotificationDiagnostics } from '@/view/components/notifications/NotificationDiagnostics';
import GlobalNotificationSettings from '@/view/components/notifications/GlobalNotificationSettings';
import { useNotifications } from '@/controllers/hooks/useNotifications';
import { Link } from 'react-router';
import styles from './CheckNotifications.module.scss';

export default function CheckNotifications() {
	// Initialize notifications when on settings page
	useNotifications();
	const { t } = useTranslation();

	return (
		<div className={styles.settings}>
			<div className="btns" style={{ marginBottom: '1rem' }}>
				<Link to="/my" className="btn btn--secondary">
					← {t('Back to Profile')}
				</Link>
			</div>

			<h1>{t('Notification settings')}</h1>

			<section>
				<GlobalNotificationSettings />
			</section>

			<section>
				<h2>{t('Diagnostics')}</h2>
				<NotificationDiagnostics />
			</section>
		</div>
	);
}
