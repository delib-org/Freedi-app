import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { toggleJoining, type JoinRole } from '@/lib/store';

interface LimitReachedModalAttrs {
	/** The option the user just clicked join on. */
	pendingOptionId: string;
	pendingOptionTitle: string;
	/** Question id (used for the underlying join transaction). */
	questionId: string;
	/** Always 'activist' in the current cap design — kept generic for future. */
	role: JoinRole;
	/** Options the user is already joined to under this question, in the same
	 *  role. The user picks one to release before joining the new one. */
	currentJoins: Statement[];
	maxJoinsPerUser: number;
	onClose: () => void;
	/** Fired after a successful swap so the parent view can clear pending state
	 *  and trigger any post-join side effects (toast, redraw). */
	onSwapped?: () => void;
}

let selectedReleaseId: string | null = null;
let submitting = false;

export const LimitReachedModal: m.Component<LimitReachedModalAttrs> = {
	oninit() {
		selectedReleaseId = null;
		submitting = false;
	},

	view(vnode) {
		const {
			pendingOptionId,
			pendingOptionTitle,
			questionId,
			role,
			currentJoins,
			maxJoinsPerUser,
			onClose,
			onSwapped,
		} = vnode.attrs;
		const canSubmit = selectedReleaseId !== null && !submitting;

		return m(
			'.modal__overlay',
			{
				role: 'dialog',
				'aria-modal': 'true',
				'aria-label': t('limitReached.title'),
				onclick: (e: Event) => {
					if (e.target === e.currentTarget) onClose();
				},
			},
			[
				m('.modal__body', [
					m('h2.modal__title', t('limitReached.title')),
					m(
						'p.modal__text',
						t('limitReached.message', {
							max: maxJoinsPerUser,
							option: pendingOptionTitle,
						}),
					),
					m(
						'.limit-reached__list',
						{ role: 'radiogroup', 'aria-label': t('limitReached.listAria') },
						currentJoins.map((option) =>
							m(
								'label.limit-reached__item',
								{
									key: option.statementId,
									class:
										selectedReleaseId === option.statementId
											? 'limit-reached__item--selected'
											: undefined,
								},
								[
									m('input.limit-reached__radio', {
										type: 'radio',
										name: 'limit-reached-release',
										value: option.statementId,
										checked: selectedReleaseId === option.statementId,
										onchange: () => {
											selectedReleaseId = option.statementId;
										},
									}),
									m('span.limit-reached__item-title', option.statement),
								],
							),
						),
					),
					m('.modal__actions', [
						m(
							'button.btn.btn--secondary.btn--small',
							{
								type: 'button',
								disabled: submitting ? true : undefined,
								onclick: onClose,
							},
							t('limitReached.cancel'),
						),
						m(
							'button.btn.btn--primary.btn--small',
							{
								type: 'button',
								disabled: !canSubmit,
								onclick: () =>
									handleConfirm({
										pendingOptionId,
										questionId,
										role,
										onClose,
										onSwapped,
									}),
							},
							submitting ? t('limitReached.submitting') : t('limitReached.confirm'),
						),
					]),
				]),
			],
		);
	},
};

async function handleConfirm(args: {
	pendingOptionId: string;
	questionId: string;
	role: JoinRole;
	onClose: () => void;
	onSwapped?: () => void;
}): Promise<void> {
	const { pendingOptionId, questionId, role, onClose, onSwapped } = args;
	if (!selectedReleaseId) return;

	submitting = true;
	m.redraw();

	try {
		const result = await toggleJoining(pendingOptionId, questionId, role, {
			releaseFromOptionId: selectedReleaseId,
		});
		if (!result.success) {
			console.error('[LimitReachedModal] swap failed:', result.error);
		}
		onSwapped?.();
		onClose();
	} catch (err) {
		console.error('[LimitReachedModal] swap threw:', err);
	} finally {
		submitting = false;
		m.redraw();
	}
}
