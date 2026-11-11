import m from 'mithril';
import { t } from '@/lib/i18n';
import { DeleteAssignmentDialog } from '@/views/host/DeleteAssignmentDialog';

export interface DeleteAssignmentAttrs {
	sessionId: string;
}

/** The quiet "Delete this assignment" control at the foot of a host screen, with its confirm. */
export const DeleteAssignment: m.ClosureComponent<DeleteAssignmentAttrs> = () => {
	let confirming = false;

	return {
		view({ attrs }) {
			return m('footer.host-footer', [
				m(
					'button.btn.btn--text.host-footer__delete',
					{
						type: 'button',
						onclick: () => {
							confirming = true;
						},
					},
					t('tableAssignment.delete'),
				),
				confirming
					? m(DeleteAssignmentDialog, {
							sessionId: attrs.sessionId,
							onClose: () => {
								confirming = false;
							},
						})
					: null,
			]);
		},
	};
};
