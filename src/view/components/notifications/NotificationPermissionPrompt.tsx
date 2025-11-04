import React, { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import styles from './NotificationPermissionPrompt.module.scss';

export type PromptVariant = 'minimal' | 'card' | 'glass';

interface NotificationPermissionPromptProps {
	/** Which visual variant to display */
	variant?: PromptVariant;
	/** Callback when user clicks "Yes, Notify Me" */
	onAccept: () => void;
	/** Callback when user clicks "Not Now" */
	onDismiss: () => void;
	/** Whether to show the prompt */
	isVisible: boolean;
	/** Custom message (optional) */
	message?: string;
	/** Auto-hide after X milliseconds (optional) */
	autoHideDelay?: number;
}

/**
 * Beautiful notification permission prompt component
 * Shows after user posts their first comment
 *
 * @example
 * ```tsx
 * <NotificationPermissionPrompt
 *   variant="minimal"
 *   isVisible={showPrompt}
 *   onAccept={handleAccept}
 *   onDismiss={handleDismiss}
 * />
 * ```
 */
const NotificationPermissionPrompt: React.FC<NotificationPermissionPromptProps> = ({
	variant = 'minimal',
	onAccept,
	onDismiss,
	isVisible,
	message = 'Get notified when people respond to your comment?',
	autoHideDelay
}) => {
	const [show, setShow] = useState(false);
	const [animate, setAnimate] = useState(false);

	useEffect(() => {
		if (isVisible) {
			// Trigger entrance animation
			setShow(true);
			setTimeout(() => setAnimate(true), 10);

			// Auto-hide if specified
			if (autoHideDelay) {
				const timer = setTimeout(() => {
					handleDismiss();
				}, autoHideDelay);

				return () => clearTimeout(timer);
			}
		} else {
			setAnimate(false);
			const timer = setTimeout(() => setShow(false), 300);

			return () => clearTimeout(timer);
		}
	}, [isVisible, autoHideDelay]);

	const handleAccept = () => {
		setAnimate(false);
		setTimeout(() => {
			setShow(false);
			onAccept();
		}, 300);
	};

	const handleDismiss = () => {
		setAnimate(false);
		setTimeout(() => {
			setShow(false);
			onDismiss();
		}, 300);
	};

	if (!show) return null;

	const variantClass = variant === 'minimal' ? styles.minimal :
		variant === 'card' ? styles.card : styles.glass;

	return (
		<div
			className={`${styles.notificationPrompt} ${variantClass} ${animate ? styles.visible : ''}`}
			role="dialog"
			aria-labelledby="notification-prompt-message"
			aria-live="polite"
		>
			{variant === 'card' && (
				<button
					className={styles.closeButton}
					onClick={handleDismiss}
					aria-label="Close notification prompt"
				>
					<X size={18} />
				</button>
			)}

			<div className={styles.content}>
				{(variant === 'card' || variant === 'glass') && (
					<div className={styles.iconWrapper}>
						<Bell className={styles.icon} size={24} />
					</div>
				)}

				<div className={styles.messageWrapper}>
					<p id="notification-prompt-message" className={styles.message}>
						{message}
					</p>
				</div>

				<div className={styles.actions}>
					<button
						className={styles.dismissButton}
						onClick={handleDismiss}
						aria-label="Dismiss notification prompt"
					>
						Not Now
					</button>
					<button
						className={styles.acceptButton}
						onClick={handleAccept}
						aria-label="Enable notifications"
					>
						Yes, Notify Me
					</button>
				</div>
			</div>
		</div>
	);
};

export default NotificationPermissionPrompt;
