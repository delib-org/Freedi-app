import React, { useEffect, useState } from 'react';
import './fcmTokenDisplay.scss';
import { getAuth } from 'firebase/auth';
import { notificationService } from '@/services/notificationService';

/**
 * Component to display FCM token for testing purposes
 * This should only be used during development and testing
 */
const FCMTokenDisplay: React.FC = () => {
	const [token, setToken] = useState<string | null>(null);
	const [expanded, setExpanded] = useState(false);
	const [userInfo, setUserInfo] = useState<{ uid: string, email: string } | null>(null);

	// Get the FCM token on component mount
	useEffect(() => {
		const getAndDisplayToken = async () => {
			try {
				// Get auth info
				const auth = getAuth();
				if (auth.currentUser) {
					setUserInfo({
						uid: auth.currentUser.uid,
						email: auth.currentUser.email || 'No email'
					});

					// Initialize notification service if permission is granted
					if (Notification.permission === 'granted') {
						await notificationService.initialize(auth.currentUser.uid);
						const fcmToken = notificationService.getToken();
						setToken(fcmToken);
					}
				}
			} catch (error) {
				console.error('Error getting FCM token:', error);
			}
		};

		getAndDisplayToken();
	}, []);

	// Request permission and get token
	const handleRequestPermission = async () => {
		try {
			const permission = await Notification.requestPermission();
			if (permission === 'granted') {
				const auth = getAuth();
				if (auth.currentUser) {
					await notificationService.initialize(auth.currentUser.uid);
					const fcmToken = notificationService.getToken();
					setToken(fcmToken);
				}
			}
		} catch (error) {
			console.error('Error requesting notification permission:', error);
		}
	};

	// Handle copying token to clipboard
	const handleCopyToken = () => {
		if (token) {
			navigator.clipboard.writeText(token)
				.then(() => {
					alert('Token copied to clipboard!');
				})
				.catch(err => {
					console.error('Error copying token:', err);
				});
		}
	};

	// Test sending a notification
	const handleTestNotification = () => {
		if (Notification.permission === 'granted') {
			navigator.serviceWorker.ready.then(registration => {
				registration.showNotification('Test Notification', {
					body: 'This is a test notification from FCMTokenDisplay',
					icon: '/icons/logo-192px.png',
					badge: '/icons/logo-48px.png',
					//@ts-ignore
					vibrate: [100, 50, 100],
					requireInteraction: true
				});
			});
		} else {
			alert('Notification permission not granted');
		}
	};

	if (!expanded) {
		return (
			<div className="fcm-token-display-toggle" onClick={() => setExpanded(true)}>
				Show FCM Token
			</div>
		);
	}

	return (
		<div className="fcm-token-display">
			<div className="fcm-token-display-header">
				<h3>FCM Token for Testing</h3>
				<button onClick={() => setExpanded(false)} className="close-button">×</button>
			</div>

			<div className="fcm-token-display-content">
				<div className="fcm-token-status">
					<span>Permission: </span>
					<span className={`status-badge ${Notification.permission}`}>
						{Notification.permission}
					</span>
				</div>

				{userInfo && (
					<div className="fcm-token-user">
						<p><strong>User ID:</strong> {userInfo.uid}</p>
						<p><strong>Email:</strong> {userInfo.email}</p>
					</div>
				)}

				{Notification.permission !== 'granted' ? (
					<button
						onClick={handleRequestPermission}
						className="request-permission-button"
					>
						Request Notification Permission
					</button>
				) : (
					<>
						<div className="fcm-token-value">
							<textarea
								readOnly
								value={token || 'No token available'}
								rows={4}
							/>
						</div>

						<div className="fcm-token-actions">
							<button
								onClick={handleCopyToken}
								disabled={!token}
								className="copy-button"
							>
								Copy Token
							</button>

							<button
								onClick={handleTestNotification}
								className="test-button"
							>
								Test Notification
							</button>
						</div>
					</>
				)}
			</div>
		</div>
	);
};

export default FCMTokenDisplay;