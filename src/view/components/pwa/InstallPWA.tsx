import React, { useEffect, useState } from 'react';
import styles from './installPWA.module.scss';
import InstallAppIcon from '@/assets/icons/installIconW.svg?react';
import { logError } from '@/utils/errorHandling';

type BeforeInstallPromptEvent = Event & {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

interface InstallPWAProps {
	isOpen?: boolean;
	onClose?: () => void;
}

const InstallPWA: React.FC<InstallPWAProps> = ({ isOpen = false, onClose }) => {
	const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
	const [isInstallable, setIsInstallable] = useState(false);

	// Track if the user has already responded to the PWA install prompt
	const [hasUserResponded, setHasUserResponded] = useState<boolean>(() => {
		return localStorage.getItem('pwa-user-responded') === 'true';
	});

	useEffect(() => {
		// Handle the 'beforeinstallprompt' event — fired when the app becomes installable
		const handleBeforeInstallPrompt = (e: Event) => {
			// Prevent the automatic mini-infobar
			e.preventDefault();

			// Save the event for later so we can trigger it manually on button click
			setDeferredPrompt(e as BeforeInstallPromptEvent);

			// Device can install the app
			if (!hasUserResponded) {
				setIsInstallable(true);
			}
		};

		// Handle the 'appinstalled' event — fired when the app is actually installed
		const handleAppInstalled = () => {
			console.info('✅ App was installed via native prompt');

			// Clean up the prompt and hide the install button
			setDeferredPrompt(null);
			setIsInstallable(false);
			setHasUserResponded(true);
			localStorage.setItem('pwa-user-responded', 'true');
		};

		// Listen for install prompt availability
		window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

		// Listen for actual installation event
		window.addEventListener('appinstalled', handleAppInstalled);

		// Check if the app is already running in standalone mode (PWA already installed)
		if (window.matchMedia('(display-mode: standalone)').matches) {
			setIsInstallable(false);
		}

		// Cleanup on unmount
		return () => {
			window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
			window.removeEventListener('appinstalled', handleAppInstalled);
		};
	}, [hasUserResponded]);

	const handleInstallClick = async () => {
		if (!deferredPrompt) return;

		// Show the install prompt
		deferredPrompt.prompt();

		let settled = false;

		// Fallback: Hide the button after 5 seconds if no response
		const fallbackTimeout = setTimeout(() => {
			if (!settled) {
				console.info('No response from install prompt — hiding button');
				setIsInstallable(false);
				setDeferredPrompt(null);
				setHasUserResponded(true);
				localStorage.setItem('pwa-user-responded', 'true');
				settled = true;
			}
		}, 5000);

		try {
			// Wait for the user to respond to the prompt
			const { outcome } = await deferredPrompt.userChoice;

			if (!settled) {
				console.info(`User install decision: ${outcome}`);
				clearTimeout(fallbackTimeout); // clear fallback if user did respond
				setIsInstallable(false);
				setDeferredPrompt(null);
				setHasUserResponded(true);
				localStorage.setItem('pwa-user-responded', 'true');
				settled = true;
			}
		} catch (err) {
			logError(err, {
				operation: 'pwa.InstallPWA.fallbackTimeout',
				metadata: { message: 'Prompt error:' },
			});
			if (!settled) {
				setIsInstallable(false);
				setDeferredPrompt(null);
				setHasUserResponded(true);
				localStorage.setItem('pwa-user-responded', 'true');
			}
		}
	};

	const handleDismissClick = () => {
		setIsInstallable(false);
		setHasUserResponded(true);
		localStorage.setItem('pwa-user-responded', 'true');
		onClose?.();
	};

	// Hide component if install isn't allowed, already handled, or not explicitly opened
	if (!isInstallable || !isOpen) {
		return null;
	}

	return (
		<div className={styles.installPwaOverlay}>
			<div className={styles.installPwaContent}>
				<div className={styles.installPwaHeader}>
					<h3>Install FreeDi</h3>
					<p>Get quick access to your groups and discussions from your home screen.</p>
				</div>
				<div className={styles.installPwaActions}>
					<button className={styles.dismissButton} onClick={handleDismissClick}>
						Not Now
					</button>
					<button className={styles.installButton} onClick={handleInstallClick}>
						<InstallAppIcon className={styles.installIcon} />
						Install App
					</button>
				</div>
			</div>
		</div>
	);
};

export default InstallPWA;
