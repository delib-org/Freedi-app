import { FC, useState } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { Button } from '@/view/components/atomic/atoms/Button';
import useNotifications from '@/controllers/hooks/useNotifications';
import { trackPermissionRequest } from '@/services/notificationAnalytics';
import { STORAGE_KEYS } from '@/constants/common';
import { logError } from '@/utils/errorHandling';
import styles from './FirstRunFlow.module.scss';

export interface NotificationsStepProps {
	onDone: () => void;
}

/**
 * Same permission request as the legacy NotificationPrompt, as a step with
 * Skip always visible. Skipping starts the soft-prompt cooldown so the
 * question pages don't nag again right away.
 */
const NotificationsStep: FC<NotificationsStepProps> = ({ onDone }) => {
	const { t } = useTranslation();
	const { requestPermission } = useNotifications();
	const [busy, setBusy] = useState(false);

	async function handleEnable() {
		setBusy(true);
		try {
			const result = await requestPermission();
			trackPermissionRequest(result);
		} catch (error) {
			logError(error, { operation: 'firstRun.NotificationsStep.handleEnable' });
		} finally {
			setBusy(false);
			onDone();
		}
	}

	function handleSkip() {
		try {
			localStorage.setItem(STORAGE_KEYS.NOTIFICATION_SOFT_PROMPT_DISMISSED_AT, String(Date.now()));
		} catch {
			/* storage unavailable */
		}
		onDone();
	}

	return (
		<section className={styles.step} data-testid="first-run-notifications">
			<h2 className={styles.step__title}>{t('notifications.stayUpdated')}</h2>
			<p className={styles.step__body}>{t('notifications.enablePrompt')}</p>
			<div className={styles.actions}>
				<Button
					text={t('notifications.enable')}
					variant="primary"
					loading={busy}
					disabled={busy}
					onClick={handleEnable}
					id="first-run-enable-notifications"
				/>
				<Button
					text={t('firstRun.skip')}
					variant="secondary"
					disabled={busy}
					onClick={handleSkip}
					id="first-run-skip"
				/>
			</div>
		</section>
	);
};

export default NotificationsStep;
