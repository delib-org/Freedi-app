import { FC, useState, useCallback } from 'react';
import { Statement } from 'delib-npm';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '@/redux/hooks';
import { selectUser } from '@/redux/users/usersSlice';
import { importGoogleDocToStatement } from '@/controllers/db/statements/importGoogleDoc';
import Modal from '../modal/Modal';
import styles from './GoogleDocsImportModal.module.scss';

interface GoogleDocsImportModalProps {
	statement: Statement;
	isOpen: boolean;
	onClose: () => void;
	onImportComplete?: () => void;
}

type ImportStatus = 'idle' | 'loading' | 'success' | 'error';

const GoogleDocsImportModal: FC<GoogleDocsImportModalProps> = ({
	statement,
	isOpen,
	onClose,
	onImportComplete,
}) => {
	const { t } = useTranslation();
	const user = useAppSelector(selectUser);

	const [url, setUrl] = useState('');
	const [status, setStatus] = useState<ImportStatus>('idle');
	const [errorMessage, setErrorMessage] = useState('');
	const [serviceAccountEmail, setServiceAccountEmail] = useState('');

	const handleImport = useCallback(async () => {
		if (!url.trim()) {
			setErrorMessage(t('Please enter a Google Docs URL'));
			setStatus('error');

			return;
		}

		if (!user?.uid) {
			setErrorMessage(t('You must be logged in to import'));
			setStatus('error');

			return;
		}

		setStatus('loading');
		setErrorMessage('');

		const result = await importGoogleDocToStatement(url, statement, user.uid);

		if (result.success) {
			setStatus('success');
			setUrl('');
			onImportComplete?.();

			// Close modal after short delay
			setTimeout(() => {
				onClose();
				setStatus('idle');
			}, 1500);
		} else {
			setStatus('error');
			setErrorMessage(result.error || t('Failed to import document'));
			if (result.serviceAccountEmail) {
				setServiceAccountEmail(result.serviceAccountEmail);
			}
		}
	}, [url, user, statement, t, onImportComplete, onClose]);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter' && status !== 'loading') {
			handleImport();
		}
	};

	const handleClose = () => {
		setUrl('');
		setStatus('idle');
		setErrorMessage('');
		setServiceAccountEmail('');
		onClose();
	};

	if (!isOpen) return null;

	return (
		<Modal onClose={handleClose}>
			<div className={styles.modal}>
				<header className={styles.header}>
					<h2>{t('Import from Google Docs')}</h2>
					<button
						type="button"
						className={styles.closeButton}
						onClick={handleClose}
						aria-label={t('Close')}
					>
						×
					</button>
				</header>

				<div className={styles.content}>
					<p className={styles.description}>
						{t('Paste a Google Docs link to import content')}
					</p>

					<input
						type="url"
						className={styles.input}
						placeholder={t('Enter Google Docs URL')}
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						onKeyDown={handleKeyDown}
						disabled={status === 'loading'}
						autoFocus
					/>

					{status === 'error' && errorMessage && (
						<div className={styles.error}>
							<p>{errorMessage}</p>
							{serviceAccountEmail && (
								<p className={styles.shareHint}>
									{t('Share your document with:')}{' '}
									<code>{serviceAccountEmail}</code>
								</p>
							)}
						</div>
					)}

					{status === 'success' && (
						<div className={styles.success}>
							{t('Document imported successfully')}
						</div>
					)}

					<p className={styles.hint}>
						{t(
							'Make sure the document is shared with the import service or set to "Anyone with the link"'
						)}
					</p>
				</div>

				<footer className={styles.footer}>
					<button
						type="button"
						className={styles.cancelButton}
						onClick={handleClose}
						disabled={status === 'loading'}
					>
						{t('Cancel')}
					</button>
					<button
						type="button"
						className={styles.importButton}
						onClick={handleImport}
						disabled={status === 'loading' || !url.trim()}
					>
						{status === 'loading' ? t('Importing...') : t('Import')}
					</button>
				</footer>
			</div>
		</Modal>
	);
};

export default GoogleDocsImportModal;
