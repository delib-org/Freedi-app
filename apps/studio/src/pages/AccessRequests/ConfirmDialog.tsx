import { useState, type ReactNode } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button } from '@/components/atomic/atoms';
import { logError } from '@/utils/logError';
import SimpleModal from '../_shared/SimpleModal';
import { callableMessage } from '../_shared/callableErrors';
import styles from './AccessRequests.module.scss';

export interface ConfirmDialogProps {
	title: string;
	/** What is about to happen, in a sentence. */
	message: string;
	confirmText: string;
	/** The `operation` for the error log, `module.function`. */
	operation: string;
	/** Runs on confirm; a throw keeps the dialog open with the error shown. */
	onConfirm: () => Promise<void>;
	onClose: () => void;
	/** Extra fields (the decline reason). */
	children?: ReactNode;
}

/**
 * The app's confirm step for something that cannot be undone (declining,
 * removing access): a SimpleModal with Cancel and a confirm button that shows
 * progress and any server explanation. Never `window.confirm`.
 */
export default function ConfirmDialog({
	title,
	message,
	confirmText,
	operation,
	onConfirm,
	onClose,
	children,
}: ConfirmDialogProps) {
	const { t } = useTranslation();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');

	const confirm = async () => {
		if (busy) return;
		setBusy(true);
		setError('');
		try {
			await onConfirm();
		} catch (err) {
			logError(err, { operation });
			setError(callableMessage(err, t('Something went wrong. Please try again.')));
			setBusy(false);
		}
	};

	return (
		<SimpleModal title={title} onClose={onClose} busy={busy}>
			<div className={styles.form}>
				<p className={styles.note}>{message}</p>
				{children}
				{error && (
					<p className={styles.error} role="alert">
						{error}
					</p>
				)}
				<div className={styles.formActions}>
					<Button text={t('Cancel')} variant="secondary" disabled={busy} onClick={onClose} />
					<Button
						text={busy ? t('Working…') : confirmText}
						variant="primary"
						disabled={busy}
						onClick={() => void confirm()}
					/>
				</div>
			</div>
		</SimpleModal>
	);
}
