import { useEffect, useRef, type RefObject } from 'react';

/**
 * The accessibility mechanics a dialog needs: Escape closes, focus moves inside
 * on open, Tab is trapped, the body stops scrolling (`.modal-open`), the app
 * root becomes `inert`, and focus returns to where it was when the overlay
 * closes.
 *
 * A verbatim copy of apps/studio/src/utils/dialogMechanics.ts. It lives inside
 * the Studio app rather than a shared package, so it cannot be imported — if you
 * fix a bug here, fix it there too.
 *
 * NOTE for callers: this sets `inert` on `#root`, so a dialog rendered inside
 * the React tree would inert ITSELF. Render it through a portal to
 * document.body (see FeedbackDock).
 */
const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
	'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogMechanicsOptions {
	isOpen: boolean;
	onClose: () => void;
	/** The dialog panel — focus is trapped inside it. */
	panelRef: RefObject<HTMLElement>;
	/** Element to focus on open (defaults to the panel itself). */
	initialFocusRef?: RefObject<HTMLElement>;
	/** Element to return focus to on close (defaults to the previously focused element). */
	returnFocusTo?: HTMLElement | null;
	/** Add `.modal-open` to body and `inert` to `#root` while open (default true). */
	lockPage?: boolean;
}

export function getFocusable(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
		(el) => !el.hasAttribute('inert') && el.offsetParent !== null,
	);
}

export function useDialogMechanics({
	isOpen,
	onClose,
	panelRef,
	initialFocusRef,
	returnFocusTo,
	lockPage = true,
}: DialogMechanicsOptions): void {
	const previousActive = useRef<Element | null>(null);
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	useEffect(() => {
		if (!isOpen) return;

		previousActive.current = document.activeElement;
		const root = document.getElementById('root');
		if (lockPage) {
			document.body.classList.add('modal-open');
			root?.setAttribute('inert', '');
		}

		// Focus after paint so the panel exists in the DOM.
		const focusTimer = window.setTimeout(() => {
			const target = initialFocusRef?.current ?? panelRef.current;
			target?.focus();
		}, 0);

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.stopPropagation();
				onCloseRef.current();

				return;
			}
			if (event.key !== 'Tab' || !panelRef.current) return;

			const focusable = getFocusable(panelRef.current);
			if (focusable.length === 0) {
				event.preventDefault();
				panelRef.current.focus();

				return;
			}
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			const active = document.activeElement;
			if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && active === last) {
				event.preventDefault();
				first.focus();
			}
		};

		document.addEventListener('keydown', handleKeyDown);

		return () => {
			window.clearTimeout(focusTimer);
			document.removeEventListener('keydown', handleKeyDown);
			if (lockPage) {
				document.body.classList.remove('modal-open');
				root?.removeAttribute('inert');
			}
			const restoreTo =
				returnFocusTo ??
				(previousActive.current instanceof HTMLElement ? previousActive.current : null);
			restoreTo?.focus();
		};
	}, [isOpen, panelRef, initialFocusRef, returnFocusTo, lockPage]);
}
