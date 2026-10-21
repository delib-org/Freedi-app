import m from 'mithril';
import { t } from '@/lib/i18n';

export interface SheetAttrs {
	title: string;
	onClose: () => void;
}

const FOCUSABLE =
	'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const LOCK_CLASS = 'c3-lock';

interface SheetState {
	opener: Element | null;
	onKey: ((event: KeyboardEvent) => void) | null;
}

/**
 * Bottom sheet (UX §2.6.5): 92vh, labelled close, focus trap, Escape.
 * Closing returns focus to the control that opened it; the page under it does
 * not scroll.
 */
export const Sheet: m.Component<SheetAttrs> = {
	oninit({ state }) {
		(state as unknown as SheetState).opener = document.activeElement;
	},

	oncreate({ dom, attrs, state }) {
		const self = state as unknown as SheetState;
		document.body.classList.add(LOCK_CLASS);
		const panel = dom.querySelector<HTMLElement>('.sheet__panel');
		dom.querySelector<HTMLElement>('.sheet__close')?.focus();
		self.onKey = (event: KeyboardEvent): void => {
			if (event.key === 'Escape') {
				event.preventDefault();
				attrs.onClose();
				m.redraw();

				return;
			}
			if (event.key !== 'Tab' || !panel) return;
			const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
			if (items.length === 0) return;
			const first = items[0];
			const last = items[items.length - 1];
			const active = document.activeElement;
			if (event.shiftKey && active === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && active === last) {
				event.preventDefault();
				first.focus();
			}
		};
		document.addEventListener('keydown', self.onKey);
	},

	onremove({ state }) {
		const self = state as unknown as SheetState;
		document.body.classList.remove(LOCK_CLASS);
		if (self.onKey) document.removeEventListener('keydown', self.onKey);
		if (self.opener instanceof HTMLElement) self.opener.focus();
	},

	view({ attrs, children }) {
		return m('.sheet', [
			m('.sheet__panel', { role: 'dialog', 'aria-modal': 'true', 'aria-label': attrs.title }, [
				m('header.sheet__header', [
					m('h2.sheet__title', attrs.title),
					m(
						'button.btn.btn--secondary.sheet__close',
						{ type: 'button', onclick: attrs.onClose },
						t('rate.close'),
					),
				]),
				m('.sheet__body', children),
			]),
		]);
	},
};
