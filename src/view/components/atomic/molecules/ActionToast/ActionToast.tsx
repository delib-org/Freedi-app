import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { UI } from '@/constants/common';

/**
 * ActionToast Molecule - Atomic Design System
 *
 * One short message with at most one action (Undo, Retry), docked at the
 * bottom: centre on phones, inline-end from 601 px. Leaves on its own after
 * `durationMs`; the countdown pauses while the pointer or focus is inside.
 * Styling: the shared toast molecule (`toast`, `toast__action`, `toast--docked`).
 */
export type ActionToastVariant = 'default' | 'success' | 'error' | 'info';

export interface ActionToastProps {
	message: string;
	onDismiss: () => void;
	actionLabel?: string;
	onAction?: () => void;
	variant?: ActionToastVariant;
	durationMs?: number;
	className?: string;
}

function useAutoDismiss(onDismiss: () => void, durationMs: number, isPaused: boolean): void {
	const onDismissRef = useRef(onDismiss);
	onDismissRef.current = onDismiss;

	useEffect(() => {
		if (isPaused) return;
		const timer = window.setTimeout(() => onDismissRef.current(), durationMs);

		return () => window.clearTimeout(timer);
	}, [durationMs, isPaused]);
}

const ActionToast: React.FC<ActionToastProps> = ({
	message,
	onDismiss,
	actionLabel,
	onAction,
	variant = 'default',
	durationMs = UI.UNDO_TOAST_DURATION,
	className,
}) => {
	const [isHovered, setIsHovered] = useState(false);
	const [isFocused, setIsFocused] = useState(false);
	useAutoDismiss(onDismiss, durationMs, isHovered || isFocused);

	return (
		<div
			className={clsx('toast', `toast--${variant}`, 'toast--docked', className)}
			role="status"
			aria-live="polite"
			data-testid="action-toast"
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			onFocus={() => setIsFocused(true)}
			onBlur={() => setIsFocused(false)}
		>
			<div className="toast__content">
				<p className="toast__message">{message}</p>
			</div>
			{actionLabel && onAction && (
				<button type="button" className="toast__action" onClick={onAction}>
					{actionLabel}
				</button>
			)}
		</div>
	);
};

export default ActionToast;
