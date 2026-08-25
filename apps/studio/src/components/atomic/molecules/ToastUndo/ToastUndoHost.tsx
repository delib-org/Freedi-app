import React, { useSyncExternalStore } from 'react';
import clsx from 'clsx';
import ToastUndo from './ToastUndo';
import { subscribe, getSnapshot, settle } from './toastUndoStore';

export interface ToastUndoHostProps {
	className?: string;
}

/**
 * Renders the current undo toast (if any) in a bottom-centre container.
 * Mount once near the app root.
 */
const ToastUndoHost: React.FC<ToastUndoHostProps> = ({ className }) => {
	const toast = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

	if (!toast) return null;

	return (
		<div
			className={clsx(
				'toast-container',
				'toast-container--bottom-center',
				'toast-container--studio',
				className,
			)}
		>
			<ToastUndo
				key={toast.id}
				message={toast.message}
				durationMs={toast.durationMs}
				onUndo={() => settle(toast.id, true)}
				onExpire={() => settle(toast.id, false)}
			/>
		</div>
	);
};

export default ToastUndoHost;
