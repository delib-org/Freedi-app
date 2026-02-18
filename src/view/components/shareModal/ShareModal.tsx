import { FC, useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import Modal from '../modal/Modal';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { logError } from '@/utils/errorHandling';
import styles from './ShareModal.module.scss';

interface ShareModalProps {
	isOpen: boolean;
	onClose: () => void;
	url: string;
	title?: string;
}

const ShareModal: FC<ShareModalProps> = ({ isOpen, onClose, url, title }) => {
	const { t } = useTranslation();
	const [copied, setCopied] = useState(false);

	const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;

	useEffect(() => {
		if (isOpen) {
			copyToClipboard();
		}
	}, [isOpen]);

	useEffect(() => {
		if (copied) {
			const timer = setTimeout(() => setCopied(false), 3000);

			return () => clearTimeout(timer);
		}
	}, [copied]);

	const copyToClipboard = async () => {
		try {
			await navigator.clipboard.writeText(fullUrl);
			setCopied(true);
		} catch (error) {
			logError(error, {
				operation: 'shareModal.copyToClipboard',
				metadata: { url: fullUrl },
			});
		}
	};

	if (!isOpen) return null;

	return (
		<Modal closeModal={onClose} title={title || t('Share')}>
			<div className={styles.shareModal}>
				<h2 className={styles.shareModal__title}>{title || t('Share this link')}</h2>

				<div className={styles.shareModal__qrContainer}>
					<QRCodeSVG
						value={fullUrl}
						size={200}
						level="M"
						includeMargin
						className={styles.shareModal__qrCode}
					/>
				</div>

				<div className={styles.shareModal__linkContainer}>
					<input
						type="text"
						value={fullUrl}
						readOnly
						className={styles.shareModal__linkInput}
						onClick={(e) => (e.target as HTMLInputElement).select()}
					/>
					<button type="button" onClick={copyToClipboard} className={styles.shareModal__copyButton}>
						{copied ? t('copied') : t('copy')}
					</button>
				</div>

				{copied && (
					<p className={styles.shareModal__copiedMessage}>{t('Link copied to clipboard')}</p>
				)}

				<button type="button" onClick={onClose} className={styles.shareModal__closeButton}>
					{t('Close')}
				</button>
			</div>
		</Modal>
	);
};

export default ShareModal;
