import { useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useDialogMechanics } from '@/utils/dialogMechanics';

/**
 * A small dialog over the shared `.modal` block (shared-styles molecules).
 * Portaled to <body> so the inert `#root` (dialogMechanics) does not swallow
 * it; Esc / backdrop close unless `busy`.
 */
export type SimpleModalSize = 'small' | 'medium' | 'large';

export interface SimpleModalProps {
	title: string;
	onClose: () => void;
	children: ReactNode;
	footer?: ReactNode;
	size?: SimpleModalSize;
	/** While true the dialog cannot be dismissed (a request is in flight). */
	busy?: boolean;
	initialFocusRef?: RefObject<HTMLElement>;
}

export default function SimpleModal({
	title,
	onClose,
	children,
	footer,
	size = 'small',
	busy = false,
	initialFocusRef,
}: SimpleModalProps) {
	const { t } = useTranslation();
	const titleId = useId();
	const panelRef = useRef<HTMLDivElement>(null);

	const requestClose = () => {
		if (!busy) onClose();
	};

	useDialogMechanics({ isOpen: true, onClose: requestClose, panelRef, initialFocusRef });

	const modal = (
		<div
			className={clsx('modal', 'modal--open', `modal--${size}`)}
			onClick={(event) => {
				if (event.target === event.currentTarget) requestClose();
			}}
		>
			<div className="modal__backdrop" aria-hidden="true" />
			<div
				ref={panelRef}
				className="modal__content"
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				tabIndex={-1}
			>
				<div className="modal__header">
					<h2 id={titleId} className="modal__title">
						{title}
					</h2>
					<button
						type="button"
						className="modal__close-button"
						aria-label={t('Close')}
						disabled={busy}
						onClick={requestClose}
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							aria-hidden="true"
						>
							<path d="M6 6l12 12M18 6L6 18" />
						</svg>
					</button>
				</div>
				<div className="modal__body">{children}</div>
				{footer && <div className="modal__footer">{footer}</div>}
			</div>
		</div>
	);

	return createPortal(modal, document.body);
}
