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
	onClose?: () => void;
}

/**
 * A component that prompts the user to enable notifications.
 * Shows iOS-specific guidance for users who need to install the PWA first.
 */
const NotificationPrompt: React.FC<NotificationPromptProps> = ({ onClose }) => {
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

	// Check if we should show the notification prompt
	useEffect(() => {
		// Only show the prompt if permission is not granted and not denied
		if (permissionState.permission === 'default' && !permissionState.loading) {
			// Don't show the prompt immediately, wait a bit for better user experience
			const timer = setTimeout(() => {
				setVisible(true);

				// Track iOS-specific prompts
				if (isIOSUnsupported) {
					trackIOSUnsupportedPromptShown();
				} else if (needsPWAInstall) {
					trackIOSInstallPromptShown();
				}
			}, 3000);

			return () => clearTimeout(timer);
		} else {
			setVisible(false);
		}
	}, [permissionState.permission, permissionState.loading, isIOSUnsupported, needsPWAInstall]);

	// Handle permission request
	const handleEnableClick = async (): Promise<void> => {
		const result = await requestPermission();
		trackPermissionRequest(result);
		setVisible(false);
		onClose?.();
	};

	// Handle dismissal
	const handleDismissClick = (): void => {
		setVisible(false);
		onClose?.();
	};

	if (!visible) return null;

	// Render iOS-specific messages
	const renderIOSContent = (): React.ReactNode => {
		if (isIOSUnsupported) {
			return (
				<>
					<div className="notification-prompt-message">
						<h3>{t('notifications.iosUnsupportedTitle')}</h3>
						<p>{t('notifications.iosUnsupportedMessage')}</p>
					</div>
					<div className="notification-prompt-actions">
						<button onClick={handleDismissClick} className={styles.notificationPromptEnable}>
							{t('common.ok')}
						</button>
					</div>
				</>
			);
		}

		if (needsPWAInstall) {
			return (
				<>
					<div className="notification-prompt-message">
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
					<div className="notification-prompt-actions">
						<button onClick={handleDismissClick} className={styles.notificationPromptEnable}>
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
			<div className="notification-prompt-message">
				<h3>{t('notifications.stayUpdated')}</h3>
				<p>{t('notifications.enablePrompt')}</p>
			</div>
			<div className="notification-prompt-actions">
				<button onClick={handleDismissClick} className={styles.notificationPromptDismiss}>
					{t('common.notNow')}
				</button>
				<button onClick={handleEnableClick} className={styles.notificationPromptEnable}>
					{t('notifications.enable')}
				</button>
			</div>
		</>
	);

	return (
		<div className={styles.notificationPrompt}>
			<div className="notification-prompt-content">
				<div className="notification-prompt-icon">
					<img src="/icons/logo-96px.png" alt="FreeDi App" />
				</div>
				{isIOSUnsupported || needsPWAInstall ? renderIOSContent() : renderStandardContent()}
			</div>
		</div>
	);
};

export default NotificationPrompt;
