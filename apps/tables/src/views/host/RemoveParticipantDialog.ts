import m from 'mithril';
import type { TableAssignmentRosterEntry } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { Action } from '@/lib/action';
import { tablesApi } from '@/lib/tableAssignment/client';
import { Modal } from '@/components/Modal';

export interface RemoveParticipantDialogAttrs {
	person: TableAssignmentRosterEntry;
	onClose: () => void;
}

/** Confirms taking a person off the list. A seat in a published assignment is refused by the server. */
export const RemoveParticipantDialog: m.ClosureComponent<RemoveParticipantDialogAttrs> = () => {
	const remove = new Action('tables.host.removeParticipant', 'tableAssignment.error.generic');

	async function confirm(attrs: RemoveParticipantDialogAttrs): Promise<void> {
		const { sessionId, uid } = attrs.person;
		const removed = await remove.run(() => tablesApi.removeParticipant({ sessionId, uid }), {
			sessionId,
			targetUid: uid,
		});

		if (removed) attrs.onClose();
	}

	return {
		view({ attrs }) {
			return m(
				Modal,
				{
					title: t('tableAssignment.remove.title', { name: attrs.person.fullName }),
					onClose: attrs.onClose,
					locked: remove.busy,
				},
				[
					m('p.modal__text', t('tableAssignment.remove.body')),
					remove.errorKey
						? m('p.notice.notice--error', { role: 'alert' }, t(remove.errorKey))
						: null,
					m(
						'button.btn.btn--primary.btn--cta',
						{ type: 'button', disabled: remove.busy, onclick: attrs.onClose },
						t('tableAssignment.remove.keep'),
					),
					m(
						'button.btn.btn--outline.btn--cta',
						{ type: 'button', disabled: remove.busy, onclick: () => void confirm(attrs) },
						t(remove.busy ? 'tableAssignment.saving' : 'tableAssignment.remove.confirm'),
					),
				],
			);
		},
	};
};
