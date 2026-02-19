import React, { useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

/**
 * Modal Molecule - Atomic Design System
 *
 * A minimal React wrapper around BEM-styled modal classes.
 * All styling is handled by SCSS in src/view/style/molecules/_modal.scss
 *
 * Renders via portal to document.body. Handles Escape key, backdrop click,
 * focus trapping, and body scroll locking.
 */

// ============================================================================
// TYPES
// ============================================================================

export type ModalSize = 'small' | 'medium' | 'large' | 'full-screen';
export type ModalVariant = 'default' | 'primary' | 'warning' | 'error' | 'success';
export type ModalLayout = 'default' | 'bottom-sheet' | 'centered';

export interface ModalProps {
	/** Whether the modal is open */
	isOpen: boolean;

	/** Close handler - called on backdrop click and Escape key */
	onClose: () => void;

	/** Modal content */
	children: React.ReactNode;

	/** Modal title (renders in header) */
	title?: string;

	/** Footer content (usually buttons) */
	footer?: React.ReactNode;

	/** Size variant */
	size?: ModalSize;

	/** Visual variant */
	variant?: ModalVariant;

	/** Layout variant */
	layout?: ModalLayout;

	/** Whether clicking the backdrop closes the modal */
	closeOnBackdrop?: boolean;

	/** Whether pressing Escape closes the modal */
	closeOnEscape?: boolean;

	/** Whether to show the close button in the header */
	showCloseButton?: boolean;

	/** Whether to remove padding from content */
	noPadding?: boolean;

	/** Footer alignment */
	footerAlign?: 'end' | 'center' | 'start' | 'space-between';

	/** Additional CSS classes */
	className?: string;

	/** HTML id attribute */
	id?: string;

	/** ARIA label override */
	ariaLabel?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

const Modal: React.FC<ModalProps> = ({
	isOpen,
	onClose,
	children,
	title,
	footer,
	size = 'medium',
	variant = 'default',
	layout = 'default',
	closeOnBackdrop = true,
	closeOnEscape = true,
	showCloseButton = true,
	noPadding = false,
	footerAlign = 'end',
	className,
	id,
	ariaLabel,
}) => {
	const modalRef = useRef<HTMLDivElement>(null);
	const previousActiveElement = useRef<Element | null>(null);

	// Handle Escape key
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (closeOnEscape && e.key === 'Escape') {
				onClose();
			}
		},
		[closeOnEscape, onClose],
	);

	// Handle backdrop click
	const handleBackdropClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (closeOnBackdrop && e.target === e.currentTarget) {
				onClose();
			}
		},
		[closeOnBackdrop, onClose],
	);

	// Body scroll lock and focus management
	useEffect(() => {
		if (isOpen) {
			previousActiveElement.current = document.activeElement;
			document.body.classList.add('modal-open');
			document.addEventListener('keydown', handleKeyDown);

			// Focus the modal content
			if (modalRef.current) {
				modalRef.current.focus();
			}
		} else {
			document.body.classList.remove('modal-open');
			document.removeEventListener('keydown', handleKeyDown);

			// Restore focus
			if (previousActiveElement.current instanceof HTMLElement) {
				previousActiveElement.current.focus();
			}
		}

		return () => {
			document.body.classList.remove('modal-open');
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [isOpen, handleKeyDown]);

	// Build BEM classes
	const modalClasses = clsx(
		'modal', // Block
		isOpen && 'modal--open', // Modifier: open
		`modal--${size}`, // Modifier: size
		variant !== 'default' && `modal--${variant}`, // Modifier: variant
		layout !== 'default' && `modal--${layout}`, // Modifier: layout
		noPadding && 'modal--no-padding', // Modifier: no-padding
		className, // Additional classes
	);

	const footerClasses = clsx(
		'modal__footer',
		footerAlign !== 'end' && `modal__footer--${footerAlign}`,
	);

	if (!isOpen) {
		return null;
	}

	const modalContent = (
		<div
			id={id}
			className={modalClasses}
			onClick={handleBackdropClick}
			role="dialog"
			aria-modal="true"
			aria-label={ariaLabel || title || 'Modal'}
		>
			<div className="modal__backdrop" aria-hidden="true" />

			<div
				className="modal__content"
				ref={modalRef}
				tabIndex={-1}
				onClick={(e) => e.stopPropagation()}
			>
				{(title || showCloseButton) && (
					<div className="modal__header">
						{title && <h3 className="modal__title">{title}</h3>}
						{showCloseButton && (
							<button
								type="button"
								className="modal__close-button"
								onClick={onClose}
								aria-label="Close modal"
							>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
									<line x1="18" y1="6" x2="6" y2="18" />
									<line x1="6" y1="6" x2="18" y2="18" />
								</svg>
							</button>
						)}
					</div>
				)}

				<div className="modal__body">{children}</div>

				{footer && <div className={footerClasses}>{footer}</div>}
			</div>
		</div>
	);

	return createPortal(modalContent, document.body);
};

export default Modal;
