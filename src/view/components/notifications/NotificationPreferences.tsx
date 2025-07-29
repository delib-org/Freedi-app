import React, { useEffect, useState } from 'react';
import './notificationPreferences.scss';
import { updateNotificationPreferences } from '@/controllers/db/subscriptions/setSubscriptions';
import { getStatementSubscriptionId } from '@/controllers/general/helpers';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { Collections, StatementSubscription } from 'delib-npm';
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
				const db = getFirestore();

				if (!auth.currentUser) {
					setIsLoading(false);
					return;
				}

				const subscriptionId = getStatementSubscriptionId(statementId, auth.currentUser.uid);
				if (!subscriptionId) {
					setIsLoading(false);
					return;
				}

				const docRef = doc(db, Collections.statementsSubscribe, subscriptionId);
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
		<div className="notification-preferences">
			<h3>Notification Settings</h3>
			<p className="description">Choose how you want to be notified about updates to this statement</p>
			
			<div className="preference-item">
				<div className="preference-info">
					<BellIcon className="icon" />
					<div>
						<h4>In-App Notifications</h4>
						<p>See notifications when you're using the app</p>
					</div>
				</div>
				<label className="switch">
					<input
						type="checkbox"
						checked={preferences.getInAppNotification}
						onChange={(e) => handlePreferenceChange('getInAppNotification', e.target.checked)}
						disabled={isSaving}
					/>
					<span className="slider"></span>
				</label>
			</div>

			<div className="preference-item">
				<div className="preference-info">
					<PhoneIcon className="icon" />
					<div>
						<h4>Push Notifications</h4>
						<p>Get notified on all your devices even when the app is closed</p>
						{!hasNotificationPermission && preferences.getPushNotification && (
							<p className="warning-text">
								⚠️ Browser notifications must be enabled first
							</p>
						)}
					</div>
				</div>
				<label className="switch">
					<input
						type="checkbox"
						checked={preferences.getPushNotification}
						onChange={(e) => handlePreferenceChange('getPushNotification', e.target.checked)}
						disabled={isSaving || (!hasNotificationPermission && !preferences.getPushNotification)}
						title={!hasNotificationPermission && !preferences.getPushNotification ? 
							"Please enable browser notifications first" : ""}
					/>
					<span className="slider"></span>
				</label>
			</div>

			<div className="preference-item">
				<div className="preference-info">
					<MailIcon className="icon" />
					<div>
						<h4>Email Notifications</h4>
						<p>Receive updates via email</p>
					</div>
				</div>
				<label className="switch">
					<input
						type="checkbox"
						checked={preferences.getEmailNotification}
						onChange={(e) => handlePreferenceChange('getEmailNotification', e.target.checked)}
						disabled={isSaving}
					/>
					<span className="slider"></span>
				</label>
			</div>

			{isSaving && <p className="saving-indicator">Saving...</p>}
		</div>
	);
};

export default NotificationPreferences;