import m from 'mithril';
import { t } from '@/lib/i18n';

/**
 * One confirm for the console's "going back" and "reset" actions (IA 18):
 * a native <dialog>, so focus is trapped, Escape cancels and focus returns to
 * the control that opened it. Cancel has the focus; the confirming button is
 * secondary (a reset) or destructive-outline, never primary: primary belongs
 * to the rail's forward control.
 */

export interface ConfirmRequest {
	title: string;
	/** The line under the title ("everything is kept" / "this cannot be undone"). */
	body: string;
	yesLabel: string;
	/** True for a reset: the confirming button looks destructive. */
	destructive: boolean;
	run: () => void;
}

let request: ConfirmRequest | null = null;

export function askConfirm(next: ConfirmRequest): void {
	request = next;
	m.redraw();
}

function close(): void {
	request = null;
	m.redraw();
}

function confirmYes(): void {
	const current = request;
	request = null;
	m.redraw();
	current?.run();
}

function sync(dom: HTMLDialogElement): void {
	if (request && !dom.open) dom.showModal();
	else if (!request && dom.open) dom.close();
}

function contents(current: ConfirmRequest): m.Children {
	return [
		m('h2.confirm-dialog__title#confirm-dialog-title', current.title),
		m('p.confirm-dialog__body', current.body),
		m('div.confirm-dialog__actions', [
			m(
				'button.btn.btn--secondary.confirm-dialog__cancel',
				{ type: 'button', autofocus: true, onclick: close },
				t('common.cancel'),
			),
			m(
				'button.btn.confirm-dialog__yes',
				{
					type: 'button',
					'data-testid': 'console-confirm-yes',
					class: current.destructive ? 'btn--danger-outline' : 'btn--secondary',
					onclick: confirmYes,
				},
				current.yesLabel,
			),
		]),
	];
}

export const ConfirmDialog: m.Component = {
	oncreate(vnode) {
		sync(vnode.dom as HTMLDialogElement);
	},
	onupdate(vnode) {
		sync(vnode.dom as HTMLDialogElement);
	},
	view() {
		return m(
			'dialog.confirm-dialog',
			{
				'aria-labelledby': 'confirm-dialog-title',
				oncancel: (event: Event) => {
					event.preventDefault();
					close();
				},
				onclose: () => {
					if (request) close();
				},
			},
			request ? contents(request) : null,
		);
	},
};
