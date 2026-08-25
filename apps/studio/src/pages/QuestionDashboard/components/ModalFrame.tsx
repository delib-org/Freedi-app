import { useCallback, useId, useRef, type FC, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useDialogMechanics } from '@/utils/dialogMechanics';

/**
 * ModalFrame — the dashboard's simple modal: shared `.modal` BEM chrome
 * (styles from @freedi/shared-styles/molecules/modal) + `useDialogMechanics`
 * (portal, focus trap, Esc, body lock, focus restore).
 *
 * A QR presenter (its own dialog, also portaled) can open on top of us, so
 * Escape is honoured only while focus is inside this panel — otherwise one
 * Escape would close both layers.
 */
export type ModalSize = 'small' | 'medium' | 'large';

export interface ModalFrameProps {
	isOpen: boolean;
	onClose: () => void;
	title: string;
	/** Visually hide the title (still announced). */
	hideTitle?: boolean;
	size?: ModalSize;
	initialFocusRef?: RefObject<HTMLElement>;
	footer?: ReactNode;
	children: ReactNode;
	className?: string;
}

const ModalFrame: FC<ModalFrameProps> = ({
	isOpen,
	onClose,
	title,
	hideTitle = false,
	size = 'medium',
	initialFocusRef,
	footer,
	children,
	className,
}) => {
	const { t } = useTranslation();
	const titleId = useId();
	const panelRef = useRef<HTMLDivElement>(null);

	const guardedClose = useCallback(() => {
		const active = document.activeElement;
		const inside = !active || active === document.body || panelRef.current?.contains(active);
		if (inside) onClose();
	}, [onClose]);

	useDialogMechanics({ isOpen, onClose: guardedClose, panelRef, initialFocusRef });

	if (!isOpen) return null;

	return createPortal(
		<div
			className={clsx('modal', 'modal--open', `modal--${size}`, className)}
			role="dialog"
			aria-modal="true"
			aria-labelledby={titleId}
			onClick={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div className="modal__backdrop" aria-hidden="true" />
			<div className="modal__content" ref={panelRef} tabIndex={-1}>
				<header className="modal__header">
					<h2 id={titleId} className={clsx('modal__title', hideTitle && 'visually-hidden')}>
						{title}
					</h2>
					<button
						type="button"
						className="modal__close-button"
						aria-label={t('Close')}
						onClick={onClose}
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
				</header>
				<div className="modal__body">{children}</div>
				{footer && <footer className="modal__footer">{footer}</footer>}
			</div>
		</div>,
		document.body,
	);
};

export default ModalFrame;
