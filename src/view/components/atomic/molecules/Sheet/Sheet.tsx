import React, { useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useDialogBehaviour } from '../Modal/useDialogBehaviour';

/**
 * Sheet Molecule - Atomic Design System
 *
 * Bottom sheet on phones, centred dialog from tablet up. All styling lives in
 * src/view/style/molecules/_sheet.scss. Portals to document.body; Escape,
 * backdrop click, focus trap, focus return and body scroll lock come from
 * useDialogBehaviour (shared with Modal).
 */

export type SheetSize = 'auto' | 'full';

export interface SheetProps {
	isOpen: boolean;
	onClose: () => void;
	title: string;
	children: React.ReactNode;
	footer?: React.ReactNode;
	/** 'full' takes the whole viewport height on phones. */
	size?: SheetSize;
	closeOnBackdrop?: boolean;
	closeOnEscape?: boolean;
	className?: string;
	id?: string;
}

const Sheet: React.FC<SheetProps> = ({
	isOpen,
	onClose,
	title,
	children,
	footer,
	size = 'auto',
	closeOnBackdrop = true,
	closeOnEscape = true,
	className,
	id,
}) => {
	const { t, dir } = useTranslation();
	const panelRef = useRef<HTMLDivElement>(null);
	const titleId = `${id ?? 'sheet'}-title`;

	useDialogBehaviour({ isOpen, onClose, panelRef, closeOnEscape, trapFocus: true });

	const handleBackdropClick = useCallback(() => {
		if (closeOnBackdrop) onClose();
	}, [closeOnBackdrop, onClose]);

	if (!isOpen) return null;

	const classes = clsx('sheet', 'sheet--open', size === 'full' && 'sheet--full', className);

	return createPortal(
		<div id={id} dir={dir} className={classes} role="presentation">
			<div className="sheet__backdrop" onClick={handleBackdropClick} data-testid="sheet-backdrop" />
			<div
				className="sheet__panel"
				ref={panelRef}
				tabIndex={-1}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
			>
				<div className="sheet__handle" aria-hidden="true" />
				<div className="sheet__header">
					<h2 className="sheet__title" id={titleId}>
						{title}
					</h2>
					<button type="button" className="sheet__close" onClick={onClose} aria-label={t('Close')}>
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
				</div>
				<div className="sheet__body">{children}</div>
				{footer && <div className="sheet__footer">{footer}</div>}
			</div>
		</div>,
		document.body,
	);
};

export default Sheet;
