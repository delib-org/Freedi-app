import m from 'mithril';
import { AGORA_LIMITS, type AgoraRoundKind } from '@freedi/shared-types';
import { t } from '../lib/i18n';
import { Icon } from './Icon';
import { stalledBanner } from './StalledBanner';

export interface RoundAnswerAttrs {
	kind: AgoraRoundKind;
	text: string;
	savedText?: string;
	editing: boolean;
	saving: boolean;
	saveFailed: boolean;
	changed: boolean;
	onEdit: () => void;
	onCancel: () => void;
	onInput: (text: string) => void;
	onSave: () => void;
}

/** Confirmed words are a reading card; the editor opens only when requested. */
export const RoundAnswer: m.Component<RoundAnswerAttrs> = {
	view({ attrs }) {
		const { kind, text, savedText, editing, saving, saveFailed, changed } = attrs;
		if (savedText !== undefined && !editing && !saving && !saveFailed) {
			return m('.round__saved', [
				m('p.round__mine-text', savedText),
				m('.round__actions', [
					m('span.round__saved-status', { role: 'status' }, [
						m(Icon, { name: 'check', size: 18 }),
						t('round.saved'),
					]),
					m(
						'button.btn.btn--secondary.btn--sm',
						{
							type: 'button',
							onclick: attrs.onEdit,
						},
						t('delib.edit_text'),
					),
				]),
			]);
		}

		return m('.round__editor', [
			kind === 'needs' ? m('p.round__lead', t('round.needs.lead')) : null,
			m('textarea.round__textarea', {
				value: text,
				rows: 4,
				maxlength: AGORA_LIMITS.MAX_PROPOSAL_LENGTH,
				placeholder: t(`round.${kind}.placeholder`),
				'aria-label': kind === 'needs' ? t('round.needs.lead') : t('round.your_text'),
				disabled: saving,
				oncreate: editing
					? (vnode: m.VnodeDOM) => (vnode.dom as HTMLTextAreaElement).focus()
					: undefined,
				oninput: (event: InputEvent) => attrs.onInput((event.target as HTMLTextAreaElement).value),
			}),
			stalledBanner(),
			saveFailed ? m('p.join__error', { role: 'alert' }, t('common.error')) : null,
			m('.round__actions', [
				m(
					'button.btn.btn--primary',
					{
						type: 'button',
						disabled:
							saving || !text.trim() || (savedText !== undefined && !changed && !saveFailed),
						onclick: attrs.onSave,
					},
					saving ? t('round.saving') : t(savedText === undefined ? 'round.save' : 'round.update'),
				),
				savedText !== undefined
					? m(
							'button.btn.btn--ghost',
							{
								type: 'button',
								disabled: saving,
								onclick: attrs.onCancel,
							},
							t('common.cancel'),
						)
					: null,
			]),
		]);
	},
};
