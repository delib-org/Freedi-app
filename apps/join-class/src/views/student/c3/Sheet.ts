import m from 'mithril';
import { t } from '@/lib/i18n';

export interface SheetAttrs {
	title: string;
	onClose: () => void;
	/** Compact variant (watch view): 70 dvh, close in a footer, first focus on `[data-autofocus]`, scrim tap closes. */
	compact?: boolean;
	/** Compact: controls above the close button. */
	footer?: m.Children;
	/** Compact: the heading that labels the dialog. */
	labelledBy?: string;
	testId?: string;
	/** Compact: written as `data-state` on the panel. */
	state?: string;
	/** Compact: where focus goes on close, when the opener is gone. */
	returnFocus?: () => HTMLElement | null;
}

const FOCUSABLE =
	'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const LOCK_CLASS = 'c3-lock';

interface SheetState {
	opener: Element | null;
	onKey: ((event: KeyboardEvent) => void) | null;
	returnFocus: (() => HTMLElement | null) | null;
}

/**
 * Bottom sheet (UX §2.6.5): 92vh, labelled close, focus trap, Escape.
 * Closing returns focus to the control that opened it; the page under it does
 * not scroll. The `compact` variant (live writing, UX 2) is a shorter sheet whose
 * close sits in a footer at thumb reach.
 */
export const Sheet: m.Component<SheetAttrs> = {
	oninit({ state }) {
		(state as unknown as SheetState).opener = document.activeElement;
	},

	oncreate({ dom, attrs, state }) {
		const self = state as unknown as SheetState;
		self.returnFocus = attrs.returnFocus ?? null;
		document.body.classList.add(LOCK_CLASS);
		const panel = dom.querySelector<HTMLElement>('.sheet__panel');
		const start = attrs.compact
			? dom.querySelector<HTMLElement>('[data-autofocus]')
			: dom.querySelector<HTMLElement>('.sheet__close');
		start?.focus({ preventScroll: true });
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
		const target =
			self.returnFocus?.() ?? (self.opener instanceof HTMLElement ? self.opener : null);
		if (target && target.isConnected) target.focus({ preventScroll: true });
		else if (self.opener instanceof HTMLElement) self.opener.focus({ preventScroll: true });
	},

	view({ attrs, children }) {
		if (attrs.compact) {
			return m(
				'.sheet.sheet--compact',
				{
					onclick: (event: MouseEvent) => {
						if (event.target === event.currentTarget) attrs.onClose();
					},
				},
				m(
					'.sheet__panel.sheet__panel--compact',
					{
						role: 'dialog',
						'aria-modal': 'true',
						'aria-labelledby': attrs.labelledBy,
						'data-testid': attrs.testId,
						'data-state': attrs.state,
					},
					[
						m('.sheet__body', children),
						m('footer.watch__footer', [
							attrs.footer,
							m(
								'button.btn.btn--secondary.watch__close',
								{ type: 'button', 'data-testid': 'watch-close', onclick: attrs.onClose },
								t('answer.watch_close'),
							),
						]),
					],
				),
			);
		}

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
