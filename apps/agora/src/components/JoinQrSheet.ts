import m from 'mithril';
import { t } from '../lib/i18n';
import { QRShare } from './QRShare';

/**
 * The lesson's door, held up on a phone: a big QR and the five digits.
 *
 * The lobby is the only screen that used to show the QR, so a classmate who
 * walked in after the teacher pressed "start" had to ask for the code out
 * loud. Any seated student — and the teacher, from the console's menu — can
 * now open this sheet at any stage and let the latecomer scan it.
 *
 * Props in, vnodes out: no session, no names, nothing a wall should not show.
 * Reuses the `.look-sheet` frame and its scrim; Escape is heard on the
 * document, as in VillageMoreSheet.
 */

export interface JoinQrSheetAttrs {
	/** The URL the QR encodes — `sessionJoinUrl`, so it opens the join route */
	url: string;
	code: string;
	onClose: () => void;
}

/** Pixels the QR is drawn at; CSS scales it down on a narrow phone */
const QR_SIZE = 320;

export const JoinQrSheet: m.Component<
	JoinQrSheetAttrs,
	{
		returnFocus: HTMLElement | null;
		onClose: () => void;
		onKey: (event: KeyboardEvent) => void;
	}
> = {
	oninit(vnode) {
		vnode.state.returnFocus =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		vnode.state.onClose = vnode.attrs.onClose;
		vnode.state.onKey = (event: KeyboardEvent): void => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			vnode.state.onClose();
			m.redraw();
		};
		document.addEventListener('keydown', vnode.state.onKey);
	},
	onbeforeupdate(vnode) {
		vnode.state.onClose = vnode.attrs.onClose;
	},
	onremove(vnode) {
		document.removeEventListener('keydown', vnode.state.onKey);
		queueMicrotask(() => {
			if (document.activeElement === document.body) vnode.state.returnFocus?.focus();
		});
	},
	view(vnode) {
		const { url, code, onClose } = vnode.attrs;

		return m(
			'.look-sheet.join-qr',
			{
				onclick: (event: MouseEvent) => {
					if (event.target === event.currentTarget) onClose();
				},
			},
			m(
				'.look-sheet__panel.join-qr__panel',
				{ role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'join-qr-title' },
				[
					m('.look-sheet__head', [
						m('h2.look-sheet__title#join-qr-title', t('invite.title')),
						m(
							'button.btn.btn--ghost.btn--sm',
							{
								type: 'button',
								'aria-label': t('invite.close'),
								oncreate: (node: m.VnodeDOM) => (node.dom as HTMLElement).focus(),
								onclick: onClose,
							},
							'✕',
						),
					]),
					m('p.join-qr__scan', t('invite.scan')),
					m('.join-qr__code-box', m(QRShare, { url, size: QR_SIZE })),
					m('p.join-qr__or', t('invite.or_code')),
					m('p.join-qr__digits', code),
				],
			),
		);
	},
};
