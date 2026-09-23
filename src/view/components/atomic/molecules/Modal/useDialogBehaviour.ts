import { RefObject, useEffect, useRef } from 'react';

const dialogStack: HTMLElement[] = [];
const bodyLocks = new Map<string, number>();

const FOCUSABLE =
	'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogBehaviourOptions {
	isOpen: boolean;
	onClose: () => void;
	/** Element that receives focus on open and bounds the Tab cycle. */
	panelRef: RefObject<HTMLElement | null>;
	closeOnEscape?: boolean;
	/** Keep Tab / Shift+Tab inside the panel while open. */
	trapFocus?: boolean;
	/** Body class used by the stylesheet to lock scrolling. */
	bodyClass?: string;
}

/**
 * The behaviour every overlay shares (Modal, Sheet): body scroll lock, Escape
 * to close, focus moved into the panel on open and returned to the opener on
 * close, and an optional Tab cycle so keyboard users can't leave the dialog.
 */
export function useDialogBehaviour({
	isOpen,
	onClose,
	panelRef,
	closeOnEscape = true,
	trapFocus = false,
	bodyClass = 'modal-open',
}: DialogBehaviourOptions): void {
	const previousActiveElement = useRef<Element | null>(null);
	// Callers usually pass an inline arrow; reading it through a ref keeps the
	// open/close effect from tearing down (and moving focus) on every render.
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	useEffect(() => {
		if (!isOpen) return undefined;

		previousActiveElement.current = document.activeElement;
		const panel = panelRef.current;
		if (panel) dialogStack.push(panel);
		bodyLocks.set(bodyClass, (bodyLocks.get(bodyClass) ?? 0) + 1);
		document.body.classList.add(bodyClass);
		panelRef.current?.focus();

		const handleKeyDown = (event: KeyboardEvent) => {
			if (panel && dialogStack[dialogStack.length - 1] !== panel) return;
			if (event.key === 'Escape' && closeOnEscape) {
				onCloseRef.current();

				return;
			}
			if (event.key !== 'Tab' || !trapFocus || !panelRef.current) return;

			const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
			if (focusable.length === 0) {
				event.preventDefault();

				return;
			}
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			const active = document.activeElement;
			if (event.shiftKey && (active === first || active === panelRef.current)) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && active === last) {
				event.preventDefault();
				first.focus();
			}
		};

		document.addEventListener('keydown', handleKeyDown);

		return () => {
			document.removeEventListener('keydown', handleKeyDown);
			const index = panel ? dialogStack.lastIndexOf(panel) : -1;
			if (index >= 0) dialogStack.splice(index, 1);
			const remaining = (bodyLocks.get(bodyClass) ?? 1) - 1;
			bodyLocks.set(bodyClass, remaining);
			if (!remaining) document.body.classList.remove(bodyClass);
			if (previousActiveElement.current instanceof HTMLElement) {
				previousActiveElement.current.focus();
			}
		};
	}, [isOpen, panelRef, closeOnEscape, trapFocus, bodyClass]);
}

export default useDialogBehaviour;
