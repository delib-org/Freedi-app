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
	/** When provided, show a copy-paste iframe embed snippet for this URL. */
	embedUrl?: string;
}

const ShareModal: FC<ShareModalProps> = ({ isOpen, onClose, url, title, embedUrl }) => {
	const { t } = useTranslation();
	const [copied, setCopied] = useState(false);
	const [embedCopied, setEmbedCopied] = useState(false);

	const toAbsolute = (value: string) =>
		value.startsWith('http') ? value : `${window.location.origin}${value}`;

	const fullUrl = toAbsolute(url);
	const embedSnippet = embedUrl
		? `<iframe src="${toAbsolute(embedUrl)}" width="100%" height="600" style="border:0" allow="clipboard-write" title="${title ?? 'Freedi map'}"></iframe>`
		: '';

	useEffect(() => {
		if (isOpen) {
			copyToClipboard(fullUrl, setCopied);
		}
	}, [isOpen]);

	useEffect(() => {
		if (copied) {
			const timer = setTimeout(() => setCopied(false), 3000);

			return () => clearTimeout(timer);
		}
	}, [copied]);

	useEffect(() => {
		if (embedCopied) {
			const timer = setTimeout(() => setEmbedCopied(false), 3000);

			return () => clearTimeout(timer);
		}
	}, [embedCopied]);

	const copyToClipboard = async (value: string, onCopied: (copied: boolean) => void) => {
		try {
			await navigator.clipboard.writeText(value);
			onCopied(true);
		} catch (error) {
			logError(error, {
				operation: 'shareModal.copyToClipboard',
				metadata: { url: value },
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
					<button
						type="button"
						onClick={() => copyToClipboard(fullUrl, setCopied)}
						className={styles.shareModal__copyButton}
					>
						{copied ? t('copied') : t('copy')}
					</button>
				</div>

				{copied && (
					<p className={styles.shareModal__copiedMessage}>{t('Link copied to clipboard')}</p>
				)}

				{embedSnippet && (
					<div className={styles.shareModal__embed}>
						<label className={styles.shareModal__embedLabel}>{t('Embed code')}</label>
						<textarea
							value={embedSnippet}
							readOnly
							className={styles.shareModal__embedInput}
							rows={3}
							onClick={(e) => (e.target as HTMLTextAreaElement).select()}
						/>
						<button
							type="button"
							onClick={() => copyToClipboard(embedSnippet, setEmbedCopied)}
							className={styles.shareModal__copyButton}
						>
							{embedCopied ? t('copied') : t('Copy embed code')}
						</button>
					</div>
				)}

				<button type="button" onClick={onClose} className={styles.shareModal__closeButton}>
					{t('Close')}
				</button>
			</div>
		</Modal>
	);
};

export default ShareModal;
