import { useEffect, useState } from 'react';
import { Download, Bell } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { isInstalledPWA } from '@/services/platformService';
import styles from './NotificationDeliveryControls.module.scss';

export default function NotificationDeliveryControls() {
	const { t } = useTranslation();
	const [permission, setPermission] = useState(() =>
		'Notification' in window ? Notification.permission : 'unsupported',
	);
	const installed = isInstalledPWA();
	useEffect(() => {
		const update = (): void =>
			setPermission('Notification' in window ? Notification.permission : 'unsupported');
		const timer = window.setInterval(update, 1000);

		return () => window.clearInterval(timer);
	}, []);

	return (
		<div className={styles.delivery}>
			{!installed && (
				<button
					type="button"
					onClick={() => window.dispatchEvent(new Event('freedi:open-install-prompt'))}
				>
					<Download size={17} />
					{t('Install app')}
				</button>
			)}
			{permission === 'default' && (
				<button
					type="button"
					onClick={() => window.dispatchEvent(new Event('freedi:open-notification-prompt'))}
				>
					<Bell size={17} />
					{t('Enable notifications')}
				</button>
			)}
			{permission === 'denied' && (
				<p>{t('Notifications are off. You can enable them in your device settings.')}</p>
			)}
			<p>
				{t(
					'Unread updates stay here. Installed apps can also show a count on their icon, where supported.',
				)}
			</p>
		</div>
	);
}
