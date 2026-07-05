import { FC, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { logError } from '@/utils/errorHandling';
import styles from './QRCodePanel.module.scss';

interface QRCodePanelProps {
	/** Absolute URL to encode + share. The panel never builds the URL itself. */
	url: string;
	/** Web Share title + heading in the fullscreen presenter. */
	title?: string;
	/** Pixel size of the compact QR. Presenter always renders large. */
	size?: number;
}

async function copyToClipboard(url: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(url);

		return true;
	} catch (error) {
		logError(error, { operation: 'QRCodePanel.copyToClipboard' });

		return false;
	}
}

/**
 * Reusable QR + copy/share panel for the Event Control Center's Share Hub.
 * React port of the join app's `QRShare` (Mithril) using `qrcode.react`.
 */
const QRCodePanel: FC<QRCodePanelProps> = ({ url, title, size = 144 }) => {
	const { t } = useTranslation();
	const [copied, setCopied] = useState(false);
	const [presenter, setPresenter] = useState(false);

	const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

	const handleCopy = useCallback(async () => {
		const ok = await copyToClipboard(url);
		if (ok) {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	}, [url]);

	const handleShare = useCallback(async () => {
		if (!canShare) {
			await handleCopy();

			return;
		}
		try {
			await navigator.share({ title: title ?? t('Share'), url });
		} catch (error) {
			if ((error as DOMException)?.name !== 'AbortError') {
				logError(error, { operation: 'QRCodePanel.handleShare' });
			}
		}
	}, [canShare, handleCopy, title, url, t]);

	return (
		<div className={styles.qr}>
			<button
				type="button"
				className={styles.qr__canvas}
				onClick={() => setPresenter(true)}
				aria-label={t('Enlarge QR code')}
			>
				<QRCodeSVG value={url} size={size} level="M" marginSize={1} />
			</button>

			<div className={styles.qr__actions}>
				{canShare && (
					<button type="button" className={styles.qr__action} onClick={handleShare}>
						{t('Share')}
					</button>
				)}
				<button type="button" className={styles.qr__action} onClick={handleCopy} aria-live="polite">
					{copied ? t('Copied') : t('Copy link')}
				</button>
			</div>

			{presenter && (
				<div
					className={styles.qr__presenter}
					role="dialog"
					aria-modal="true"
					aria-label={t('QR code')}
					onClick={(e) => {
						if (e.target === e.currentTarget) setPresenter(false);
					}}
				>
					<button
						type="button"
						className={styles.qr__presenterClose}
						aria-label={t('Close')}
						onClick={() => setPresenter(false)}
					>
						×
					</button>
					{title && <h2 className={styles.qr__presenterTitle}>{title}</h2>}
					<div className={styles.qr__presenterCanvas}>
						<QRCodeSVG value={url} size={480} level="M" marginSize={2} />
					</div>
					<p className={styles.qr__presenterUrl} dir="ltr">
						{url}
					</p>
				</div>
			)}
		</div>
	);
};

export default QRCodePanel;
