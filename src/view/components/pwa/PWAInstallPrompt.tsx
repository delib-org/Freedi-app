import React, { FC } from 'react';
import Modal from '../modal/Modal';
import Button from '@/view/components/atomic/atoms/Button/Button';
import { PWA_MESSAGES } from '@/constants/common';
import styles from './PWAInstallPrompt.module.scss';

interface PWAInstallPromptProps {
	/** Whether the prompt is visible */
	isVisible: boolean;
	/** Callback when user clicks install */
	onInstall: () => void;
	/** Callback when user dismisses the prompt */
	onDismiss: () => void;
}

/**
 * PWA Install Prompt Component
 *
 * Displays a modal prompting the user to install the PWA.
 * Triggered after certain user actions (creating groups, adding options).
 */
const PWAInstallPrompt: FC<PWAInstallPromptProps> = ({ isVisible, onInstall, onDismiss }) => {
	if (!isVisible) {
		return null;
	}

	const handleBackdropClick = (_e: React.MouseEvent<HTMLDivElement>): void => {
		onDismiss();
	};

	const handleInstallClick = (): void => {
		onInstall();
	};

	const handleDismissClick = (): void => {
		onDismiss();
	};

	return (
		<Modal closeModal={handleBackdropClick} title={PWA_MESSAGES.TITLE}>
			<div className={styles.pwaPrompt}>
				<div className={styles.pwaPrompt__header}>
					<div className={styles.pwaPrompt__icon}>
						<svg
							width="48"
							height="48"
							viewBox="0 0 48 48"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
							aria-hidden="true"
						>
							<rect width="48" height="48" rx="12" fill="var(--btn-primary)" />
							<path
								d="M24 14V34M24 14L18 20M24 14L30 20"
								stroke="white"
								strokeWidth="3"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</div>
					<h2 className={styles.pwaPrompt__title}>{PWA_MESSAGES.TITLE}</h2>
				</div>

				<p className={styles.pwaPrompt__description}>{PWA_MESSAGES.DESCRIPTION}</p>

				<div className={styles.pwaPrompt__actions}>
					<Button
						text={PWA_MESSAGES.INSTALL_BUTTON}
						variant="primary"
						size="medium"
						onClick={handleInstallClick}
						fullWidth
					/>
					<Button
						text={PWA_MESSAGES.CANCEL_BUTTON}
						variant="secondary"
						size="medium"
						onClick={handleDismissClick}
						fullWidth
					/>
				</div>
			</div>
		</Modal>
	);
};

export default PWAInstallPrompt;
