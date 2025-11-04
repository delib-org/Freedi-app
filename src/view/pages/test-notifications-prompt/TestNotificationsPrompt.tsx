import React, { useState } from 'react';
import NotificationPermissionPrompt from '@/view/components/notifications/NotificationPermissionPrompt';
import { notificationService } from '@/services/notificationService';
import styles from './testNotificationsPrompt.module.scss';

/**
 * Demo page to preview notification permission prompts
 * Navigate to /test-notifications-prompt to see all variants
 */
const TestNotificationsPrompt: React.FC = () => {
	const [showMinimal, setShowMinimal] = useState(false);
	const [showCard, setShowCard] = useState(false);
	const [showGlass, setShowGlass] = useState(false);
	const [permissionStatus, setPermissionStatus] = useState<string>(
		typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
	);

	const handleAccept = async () => {
		console.info('[TestPage] User clicked Accept');

		if (typeof Notification === 'undefined') {
			alert('Notifications not supported in this browser');
			return;
		}

		try {
			const permission = await Notification.requestPermission();
			setPermissionStatus(permission);

			if (permission === 'granted') {
				console.info('[TestPage] Permission granted!');
				alert('✅ Notification permission granted!');

				// Initialize notification service
				const auth = await import('firebase/auth');
				const currentUser = auth.getAuth().currentUser;
				if (currentUser) {
					await notificationService.initialize(currentUser.uid);
				}
			} else {
				console.info('[TestPage] Permission denied');
				alert('❌ Notification permission denied');
			}
		} catch (error) {
			console.error('[TestPage] Error requesting permission:', error);
			alert('Error requesting permission: ' + error);
		}
	};

	const handleDismiss = () => {
		console.info('[TestPage] User clicked Dismiss');
		alert('User dismissed the prompt');
	};

	return (
		<div className={styles.testPage}>
			<div className={styles.container}>
				<h1>🔔 Notification Permission Prompt Demo</h1>

				<div className={styles.status}>
					<p>
						<strong>Current Permission Status:</strong>
						<span className={styles[permissionStatus]}>{permissionStatus}</span>
					</p>
					<p className={styles.note}>
						💡 Try each variant to see the different designs and animations
					</p>
				</div>

				<div className={styles.variants}>
					<div className={styles.variant}>
						<h2>⭐ Minimal Variant</h2>
						<p>Clean bottom snackbar with bounce animation</p>
						<p className={styles.recommended}>✨ Recommended for "after first comment"</p>
						<button
							onClick={() => setShowMinimal(true)}
							className={styles.showButton}
						>
							Show Minimal Variant
						</button>
					</div>

					<div className={styles.variant}>
						<h2>🎨 Card Variant</h2>
						<p>Visual engagement with gradient bell icon</p>
						<p className={styles.info}>Good for feature announcements</p>
						<button
							onClick={() => setShowCard(true)}
							className={styles.showButton}
						>
							Show Card Variant
						</button>
					</div>

					<div className={styles.variant}>
						<h2>✨ Glass Variant</h2>
						<p>Premium aesthetic with frosted glass</p>
						<p className={styles.info}>Best for special occasions</p>
						<button
							onClick={() => setShowGlass(true)}
							className={styles.showButton}
						>
							Show Glass Variant
						</button>
					</div>
				</div>

				<div className={styles.instructions}>
					<h3>📋 How to Test</h3>
					<ol>
						<li>Click a "Show X Variant" button above</li>
						<li>The prompt will appear with a smooth animation</li>
						<li>Click "Yes, Notify Me" to trigger browser permission request</li>
						<li>Click "Not Now" to dismiss the prompt</li>
						<li>Try all three variants to compare!</li>
					</ol>
				</div>

				<div className={styles.resetSection}>
					<h3>🔄 Reset Permission (for testing)</h3>
					<p>To test again, you'll need to reset notification permission in your browser:</p>
					<ul>
						<li><strong>Chrome/Edge:</strong> Settings → Privacy → Site Settings → Notifications</li>
						<li><strong>Firefox:</strong> Settings → Privacy → Permissions → Notifications</li>
						<li><strong>Safari:</strong> Preferences → Websites → Notifications</li>
					</ul>
					<button
						onClick={() => window.location.reload()}
						className={styles.reloadButton}
					>
						Reload Page
					</button>
				</div>
			</div>

			{/* The actual prompts */}
			<NotificationPermissionPrompt
				variant="minimal"
				isVisible={showMinimal}
				onAccept={() => {
					setShowMinimal(false);
					handleAccept();
				}}
				onDismiss={() => {
					setShowMinimal(false);
					handleDismiss();
				}}
			/>

			<NotificationPermissionPrompt
				variant="card"
				isVisible={showCard}
				onAccept={() => {
					setShowCard(false);
					handleAccept();
				}}
				onDismiss={() => {
					setShowCard(false);
					handleDismiss();
				}}
			/>

			<NotificationPermissionPrompt
				variant="glass"
				isVisible={showGlass}
				onAccept={() => {
					setShowGlass(false);
					handleAccept();
				}}
				onDismiss={() => {
					setShowGlass(false);
					handleDismiss();
				}}
			/>
		</div>
	);
};

export default TestNotificationsPrompt;
