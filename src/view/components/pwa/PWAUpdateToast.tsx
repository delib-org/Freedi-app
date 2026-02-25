import React, { useEffect, useState } from 'react';
import styles from './pwaUpdateToast.module.scss';
import { logError } from '@/utils/errorHandling';

interface PWAUpdateToastProps {
	registerUpdate: (skipCallback: boolean) => Promise<void>;
}

const PWAUpdateToast: React.FC<PWAUpdateToastProps> = ({ registerUpdate }) => {
	const [needsUpdate, setNeedsUpdate] = useState(false);

	useEffect(() => {
		// Create custom event listeners for PWA update events
		const handleNeedRefresh = () => {
			setNeedsUpdate(true);
		};

		// Listen for update events from the PWA
		window.addEventListener('pwa:needRefresh', handleNeedRefresh);

		// Automatically prompt for update without user interaction
		// This ensures users always get the latest version as soon as it's available
		// Uncomment this if you want to force updates without user interaction
		/*
    const forceUpdateCheck = () => {
      if (navigator.onLine) {
        registerUpdate(true).catch(console.error);
      }
    };
    
    // Check for updates when tab gains focus
    window.addEventListener('focus', forceUpdateCheck);
    
    return () => {
      window.removeEventListener('pwa:needRefresh', handleNeedRefresh);
      window.removeEventListener('focus', forceUpdateCheck);
    };
    */

		return () => {
			window.removeEventListener('pwa:needRefresh', handleNeedRefresh);
		};
	}, [registerUpdate]);

	const handleUpdate = () => {
		// Update the service worker with reload
		registerUpdate(true).catch((error: unknown) =>
			logError(error, { operation: 'PWAUpdateToast.handleUpdate' }),
		);
		setNeedsUpdate(false);
	};

	const handleDismiss = () => {
		setNeedsUpdate(false);
	};

	if (!needsUpdate) return null;

	return (
		<div className={styles.pwaUpdateToast}>
			<div className={styles.pwaUpdateContent}>
				<img src="/src/assets/icons/updateIcon.svg" alt="Update" className={styles.updateIcon} />
				<div className={styles.updateMessage}>
					<p>New content available</p>
					<p className={styles.updateSub}>Update now for the latest features</p>
				</div>
			</div>
			<div className={styles.pwaUpdateActions}>
				<button onClick={handleDismiss} className={styles.dismissButton}>
					Later
				</button>
				<button onClick={handleUpdate} className={styles.updateButton}>
					Update Now
				</button>
			</div>
		</div>
	);
};

export default PWAUpdateToast;
