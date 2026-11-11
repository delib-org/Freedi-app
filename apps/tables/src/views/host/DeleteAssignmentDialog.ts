import m from 'mithril';
import { t } from '@/lib/i18n';
import { Action } from '@/lib/action';
import { goTo } from '@/lib/navigate';
import { tablesApi } from '@/lib/tableAssignment/client';
import { Modal } from '@/components/Modal';
import { hostListPath } from '@/paths';

export interface DeleteAssignmentDialogAttrs {
	sessionId: string;
	onClose: () => void;
}

/**
 * Confirms deleting the whole assignment. It says plainly what goes and that it cannot be
 * undone; after it worked the host lands on the list, and a failure leaves the dialog usable.
 */
export const DeleteAssignmentDialog: m.ClosureComponent<DeleteAssignmentDialogAttrs> = () => {
	const remove = new Action('tables.host.deleteSession');

	async function confirm(attrs: DeleteAssignmentDialogAttrs): Promise<void> {
		const { sessionId } = attrs;
		const result = await remove.run(() => tablesApi.deleteSession({ sessionId }), { sessionId });

		if (result) goTo(hostListPath());
	}

	return {
		view({ attrs }) {
			return m(
				Modal,
				{ title: t('tableAssignment.delete.title'), onClose: attrs.onClose, locked: remove.busy },
				[
					m('p.modal__text', t('tableAssignment.delete.body')),
					remove.errorKey
						? m('p.notice.notice--error', { role: 'alert' }, t(remove.errorKey))
						: null,
					m(
						'button.btn.btn--primary.btn--cta',
						{ type: 'button', disabled: remove.busy, onclick: attrs.onClose },
						t('tableAssignment.delete.keep'),
					),
					m(
						'button.btn.btn--danger.btn--cta',
						{ type: 'button', disabled: remove.busy, onclick: () => void confirm(attrs) },
						t(remove.busy ? 'tableAssignment.saving' : 'tableAssignment.delete.confirm'),
					),
				],
			);
		},
	};
};
