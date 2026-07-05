import { useCallback, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import styles from './QRCodePanel.module.css';

interface QRCodePanelProps {
	url: string;
	title?: string;
	size?: number;
}

export default function QRCodePanel({ url, title, size = 160 }: QRCodePanelProps) {
	const [copied, setCopied] = useState(false);
	const [presenter, setPresenter] = useState(false);

	const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			/* clipboard unavailable — no-op */
		}
	}, [url]);

	const handleShare = useCallback(async () => {
		if (!canShare) {
			await handleCopy();

			return;
		}
		try {
			await navigator.share({ title: title ?? 'Share', url });
		} catch {
			/* user dismissed or unsupported */
		}
	}, [canShare, handleCopy, title, url]);

	return (
		<div className={styles.qr}>
			<button
				type="button"
				className={styles.canvas}
				onClick={() => setPresenter(true)}
				aria-label="Enlarge QR code"
			>
				<QRCodeSVG value={url} size={size} level="M" marginSize={1} />
			</button>

			<div className={styles.actions}>
				{canShare && (
					<button type="button" className={styles.action} onClick={handleShare}>
						Share
					</button>
				)}
				<button type="button" className={styles.action} onClick={handleCopy} aria-live="polite">
					{copied ? 'Copied' : 'Copy link'}
				</button>
			</div>

			{presenter && (
				<div
					className={styles.presenter}
					role="dialog"
					aria-modal="true"
					aria-label="QR code"
					onClick={(e) => {
						if (e.target === e.currentTarget) setPresenter(false);
					}}
				>
					<button
						type="button"
						className={styles.presenterClose}
						aria-label="Close"
						onClick={() => setPresenter(false)}
					>
						×
					</button>
					{title && <h2 className={styles.presenterTitle}>{title}</h2>}
					<div className={styles.presenterCanvas}>
						<QRCodeSVG value={url} size={480} level="M" marginSize={2} />
					</div>
					<p className={styles.presenterUrl} dir="ltr">
						{url}
					</p>
				</div>
			)}
		</div>
	);
}
