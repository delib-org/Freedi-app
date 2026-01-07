import React, { useEffect, useState } from 'react';
import styles from './notificationPreferences.module.scss';
import { updateNotificationPreferences } from '@/controllers/db/subscriptions/setSubscriptions';
import { getStatementSubscriptionId } from '@/controllers/general/helpers';
import { getAuth } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { DB } from '@/controllers/db/config';
import { Collections, StatementSubscription } from '@freedi/shared-types';
import { notificationService } from '@/services/notificationService';
import BellIcon from '@/assets/icons/bellIcon.svg?react';
import MailIcon from '@/assets/icons/bellIcon.svg?react';
import PhoneIcon from '@/assets/icons/bellIcon.svg?react';

interface NotificationPreferencesProps {
	statementId: string;
}

interface PreferencesState {
	getInAppNotification: boolean;
	getEmailNotification: boolean;
	getPushNotification: boolean;
}

/**
 * Component that allows users to manage their notification preferences for a statement
 */
const NotificationPreferences: React.FC<NotificationPreferencesProps> = ({ statementId }) => {
	const [preferences, setPreferences] = useState<PreferencesState>({
		getInAppNotification: true,
		getEmailNotification: false,
		getPushNotification: false
	});
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [isSaving, setIsSaving] = useState<boolean>(false);
	const [hasNotificationPermission, setHasNotificationPermission] = useState<boolean>(false);

	useEffect(() => {
		// Check notification permission
		const permission = notificationService.safeGetPermission();
		setHasNotificationPermission(permission === 'granted');
		
		// Load current preferences
		const loadPreferences = async () => {
			try {
				setIsLoading(true);
				const auth = getAuth();

				if (!auth.currentUser) {
					setIsLoading(false);

return;
				}

				const subscriptionId = getStatementSubscriptionId(statementId, auth.currentUser.uid);
				if (!subscriptionId) {
					setIsLoading(false);

return;
				}

				const docRef = doc(DB, Collections.statementsSubscribe, subscriptionId);
				const docSnap = await getDoc(docRef);

				if (docSnap.exists()) {
					const data = docSnap.data() as StatementSubscription;
					setPreferences({
						getInAppNotification: data.getInAppNotification ?? true,
						getEmailNotification: data.getEmailNotification ?? false,
						getPushNotification: data.getPushNotification ?? false
					});
				}

				setIsLoading(false);
			} catch (error) {
				console.error('Error loading notification preferences:', error);
				setIsLoading(false);
			}
		};

		loadPreferences();
	}, [statementId]);

	const handlePreferenceChange = async (key: keyof PreferencesState, value: boolean) => {
		try {
			setIsSaving(true);
			const auth = getAuth();

			if (!auth.currentUser) {
				setIsSaving(false);

return;
			}

			// Update local state
			const newPreferences = { ...preferences, [key]: value };
			setPreferences(newPreferences);

			// Update in database
			await updateNotificationPreferences(statementId, auth.currentUser.uid, {
				[key]: value
			});

			// If enabling push notifications, add the FCM token to the subscription
			if (key === 'getPushNotification' && value === true) {
				const token = notificationService.getToken();
				if (token) {
					await notificationService.registerForStatementNotifications(
						auth.currentUser.uid,
						token,
						statementId
					);
					console.info('[NotificationPreferences] Added FCM token to subscription');
				} else {
					console.info('[NotificationPreferences] No FCM token available, will sync on next initialization');
				}
			}

			setIsSaving(false);
		} catch (error) {
			console.error('Error updating notification preference:', error);
			// Revert on error
			setPreferences(preferences);
			setIsSaving(false);
		}
	};

	if (isLoading) {
		return (
			<div className="notification-preferences loading">
				<span>Loading preferences...</span>
			</div>
		);
	}

	return (
		<div className={styles.notificationPreferences}>
			<h3>Notification Settings</h3>
			<p className={styles.description}>Choose how you want to be notified about updates to this statement</p>
			
			<div className={styles.preferenceItem}>
				<div className={styles.preferenceInfo}>
					<BellIcon className={styles.icon} />
					<div>
						<h4>In-App Notifications</h4>
						<p>See notifications when you're using the app</p>
					</div>
				</div>
				<label className={styles.switch}>
					<input
						type="checkbox"
						checked={preferences.getInAppNotification}
						onChange={(e) => handlePreferenceChange('getInAppNotification', e.target.checked)}
						disabled={isSaving}
					/>
					<span className={styles.slider}></span>
				</label>
			</div>

			<div className={styles.preferenceItem}>
				<div className={styles.preferenceInfo}>
					<PhoneIcon className={styles.icon} />
					<div>
						<h4>Push Notifications</h4>
						<p>Get notified on all your devices even when the app is closed</p>
						{!hasNotificationPermission && preferences.getPushNotification && (
							<p className={styles.warningText}>
								⚠️ Browser notifications must be enabled first
							</p>
						)}
					</div>
				</div>
				<label className={styles.switch}>
					<input
						type="checkbox"
						checked={preferences.getPushNotification}
						onChange={(e) => handlePreferenceChange('getPushNotification', e.target.checked)}
						disabled={isSaving || (!hasNotificationPermission && !preferences.getPushNotification)}
						title={!hasNotificationPermission && !preferences.getPushNotification ? 
							"Please enable browser notifications first" : ""}
					/>
					<span className={styles.slider}></span>
				</label>
			</div>

			<div className={styles.preferenceItem}>
				<div className={styles.preferenceInfo}>
					<MailIcon className={styles.icon} />
					<div>
						<h4>Email Notifications</h4>
						<p>Receive updates via email</p>
					</div>
				</div>
				<label className={styles.switch}>
					<input
						type="checkbox"
						checked={preferences.getEmailNotification}
						onChange={(e) => handlePreferenceChange('getEmailNotification', e.target.checked)}
						disabled={isSaving}
					/>
					<span className={styles.slider}></span>
				</label>
			</div>

			{isSaving && <p className={styles.savingIndicator}>Saving...</p>}
		</div>
	);
};

export default NotificationPreferences;