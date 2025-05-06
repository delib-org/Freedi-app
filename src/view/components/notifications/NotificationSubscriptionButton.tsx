import React, { useEffect, useState } from 'react';
import './notificationSubscriptionButton.scss';
import { notificationService } from '@/services/notificationService';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, getFirestore, deleteDoc } from 'firebase/firestore';
import { Collections } from 'delib-npm';
import BellIcon from '@/assets/icons/bellIcon.svg?react';
import BellSlashIcon from '@/assets/icons/bellSlashIcon.svg?react';

interface NotificationSubscriptionButtonProps {
	statementId: string;
}

/**
 * Button that allows users to subscribe to or unsubscribe from push notifications for a statement
 */
const NotificationSubscriptionButton: React.FC<NotificationSubscriptionButtonProps> = ({ statementId }) => {
	const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [permissionState, setPermissionState] = useState<NotificationPermission>('default');

	useEffect(() => {
		// Check if notifications are supported first
		if (!notificationService.isSupported()) {
			setIsLoading(false);

			return;
		}

		// Set initial permission state safely
		setPermissionState(notificationService.safeGetPermission() as NotificationPermission);

		// Check if user is already subscribed
		const checkSubscription = async () => {
			try {
				setIsLoading(true);
				const auth = getAuth();
				const db = getFirestore();

				if (!auth.currentUser) {
					setIsLoading(false);

					return;
				}

				// Initialize notification service to get token
				const permissionState = notificationService.safeGetPermission();
				if (permissionState === 'granted') {
					await notificationService.initialize(auth.currentUser.uid);
					const token = notificationService.getToken();

					if (token) {
						// Check if subscription exists in the database
						const docRef = doc(db, Collections.askedToBeNotified, `${token}_${statementId}`);
						const docSnap = await getDoc(docRef);

						setIsSubscribed(docSnap.exists());
					}
				}

				setIsLoading(false);
			} catch (error) {
				console.error('Error checking notification subscription:', error);
				setIsLoading(false);
			}
		};

		checkSubscription();
	}, [statementId]);

	const handleSubscriptionToggle = async () => {
		try {
			setIsLoading(true);
			const auth = getAuth();
			const db = getFirestore();

			if (!auth.currentUser) {
				setIsLoading(false);

				return;
			}

			// If not granted, request permission
			const currentPermission = notificationService.safeGetPermission();
			if (currentPermission !== 'granted') {
				// Only try to request permission if the API is supported
				if (notificationService.isSupported()) {
					const permission = await Notification.requestPermission();
					setPermissionState(permission);

					if (permission !== 'granted') {
						setIsLoading(false);

						return;
					}
				} else {
					setIsLoading(false);

					return;
				}
			}

			// Initialize notification service
			await notificationService.initialize(auth.currentUser.uid);
			const token = notificationService.getToken();

			if (!token) {
				console.error('No FCM token available');
				setIsLoading(false);

				return;
			}

			if (isSubscribed) {
				// Unsubscribe
				const docRef = doc(db, Collections.askedToBeNotified, `${token}_${statementId}`);
				await deleteDoc(docRef);
				setIsSubscribed(false);
			} else {
				// Subscribe
				const success = await notificationService.registerForStatementNotifications(
					auth.currentUser.uid,
					token,
					statementId
				);
				setIsSubscribed(success);
			}

			setIsLoading(false);
		} catch (error) {
			console.error('Error toggling notification subscription:', error);
			setIsLoading(false);
		}
	};

	// If notifications aren't supported, don't show the button
	if (!notificationService.isSupported()) {
		return null;
	}

	return (
		<button
			className={`notification-subscription-button ${isSubscribed ? 'subscribed' : 'unsubscribed'}`}
			onClick={handleSubscriptionToggle}
			disabled={isLoading || permissionState === 'denied'}
			title={
				permissionState === 'denied'
					? 'Notification permission denied. Please update your browser settings.'
					: isSubscribed
						? 'Unsubscribe from notifications'
						: 'Subscribe to notifications'
			}
		>
			{isLoading ? (
				<span className="loading-indicator"></span>
			) : (
				<>
					{isSubscribed ? <BellIcon /> : <BellSlashIcon />}
				</>
			)}
		</button>
	);
};

export default NotificationSubscriptionButton;