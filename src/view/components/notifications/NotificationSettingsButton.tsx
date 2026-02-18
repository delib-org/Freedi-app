import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { getAuth } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Collections } from '@freedi/shared-types';
import { notificationService } from '@/services/notificationService';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import useClickOutside from '@/controllers/hooks/useClickOutside';
import { DB } from '@/controllers/db/config';
import { getStatementSubscriptionId } from '@/controllers/general/helpers';
import NotificationPreferences from './NotificationPreferences';
import BellIcon from '@/assets/icons/bellIcon.svg?react';
import BellSlashIcon from '@/assets/icons/bellSlashIcon.svg?react';
import styles from './NotificationSettingsButton.module.scss';

interface NotificationSettingsButtonProps {
	statementId: string;
	headerStyle?: { color: string; backgroundColor: string };
}

const NotificationSettingsButton: React.FC<NotificationSettingsButtonProps> = ({
	statementId,
	headerStyle,
}) => {
	const { t } = useTranslation();
	const [openSettings, setOpenSettings] = useState(false);
	const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>(
		'default',
	);
	const [isSupported, setIsSupported] = useState(false);
	const [isMobile, setIsMobile] = useState(false);
	const [allNotificationsOff, setAllNotificationsOff] = useState(false);
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

	// Check notification preferences
	useEffect(() => {
		const checkNotificationPreferences = async () => {
			try {
				const auth = getAuth();

				if (!auth.currentUser) return;

				const subscriptionId = getStatementSubscriptionId(statementId, auth.currentUser.uid);
				if (!subscriptionId) return;

				const docRef = doc(DB, Collections.statementsSubscribe, subscriptionId);
				const docSnap = await getDoc(docRef);

				if (docSnap.exists()) {
					const data = docSnap.data();
					const allOff =
						!data.getInAppNotification && !data.getEmailNotification && !data.getPushNotification;
					setAllNotificationsOff(allOff);
				}
			} catch (error) {
				console.error('Error checking notification preferences:', error);
			}
		};

		checkNotificationPreferences();

		// Re-check when settings modal opens/closes
		if (!openSettings) {
			checkNotificationPreferences();
		}
	}, [statementId, openSettings]);

	// Handle click outside for desktop (non-portal)
	const handleClickOutside = React.useCallback(() => {
		if (openSettings && !isMobile) setOpenSettings(false);
	}, [openSettings, isMobile]);

	const containerRef = useClickOutside(handleClickOutside);

	// Handle click outside for mobile (portal) manually
	useEffect(() => {
		if (!isMobile || !openSettings) return;

		const handleMobileClickOutside = (event: MouseEvent) => {
			// Check if click is on backdrop
			const target = event.target as HTMLElement;
			if (target.classList.contains(styles.backdrop)) {
				return; // Backdrop has its own click handler
			}

			// Check if click is inside dropdown
			if (dropdownRef.current && dropdownRef.current.contains(target)) {
				return; // Don't close if clicking inside dropdown
			}

			// Close if clicking outside
			setOpenSettings(false);
		};

		// Use mousedown to match the useClickOutside hook behavior
		document.addEventListener('mousedown', handleMobileClickOutside);

		return () => {
			document.removeEventListener('mousedown', handleMobileClickOutside);
		};
	}, [isMobile, openSettings]);

	const handleRequestPermission = async () => {
		try {
			const permission = await notificationService.requestPermission();
			setPermissionState(permission ? 'granted' : 'denied');

			// If permission was granted, initialize the service
			if (permission) {
				const auth = getAuth();
				const user = auth.currentUser;
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
				{allNotificationsOff ? (
					<BellSlashIcon style={{ color: headerStyle?.color }} />
				) : (
					<BellIcon style={{ color: headerStyle?.color }} />
				)}
			</button>

			{openSettings &&
				isMobile &&
				ReactDOM.createPortal(
					<>
						<div className={styles.backdrop} onClick={() => setOpenSettings(false)} />
						<div className={styles.dropdown} ref={dropdownRef} onClick={(e) => e.stopPropagation()}>
							{permissionState === 'default' ? (
								<div className={styles.permissionPrompt}>
									<h3>{t('Enable Notifications')}</h3>
									<p>
										{t(
											'To receive notifications about updates to this statement, you need to grant permission first.',
										)}
									</p>
									<button className={styles.grantButton} onClick={handleRequestPermission}>
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
					document.body,
				)}

			{openSettings && !isMobile && (
				<div className={styles.dropdown} onClick={(e) => e.stopPropagation()}>
					{permissionState === 'default' ? (
						<div className={styles.permissionPrompt}>
							<h3>{t('Enable Notifications')}</h3>
							<p>
								{t(
									'To receive notifications about updates to this statement, you need to grant permission first.',
								)}
							</p>
							<button className={styles.grantButton} onClick={handleRequestPermission}>
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
