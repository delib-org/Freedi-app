import React, { useState, useEffect } from 'react';
import styles from './notificationPrompt.module.scss';
import useNotifications from '@/controllers/hooks/useNotifications';
import { isIOS, isInstalledPWA, getIOSVersion } from '@/services/platformService';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import {
	trackPermissionRequest,
	trackIOSInstallPromptShown,
	trackIOSUnsupportedPromptShown,
} from '@/services/notificationAnalytics';

interface NotificationPromptProps {
	isOpen?: boolean;
	onClose?: (reason: 'dismissed' | 'requested') => void;
}

/**
 * A component that prompts the user to enable notifications.
 * Shows iOS-specific guidance for users who need to install the PWA first.
 */
const NotificationPrompt: React.FC<NotificationPromptProps> = ({ isOpen = false, onClose }) => {
	const [visible, setVisible] = useState(false);
	const { permissionState, requestPermission } = useNotifications();
	const { t } = useTranslation();

	// Detect iOS-specific scenarios
	const isIOSDevice = isIOS();
	const isPWAInstalled = isInstalledPWA();
	const iosVersion = getIOSVersion();
	const isIOSVersionSupported = iosVersion !== null && iosVersion >= 16;
	const needsPWAInstall = isIOSDevice && !isPWAInstalled && isIOSVersionSupported;
	const isIOSUnsupported = isIOSDevice && !isIOSVersionSupported;

	// Check if we should show the notification prompt based on isOpen and permission state
	useEffect(() => {
		if (isOpen && permissionState.permission === 'default' && !permissionState.loading) {
			setVisible(true);

			// Track iOS-specific prompts
			if (isIOSUnsupported) {
				trackIOSUnsupportedPromptShown();
			} else if (needsPWAInstall) {
				trackIOSInstallPromptShown();
			}
		} else {
			setVisible(false);
		}
	}, [
		isOpen,
		permissionState.permission,
		permissionState.loading,
		isIOSUnsupported,
		needsPWAInstall,
	]);

	// Handle permission request
	const handleEnableClick = async (): Promise<void> => {
		const result = await requestPermission();
		trackPermissionRequest(result);
		setVisible(false);
		onClose?.('requested');
	};

	// Handle dismissal
	const handleDismissClick = (): void => {
		setVisible(false);
		onClose?.('dismissed');
	};

	if (!visible) return null;

	// Render iOS-specific messages
	const renderIOSContent = (): React.ReactNode => {
		if (isIOSUnsupported) {
			return (
				<>
					<div className={styles['notificationPrompt-message']}>
						<h3>{t('notifications.iosUnsupportedTitle')}</h3>
						<p>{t('notifications.iosUnsupportedMessage')}</p>
					</div>
					<div className={styles['notificationPrompt-actions']}>
						<button onClick={handleDismissClick} className={styles['notificationPrompt-enable']}>
							{t('common.ok')}
						</button>
					</div>
				</>
			);
		}

		if (needsPWAInstall) {
			return (
				<>
					<div className={styles['notificationPrompt-message']}>
						<h3>{t('notifications.installAppTitle')}</h3>
						<p>{t('notifications.installAppMessage')}</p>
						<div className={styles.iosInstructions}>
							<p>{t('notifications.iosInstallSteps')}</p>
							<ol>
								<li>
									{t('notifications.iosStep1')} <span aria-hidden="true">⬆️</span>
								</li>
								<li>{t('notifications.iosStep2')}</li>
								<li>{t('notifications.iosStep3')}</li>
								<li>{t('notifications.iosStep4')}</li>
							</ol>
						</div>
					</div>
					<div className={styles['notificationPrompt-actions']}>
						<button onClick={handleDismissClick} className={styles['notificationPrompt-enable']}>
							{t('common.gotIt')}
						</button>
					</div>
				</>
			);
		}

		return null;
	};

	// Render standard notification prompt
	const renderStandardContent = (): React.ReactNode => (
		<>
			<div className={styles['notificationPrompt-message']}>
				<h3>{t('notifications.stayUpdated')}</h3>
				<p>{t('notifications.enablePrompt')}</p>
			</div>
			<div className={styles['notificationPrompt-actions']}>
				<button onClick={handleDismissClick} className={styles['notificationPrompt-dismiss']}>
					{t('common.notNow')}
				</button>
				<button onClick={handleEnableClick} className={styles['notificationPrompt-enable']}>
					{t('notifications.enable')}
				</button>
			</div>
		</>
	);

	return (
		<div className={styles.notificationPrompt}>
			<div className={styles['notificationPrompt-content']}>
				<div className={styles['notificationPrompt-icon']}>
					<img src="/icons/logo-96px.png" alt="FreeDi App" />
				</div>
				{isIOSUnsupported || needsPWAInstall ? renderIOSContent() : renderStandardContent()}
			</div>
		</div>
	);
};

export default NotificationPrompt;
