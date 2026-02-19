import React, { useState, useEffect } from 'react';
import { notificationService } from '@/services/notificationService';
import { auth } from '@/controllers/db/config';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import { CheckCircle2, XCircle, AlertCircle, RefreshCw, Bell, Info } from 'lucide-react';
import styles from './NotificationDiagnostics.module.scss';
import { logError } from '@/utils/errorHandling';

interface DiagnosticInfo {
	supported: boolean;
	permission: NotificationPermission | 'unsupported';
	hasToken: boolean;
	tokenAge: number | null;
	serviceWorkerReady: boolean;
	userId: string | null;
}

export const NotificationDiagnostics: React.FC = () => {
	const [diagnostics, setDiagnostics] = useState<DiagnosticInfo | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [testSending, setTestSending] = useState(false);
	const [refreshing, setRefreshing] = useState(false);

	const loadDiagnostics = async () => {
		setIsLoading(true);
		try {
			const info = await notificationService.getDiagnostics();
			setDiagnostics(info);
		} catch (error) {
			logError(error, { operation: 'notifications.NotificationDiagnostics.loadDiagnostics', metadata: { message: 'Error loading diagnostics:' } });
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		loadDiagnostics();
	}, []);

	const handleTestNotification = async () => {
		setTestSending(true);
		try {
			// This would need to be implemented in your backend
			const response = await fetch('/api/test-notification', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${await auth.currentUser?.getIdToken()}`,
				},
				body: JSON.stringify({
					token: notificationService.getToken(),
				}),
			});

			if (response.ok) {
				alert('Test notification sent! You should receive it shortly.');
			} else {
				alert('Failed to send test notification. Check console for details.');
			}
		} catch (error) {
			logError(error, { operation: 'notifications.NotificationDiagnostics.handleTestNotification', metadata: { message: 'Error sending test notification:' } });
			alert('Error sending test notification. Check console for details.');
		} finally {
			setTestSending(false);
		}
	};

	const handleRefreshToken = async () => {
		if (!auth.currentUser) {
			alert('Please sign in first');

			return;
		}

		setRefreshing(true);
		try {
			const newToken = await notificationService.getOrRefreshToken(auth.currentUser.uid, true);
			if (newToken) {
				alert('Token refreshed successfully!');
				await loadDiagnostics();
			} else {
				alert('Failed to refresh token. Check console for details.');
			}
		} catch (error) {
			logError(error, { operation: 'notifications.NotificationDiagnostics.handleRefreshToken', metadata: { message: 'Error refreshing token:' } });
			alert('Error refreshing token. Check console for details.');
		} finally {
			setRefreshing(false);
		}
	};

	const handleRequestPermission = async () => {
		const granted = await notificationService.requestPermission();
		if (granted) {
			alert('Permission granted! Initializing notifications...');
			if (auth.currentUser) {
				await notificationService.initialize(auth.currentUser.uid);
				await loadDiagnostics();
			}
		} else {
			alert('Permission denied. Please check your browser settings.');
		}
	};

	const formatTokenAge = (ageMs: number | null): string => {
		if (!ageMs) return 'Unknown';

		const days = Math.floor(ageMs / (1000 * 60 * 60 * 24));
		const hours = Math.floor((ageMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

		if (days > 0) {
			return `${days} day${days > 1 ? 's' : ''}, ${hours} hour${hours > 1 ? 's' : ''} ago`;
		}

		return `${hours} hour${hours > 1 ? 's' : ''} ago`;
	};

	const getStatusIcon = (status: boolean | 'warning') => {
		if (status === 'warning') {
			return <AlertCircle className="w-5 h-5 text-yellow-500" />;
		}

		return status ? (
			<CheckCircle2 className="w-5 h-5 text-green-500" />
		) : (
			<XCircle className="w-5 h-5 text-red-500" />
		);
	};

	if (isLoading) {
		return (
			<div className={styles.card}>
				<div className={styles.cardContent}>
					<div className={styles.loading}>
						<RefreshCw className="w-6 h-6 animate-spin" />
						<span>Loading diagnostics...</span>
					</div>
				</div>
			</div>
		);
	}

	if (!diagnostics) {
		return (
			<div className={styles.card}>
				<div className={styles.cardContent}>
					<div className={styles.error}>Failed to load diagnostics</div>
				</div>
			</div>
		);
	}

	const tokenAgeWarning = diagnostics.tokenAge && diagnostics.tokenAge > 25 * 24 * 60 * 60 * 1000; // 25 days

	return (
		<div className={styles.card}>
			<div className={styles.cardHeader}>
				<h3 className={styles.cardTitle}>
					<Bell className="w-5 h-5" />
					Notification Diagnostics
				</h3>
				<p className={styles.cardDescription}>
					Check your notification setup and troubleshoot issues
				</p>
			</div>
			<div className={styles.cardContent}>
				{/* Browser Support */}
				<div className={styles.diagnosticItem}>
					<div className={styles.diagnosticLabel}>
						{getStatusIcon(diagnostics.supported)}
						<span className="font-medium">Browser Support</span>
					</div>
					<span className={styles.diagnosticValue}>
						{diagnostics.supported ? 'Supported' : 'Not Supported'}
					</span>
				</div>

				{/* Permission Status */}
				<div className={styles.diagnosticItem}>
					<div className={styles.diagnosticLabel}>
						{getStatusIcon(diagnostics.permission === 'granted')}
						<span className="font-medium">Permission</span>
					</div>
					<div className={styles.diagnosticActions}>
						<span className={styles.diagnosticValue}>{diagnostics.permission}</span>
						{diagnostics.permission === 'default' && (
							<Button
								text="Request Permission"
								onClick={handleRequestPermission}
								buttonType={ButtonType.SECONDARY}
								className={styles.smallButton}
							/>
						)}
					</div>
				</div>

				{/* Service Worker */}
				<div className={styles.diagnosticItem}>
					<div className={styles.diagnosticLabel}>
						{getStatusIcon(diagnostics.serviceWorkerReady)}
						<span className="font-medium">Service Worker</span>
					</div>
					<span className={styles.diagnosticValue}>
						{diagnostics.serviceWorkerReady ? 'Ready' : 'Not Ready'}
					</span>
				</div>

				{/* FCM Token */}
				<div className={styles.diagnosticItem}>
					<div className={styles.diagnosticLabel}>
						{getStatusIcon(diagnostics.hasToken)}
						<span className="font-medium">FCM Token</span>
					</div>
					<div className={styles.diagnosticActions}>
						<span className={styles.diagnosticValue}>
							{diagnostics.hasToken ? 'Active' : 'Not Available'}
						</span>
						{diagnostics.hasToken && (
							<Button
								text={refreshing ? 'Refreshing...' : 'Refresh'}
								onClick={handleRefreshToken}
								buttonType={ButtonType.SECONDARY}
								disabled={refreshing}
								className={styles.smallButton}
								icon={refreshing ? <RefreshCw className="w-4 h-4 animate-spin" /> : undefined}
							/>
						)}
					</div>
				</div>

				{/* Token Age */}
				{diagnostics.hasToken && diagnostics.tokenAge && (
					<div className={styles.diagnosticItem}>
						<div className={styles.diagnosticLabel}>
							{getStatusIcon(tokenAgeWarning ? 'warning' : true)}
							<span className="font-medium">Token Age</span>
						</div>
						<span className={styles.diagnosticValue}>{formatTokenAge(diagnostics.tokenAge)}</span>
					</div>
				)}

				{/* User ID */}
				<div className={styles.diagnosticItem}>
					<div className={styles.diagnosticLabel}>
						{getStatusIcon(!!diagnostics.userId)}
						<span className="font-medium">User ID</span>
					</div>
					<span className={`${styles.diagnosticValue} font-mono`}>
						{diagnostics.userId ? `...${diagnostics.userId.slice(-8)}` : 'Not Set'}
					</span>
				</div>

				{/* Actions */}
				<div className={styles.actions}>
					<Button
						text={testSending ? 'Sending Test...' : 'Send Test Notification'}
						onClick={handleTestNotification}
						disabled={!diagnostics.hasToken || testSending}
						buttonType={ButtonType.PRIMARY}
						className={styles.fullButton}
						icon={
							testSending ? (
								<RefreshCw className="w-4 h-4 animate-spin" />
							) : (
								<Bell className="w-4 h-4" />
							)
						}
					/>

					<Button
						text="Refresh Diagnostics"
						onClick={loadDiagnostics}
						buttonType={ButtonType.SECONDARY}
						className={styles.fullButton}
						icon={<RefreshCw className="w-4 h-4" />}
					/>
				</div>

				{/* Safari Warning */}
				{/Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent) && (
					<div className={styles.warningSection}>
						<div className={styles.warningContent}>
							<AlertCircle className="w-5 h-5" />
							<div>
								<p className={styles.warningTitle}>Safari Browser Detected</p>
								<p className={styles.warningText}>
									Push notifications are not fully supported in Safari. For the best experience,
									please use Chrome, Firefox, or Edge browsers.
								</p>
							</div>
						</div>
					</div>
				)}

				{/* Help Text */}
				<div className={styles.helpSection}>
					<div className={styles.helpContent}>
						<Info className="w-5 h-5" />
						<div>
							<p className={styles.helpTitle}>Troubleshooting Tips:</p>
							<ul className={styles.helpList}>
								{!diagnostics.supported && (
									<li>Your browser doesn't support notifications. Try Chrome, Firefox, or Edge.</li>
								)}
								{diagnostics.permission === 'denied' && (
									<li>
										Notifications are blocked. Check your browser settings to allow notifications
										for this site.
									</li>
								)}
								{!diagnostics.serviceWorkerReady && (
									<li>Service worker not ready. Try refreshing the page.</li>
								)}
								{!diagnostics.hasToken && diagnostics.permission === 'granted' && (
									<li>No FCM token. Try signing out and signing back in.</li>
								)}
								{tokenAgeWarning && <li>Your token is old. Click "Refresh" to update it.</li>}
							</ul>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};
