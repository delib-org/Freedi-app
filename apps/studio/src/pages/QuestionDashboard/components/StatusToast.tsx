import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A plain (non-undo) status toast over the shared `.toast` BEM block — used
 * for one-way confirmations such as "Sent to N people". The undo toast
 * (`useToastUndo`) stays reserved for reversible actions.
 */
const TOAST_DURATION_MS = 4000;

export interface UseStatusToastResult {
	/** Render this once in the page tree. */
	toast: ReactNode;
	show: (message: string) => void;
}

export function useStatusToast(): UseStatusToastResult {
	const [message, setMessage] = useState<string | null>(null);
	const timer = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
		},
		[],
	);

	const show = useCallback((next: string) => {
		if (timer.current !== null) window.clearTimeout(timer.current);
		setMessage(next);
		timer.current = window.setTimeout(() => setMessage(null), TOAST_DURATION_MS);
	}, []);

	const toast = message ? (
		<div className="toast-container toast-container--bottom-center toast-container--studio">
			<div className="toast toast--success toast--visible" role="status" aria-live="polite">
				<div className="toast__content">
					<p className="toast__message">{message}</p>
				</div>
			</div>
		</div>
	) : null;

	return { toast, show };
}
