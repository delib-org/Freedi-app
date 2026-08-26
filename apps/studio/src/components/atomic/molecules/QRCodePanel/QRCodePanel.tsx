import { useCallback, useRef, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button } from '@/components/atomic/atoms/Button';
import { useDialogMechanics } from '@/utils/dialogMechanics';
import { logError } from '@/utils/logError';

/**
 * QRCodePanel Molecule — a scannable QR for a participant link, with copy /
 * native-share actions and a full-screen "presenter" mode for projecting.
 * Styles: styles/organisms/_qr-panel.scss (.qr-panel)
 */
export interface QRCodePanelProps {
	url: string;
	/** Shown above the QR in presenter mode and used as the native-share title. */
	title?: string;
	/** Inline QR size in px (presenter mode is always large). */
	size?: number;
	/** Print the URL under the QR (default true). */
	showUrl?: boolean;
	className?: string;
}

const COPIED_FEEDBACK_MS = 2000;
const PRESENTER_SIZE = 480;

const QRCodePanel: FC<QRCodePanelProps> = ({
	url,
	title,
	size = 160,
	showUrl = true,
	className,
}) => {
	const { t } = useTranslation();
	const [copied, setCopied] = useState(false);
	const [presenter, setPresenter] = useState(false);
	const presenterRef = useRef<HTMLDivElement>(null);
	const presenterCloseRef = useRef<HTMLButtonElement>(null);
	const canvasRef = useRef<HTMLButtonElement>(null);

	const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

	const closePresenter = useCallback(() => setPresenter(false), []);

	useDialogMechanics({
		isOpen: presenter,
		onClose: closePresenter,
		panelRef: presenterRef,
		initialFocusRef: presenterCloseRef,
		returnFocusTo: canvasRef.current,
	});

	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
		} catch (error) {
			logError(error, { operation: 'QRCodePanel.copy', metadata: { url } });
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
			// AbortError = the user dismissed the sheet; not worth logging.
			if (!(error instanceof DOMException && error.name === 'AbortError')) {
				logError(error, { operation: 'QRCodePanel.share', metadata: { url } });
			}
		}
	}, [canShare, handleCopy, title, url, t]);

	const presenterDialog = presenter
		? createPortal(
				<div
					className="qr-panel__presenter"
					role="dialog"
					aria-modal="true"
					aria-label={title || t('QR code')}
					onClick={(e) => {
						if (e.target === e.currentTarget) closePresenter();
					}}
				>
					<div className="qr-panel__presenter-panel" ref={presenterRef} tabIndex={-1}>
						<button
							type="button"
							ref={presenterCloseRef}
							className="qr-panel__presenter-close"
							aria-label={t('Close')}
							onClick={closePresenter}
						>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								aria-hidden="true"
							>
								<line x1="18" y1="6" x2="6" y2="18" />
								<line x1="6" y1="6" x2="18" y2="18" />
							</svg>
						</button>
						{title && <h2 className="qr-panel__presenter-title">{title}</h2>}
						<div className="qr-panel__presenter-canvas">
							<QRCodeSVG value={url} size={PRESENTER_SIZE} level="M" marginSize={2} />
						</div>
						<p className="qr-panel__presenter-url" dir="ltr">
							{url}
						</p>
					</div>
				</div>,
				document.body,
			)
		: null;

	return (
		<div className={clsx('qr-panel', className)}>
			<button
				type="button"
				ref={canvasRef}
				className="qr-panel__canvas"
				onClick={() => setPresenter(true)}
				aria-label={t('Enlarge QR code')}
				title={t('Enlarge QR code')}
			>
				<QRCodeSVG value={url} size={size} level="M" marginSize={1} />
			</button>

			{showUrl && (
				<p className="qr-panel__url" dir="ltr">
					{url}
				</p>
			)}

			<div className="qr-panel__actions">
				<Button
					text={copied ? t('Copied') : t('Copy link')}
					variant="secondary"
					size="small"
					onClick={handleCopy}
				/>
				{canShare && (
					<Button text={t('Share')} variant="secondary" size="small" onClick={handleShare} />
				)}
			</div>

			<span className="visually-hidden" role="status" aria-live="polite">
				{copied ? t('Link copied') : ''}
			</span>

			{presenterDialog}
		</div>
	);
};

export default QRCodePanel;
