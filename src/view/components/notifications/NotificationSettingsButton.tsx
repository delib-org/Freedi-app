import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { notificationService } from '@/services/notificationService';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import useClickOutside from '@/controllers/hooks/useClickOutside';
import NotificationPreferences from './NotificationPreferences';
import BellIcon from '@/assets/icons/bellIcon.svg?react';
import styles from './NotificationSettingsButton.module.scss';

interface NotificationSettingsButtonProps {
	statementId: string;
	headerStyle?: { color: string; backgroundColor: string };
}

const NotificationSettingsButton: React.FC<NotificationSettingsButtonProps> = ({ 
	statementId, 
	headerStyle 
}) => {
	const { t } = useUserConfig();
	const [openSettings, setOpenSettings] = useState(false);
	const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>('default');
	const [isSupported, setIsSupported] = useState(false);
	const [isMobile, setIsMobile] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		// Check if notifications are supported
		const supported = notificationService.isSupported();
		setIsSupported(supported);
		
		if (supported) {
			// Get current permission state
			const permission = notificationService.safeGetPermission();
			setPermissionState(permission);
		}
		
		// Check if mobile
		const checkMobile = () => {
			setIsMobile(window.innerWidth <= 768);
		};
		
		checkMobile();
		window.addEventListener('resize', checkMobile);
		
		return () => window.removeEventListener('resize', checkMobile);
	}, []);

	const handleClickOutside = React.useCallback(() => {
		if (openSettings) setOpenSettings(false);
	}, [openSettings]);

	const containerRef = useClickOutside(handleClickOutside);

	const handleRequestPermission = async () => {
		try {
			const permission = await notificationService.requestPermission();
			setPermissionState(permission ? 'granted' : 'denied');
			
			// If permission was granted, initialize the service
			if (permission) {
				const user = await import('firebase/auth').then(m => m.getAuth().currentUser);
				if (user) {
					await notificationService.initialize(user.uid);
				}
			}
		} catch (error) {
			console.error('Error requesting notification permission:', error);
		}
	};

	// Don't render if browser doesn't support notifications
	if (!isSupported) {
		return null;
	}

	return (
		<div className={styles.container} ref={containerRef}>
			<button 
				className={styles.notificationButton}
				onClick={() => setOpenSettings(!openSettings)}
				title={t('Notification Settings')}
			>
				<BellIcon style={{ color: headerStyle?.color }} />
			</button>
			
			{openSettings && isMobile && ReactDOM.createPortal(
				<>
					<div 
						className={styles.backdrop} 
						onClick={() => setOpenSettings(false)}
					/>
					<div className={styles.dropdown} ref={dropdownRef}>
						{permissionState === 'default' ? (
							<div className={styles.permissionPrompt}>
								<h3>{t('Enable Notifications')}</h3>
								<p>{t('To receive notifications about updates to this statement, you need to grant permission first.')}</p>
								<button 
									className={styles.grantButton}
									onClick={handleRequestPermission}
								>
									{t('Grant Permission')}
								</button>
							</div>
						) : permissionState === 'denied' ? (
							<div className={styles.permissionDenied}>
								<h3>{t('Notifications Blocked')}</h3>
								<p>{t('You have blocked notifications. To enable them:')}</p>
								<ol>
									<li>{t('Click the lock icon in your browser address bar')}</li>
									<li>{t('Find "Notifications" and change to "Allow"')}</li>
									<li>{t('Reload the page')}</li>
								</ol>
							</div>
						) : (
							<NotificationPreferences statementId={statementId} />
						)}
					</div>
				</>,
				document.body
			)}
			
			{openSettings && !isMobile && (
				<div className={styles.dropdown} ref={dropdownRef}>
					{permissionState === 'default' ? (
						<div className={styles.permissionPrompt}>
							<h3>{t('Enable Notifications')}</h3>
							<p>{t('To receive notifications about updates to this statement, you need to grant permission first.')}</p>
							<button 
								className={styles.grantButton}
								onClick={handleRequestPermission}
							>
								{t('Grant Permission')}
							</button>
						</div>
					) : permissionState === 'denied' ? (
						<div className={styles.permissionDenied}>
							<h3>{t('Notifications Blocked')}</h3>
							<p>{t('You have blocked notifications. To enable them:')}</p>
							<ol>
								<li>{t('Click the lock icon in your browser address bar')}</li>
								<li>{t('Find "Notifications" and change to "Allow"')}</li>
								<li>{t('Reload the page')}</li>
							</ol>
						</div>
					) : (
						<NotificationPreferences statementId={statementId} />
					)}
				</div>
			)}
		</div>
	);
};

export default NotificationSettingsButton;