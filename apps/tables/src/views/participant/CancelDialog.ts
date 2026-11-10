import m from 'mithril';
import { t } from '@/lib/i18n';
import { Action } from '@/lib/action';
import { safeStorage } from '@/lib/safeStorage';
import { tablesApi } from '@/lib/tableAssignment/client';
import { clearDraft } from '@/logic/localDraft';
import { Modal } from '@/components/Modal';

export interface CancelDialogAttrs {
	sessionId: string;
	uid: string;
	onClose: () => void;
}

/** Confirm leaving. Staying is the first, focused button; the record's removal flips the screen. */
export const CancelDialog: m.ClosureComponent<CancelDialogAttrs> = () => {
	const cancel = new Action(
		'tables.participant.cancelRegistration',
		'tableAssignment.error.registrationClosed',
	);

	async function confirm({ sessionId, uid }: CancelDialogAttrs): Promise<void> {
		const result = await cancel.run(() => tablesApi.cancelRegistration({ sessionId }), {
			sessionId,
		});

		if (result) clearDraft(sessionId, uid, safeStorage);
	}

	return {
		view({ attrs }) {
			return m(
				Modal,
				{ title: t('tableAssignment.cancel.title'), locked: cancel.busy, onClose: attrs.onClose },
				[
					m('p.modal__text', t('tableAssignment.cancel.body')),
					cancel.errorKey
						? m('p.notice.notice--error', { role: 'alert' }, t(cancel.errorKey))
						: null,
					m(
						'button.btn.btn--primary.btn--cta',
						{ type: 'button', disabled: cancel.busy, onclick: attrs.onClose },
						t('tableAssignment.cancel.stay'),
					),
					m(
						'button.btn.btn--outline.btn--cta',
						{ type: 'button', disabled: cancel.busy, onclick: () => void confirm(attrs) },
						t(cancel.busy ? 'tableAssignment.saving' : 'tableAssignment.cancel.confirm'),
					),
				],
			);
		},
	};
};
