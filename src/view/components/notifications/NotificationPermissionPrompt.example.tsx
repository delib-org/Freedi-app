/**
 * NotificationPermissionPrompt - Example Usage
 *
 * This file demonstrates how to use the NotificationPermissionPrompt component
 * with all three variants in your application.
 */

import React, { useState } from 'react';
import NotificationPermissionPrompt from './NotificationPermissionPrompt';
import type { PromptVariant } from './NotificationPermissionPrompt';

// ============================================================================
// EXAMPLE 1: Basic Usage (Minimal Variant)
// ============================================================================

export function ExampleBasic() {
	const [showPrompt, setShowPrompt] = useState(false);

	const handleAccept = async () => {
		console.info('User accepted notifications');
		// Request notification permission here
		const permission = await Notification.requestPermission();
		console.info('Permission result:', permission);
		setShowPrompt(false);
	};

	const handleDismiss = () => {
		console.info('User dismissed notification prompt');
		setShowPrompt(false);
	};

	return (
		<div>
			<button onClick={() => setShowPrompt(true)}>
				Show Notification Prompt
			</button>

			<NotificationPermissionPrompt
				variant="minimal"
				isVisible={showPrompt}
				onAccept={handleAccept}
				onDismiss={handleDismiss}
			/>
		</div>
	);
}

// ============================================================================
// EXAMPLE 2: After First Comment (Real Use Case)
// ============================================================================

export function ExampleAfterFirstComment() {
	const [showPrompt, setShowPrompt] = useState(false);
	const [hasPostedComment, setHasPostedComment] = useState(false);

	const handlePostComment = async (commentText: string) => {
		// Post comment logic here
		console.info('Posting comment:', commentText);

		// Check if this is user's first comment
		const isFirstComment = !hasPostedComment;

		if (isFirstComment) {
			// Show notification prompt after short delay
			setTimeout(() => {
				setShowPrompt(true);
			}, 1000);
		}

		setHasPostedComment(true);
	};

	const handleAccept = async () => {
		const permission = await Notification.requestPermission();

		if (permission === 'granted') {
			console.info('Notifications enabled!');
			// Subscribe to push notifications
			// subscribeToNotifications();
		}

		setShowPrompt(false);
	};

	const handleDismiss = () => {
		console.info('User chose "Not Now"');
		// Maybe show again later or respect this choice
		localStorage.setItem('notificationPromptDismissed', Date.now().toString());
		setShowPrompt(false);
	};

	return (
		<div>
			<button onClick={() => handlePostComment('My first comment!')}>
				Post Comment
			</button>

			<NotificationPermissionPrompt
				variant="card"
				isVisible={showPrompt}
				onAccept={handleAccept}
				onDismiss={handleDismiss}
				message="Get notified when people respond to your comment?"
			/>
		</div>
	);
}

// ============================================================================
// EXAMPLE 3: All Variants Comparison
// ============================================================================

export function ExampleAllVariants() {
	const [activeVariant, setActiveVariant] = useState<PromptVariant | null>(null);

	const handleAccept = () => {
		console.info('Accepted!');
		setActiveVariant(null);
	};

	const handleDismiss = () => {
		console.info('Dismissed!');
		setActiveVariant(null);
	};

	return (
		<div style={{ padding: '2rem' }}>
			<h2>Notification Prompt Variants</h2>
			<div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
				<button onClick={() => setActiveVariant('minimal')}>
					Show Minimal Variant
				</button>
				<button onClick={() => setActiveVariant('card')}>
					Show Card Variant
				</button>
				<button onClick={() => setActiveVariant('glass')}>
					Show Glass Variant
				</button>
			</div>

			{activeVariant && (
				<NotificationPermissionPrompt
					variant={activeVariant}
					isVisible={true}
					onAccept={handleAccept}
					onDismiss={handleDismiss}
				/>
			)}
		</div>
	);
}

// ============================================================================
// EXAMPLE 4: With Custom Message
// ============================================================================

export function ExampleCustomMessage() {
	const [showPrompt, setShowPrompt] = useState(false);

	return (
		<div>
			<button onClick={() => setShowPrompt(true)}>
				Show Custom Message
			</button>

			<NotificationPermissionPrompt
				variant="glass"
				isVisible={showPrompt}
				onAccept={() => setShowPrompt(false)}
				onDismiss={() => setShowPrompt(false)}
				message="Stay in the loop! Get updates when your group makes decisions."
			/>
		</div>
	);
}

// ============================================================================
// EXAMPLE 5: With Auto-Hide
// ============================================================================

export function ExampleAutoHide() {
	const [showPrompt, setShowPrompt] = useState(false);

	return (
		<div>
			<button onClick={() => setShowPrompt(true)}>
				Show with Auto-Hide (10s)
			</button>

			<NotificationPermissionPrompt
				variant="minimal"
				isVisible={showPrompt}
				onAccept={() => {
					console.info('Accepted');
					setShowPrompt(false);
				}}
				onDismiss={() => {
					console.info('Dismissed or auto-hidden');
					setShowPrompt(false);
				}}
				autoHideDelay={10000} // Auto-hide after 10 seconds
			/>
		</div>
	);
}

// ============================================================================
// EXAMPLE 6: Integration with useNotifications Hook
// ============================================================================

export function ExampleWithHook() {
	const [showPrompt, setShowPrompt] = useState(false);
	// Assuming you have a useNotifications hook
	// const { requestPermission, permissionState } = useNotifications();

	const handleAccept = async () => {
		try {
			// const result = await requestPermission();
			const result = await Notification.requestPermission();

			if (result === 'granted') {
				console.info('Permission granted!');
				// Show success message
			} else if (result === 'denied') {
				console.info('Permission denied');
				// Show info about enabling in browser settings
			}
		} catch (error) {
			console.error('Error requesting permission:', error);
		} finally {
			setShowPrompt(false);
		}
	};

	const handleDismiss = () => {
		// Track that user dismissed
		console.info('User dismissed notification prompt');
		setShowPrompt(false);
	};

	return (
		<div>
			<button onClick={() => setShowPrompt(true)}>
				Request Notification Permission
			</button>

			<NotificationPermissionPrompt
				variant="card"
				isVisible={showPrompt}
				onAccept={handleAccept}
				onDismiss={handleDismiss}
			/>
		</div>
	);
}

// ============================================================================
// DEFAULT EXPORT (For Testing)
// ============================================================================

export default function NotificationPromptExamples() {
	return (
		<div style={{ padding: '2rem' }}>
			<h1>Notification Permission Prompt Examples</h1>

			<section style={{ marginBottom: '3rem' }}>
				<h2>All Variants</h2>
				<ExampleAllVariants />
			</section>

			<section style={{ marginBottom: '3rem' }}>
				<h2>Basic Usage</h2>
				<ExampleBasic />
			</section>

			<section style={{ marginBottom: '3rem' }}>
				<h2>After First Comment</h2>
				<ExampleAfterFirstComment />
			</section>

			<section style={{ marginBottom: '3rem' }}>
				<h2>Custom Message</h2>
				<ExampleCustomMessage />
			</section>

			<section style={{ marginBottom: '3rem' }}>
				<h2>Auto-Hide</h2>
				<ExampleAutoHide />
			</section>

			<section style={{ marginBottom: '3rem' }}>
				<h2>With Hook Integration</h2>
				<ExampleWithHook />
			</section>
		</div>
	);
}
