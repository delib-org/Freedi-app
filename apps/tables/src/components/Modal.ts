import m from 'mithril';
import { closeIcon } from '@/components/icons';

/**
 * The one modal of the app (IA section 5): `role=dialog`, focus moved in and
 * trapped, Escape and the background close it, focus goes back to where it
 * was, and the page behind is blurred under a soft navy scrim. Set `locked`
 * while its action is running, so it cannot be closed halfway.
 */
export interface ModalAttrs {
	title: string;
	onClose: () => void;
	locked?: boolean;
	/** Draws a close button beside the title, for a dialog that holds a form. */
	closeLabel?: string;
}

const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const OPEN_CLASS = 'modal-open';

let nextTitleId = 0;

function focusablesIn(dialog: HTMLElement): HTMLElement[] {
	return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
}

/** Tab past the last element wraps to the first, and Shift+Tab the other way. */
function keepTabInside(event: KeyboardEvent, dialog: HTMLElement): void {
	const focusable = focusablesIn(dialog);
	const first = focusable[0];
	const last = focusable[focusable.length - 1];

	if (!first) {
		event.preventDefault();
		dialog.focus();
	} else if (event.shiftKey && document.activeElement === first) {
		event.preventDefault();
		last.focus();
	} else if (!event.shiftKey && document.activeElement === last) {
		event.preventDefault();
		first.focus();
	} else if (!dialog.contains(document.activeElement)) {
		event.preventDefault();
		first.focus();
	}
}

export const Modal: m.ClosureComponent<ModalAttrs> = (initial) => {
	let latest = initial.attrs;
	let dialog: HTMLElement | null = null;
	let returnFocusTo: HTMLElement | null = null;
	const titleId = `modal-title-${(nextTitleId += 1)}`;

	function closeUnlessLocked(): void {
		if (!latest.locked) latest.onClose();
	}

	function handleKey(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			closeUnlessLocked();
			m.redraw();
		} else if (event.key === 'Tab' && dialog) {
			keepTabInside(event, dialog);
		}
	}

	return {
		oncreate({ dom }) {
			returnFocusTo = document.activeElement as HTMLElement | null;
			dialog = dom.querySelector<HTMLElement>('.modal__dialog');
			if (dialog) (focusablesIn(dialog)[0] ?? dialog).focus();
			document.addEventListener('keydown', handleKey);
			document.documentElement.classList.add(OPEN_CLASS);
		},
		onremove() {
			document.removeEventListener('keydown', handleKey);
			document.documentElement.classList.remove(OPEN_CLASS);
			returnFocusTo?.focus();
		},
		view({ attrs, children }) {
			latest = attrs;

			return m(
				'.modal',
				{
					onclick: (event: MouseEvent) => {
						if (event.target === event.currentTarget) closeUnlessLocked();
					},
				},
				m(
					'.modal__dialog',
					{ role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: -1 },
					[
						m('.modal__head', [
							m('h2.modal__title', { id: titleId, dir: 'auto' }, attrs.title),
							attrs.closeLabel
								? m(
										'button.modal__close',
										{
											type: 'button',
											'aria-label': attrs.closeLabel,
											disabled: attrs.locked,
											onclick: attrs.onClose,
										},
										closeIcon(),
									)
								: null,
						]),
						children,
					],
				),
			);
		},
	};
};
