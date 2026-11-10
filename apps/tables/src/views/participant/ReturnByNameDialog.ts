import m from 'mithril';
import type { TablesNameMatch } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { Modal } from '@/components/Modal';

export interface ReturnByNameDialogAttrs {
	name: string;
	busy: boolean;
	errorKey: string | null;
	onAnswer: (nameMatch: Extract<TablesNameMatch, 'claim' | 'separate'>) => void;
	onClose: () => void;
}

/** "Is this you?": yes starts over with empty answers, no is a new registration. */
export const ReturnByNameDialog: m.Component<ReturnByNameDialogAttrs> = {
	view({ attrs }) {
		return m(
			Modal,
			{
				title: t('tableAssignment.returnByName.title', { name: attrs.name }),
				locked: attrs.busy,
				onClose: attrs.onClose,
			},
			[
				m('p.modal__text', t('tableAssignment.returnByName.body')),
				attrs.errorKey ? m('p.notice.notice--error', { role: 'alert' }, t(attrs.errorKey)) : null,
				m(
					'button.btn.btn--primary.btn--cta',
					{ type: 'button', disabled: attrs.busy, onclick: () => attrs.onAnswer('claim') },
					t('tableAssignment.returnByName.yes'),
				),
				m(
					'button.btn.btn--outline.btn--cta',
					{ type: 'button', disabled: attrs.busy, onclick: () => attrs.onAnswer('separate') },
					t('tableAssignment.returnByName.no'),
				),
			],
		);
	},
};
