import m from 'mithril';
import {
	TABLE_ASSIGNMENT_DESCRIPTION_MAX_LENGTH,
	TABLE_ASSIGNMENT_TITLE_MAX_LENGTH,
} from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { validateDraft } from '@/logic/topics';
import type { TopicDraft } from '@/logic/topics';

/** The form of one topic: title, description, optional cap on tables. Props in, events out. */
export interface TopicEditorAttrs {
	draft: TopicDraft;
	/** True when the draft is a new topic, false when editing an existing one. */
	isNew: boolean;
	onChange: (draft: TopicDraft) => void;
	onSubmit: () => void;
	onCancel: () => void;
}

export const TopicEditor: m.Component<TopicEditorAttrs> = {
	view({ attrs }) {
		const { draft, onChange } = attrs;
		const error = validateDraft(draft);

		return m(
			'form.card.form',
			{
				onsubmit: (event: Event) => {
					event.preventDefault();
					if (!error) attrs.onSubmit();
				},
			},
			[
				m(
					'h2.card__title',
					t(attrs.isNew ? 'tableAssignment.topic.add' : 'tableAssignment.topic.edit'),
				),
				m('label.field', [
					m('span.field__label', t('tableAssignment.field.topicTitle')),
					m('input.field__input', {
						type: 'text',
						required: true,
						maxlength: TABLE_ASSIGNMENT_TITLE_MAX_LENGTH,
						value: draft.title,
						oninput: (event: Event) =>
							onChange({ ...draft, title: (event.target as HTMLInputElement).value }),
					}),
				]),
				m('label.field', [
					m('span.field__label', t('tableAssignment.field.description')),
					m('textarea.field__input', {
						rows: 4,
						maxlength: TABLE_ASSIGNMENT_DESCRIPTION_MAX_LENGTH,
						value: draft.description,
						oninput: (event: Event) =>
							onChange({ ...draft, description: (event.target as HTMLTextAreaElement).value }),
					}),
				]),
				m('label.field', [
					m('span.field__label', t('tableAssignment.field.maxTables')),
					m('input.field__input', {
						type: 'number',
						inputmode: 'numeric',
						min: 1,
						value: draft.maxTables,
						'aria-describedby': 'max-tables-hint',
						oninput: (event: Event) =>
							onChange({ ...draft, maxTables: (event.target as HTMLInputElement).value }),
					}),
					m(
						'small.field__hint',
						{ id: 'max-tables-hint' },
						t('tableAssignment.field.maxTables.hint'),
					),
				]),
				error && error !== 'titleRequired'
					? m(
							'p.notice.notice--error',
							{ role: 'alert' },
							t(`tableAssignment.topic.error.${error}`),
						)
					: null,
				m('.form__actions', [
					m(
						'button.btn.btn--primary',
						{ type: 'submit', disabled: !!error },
						t('tableAssignment.topic.keep'),
					),
					m(
						'button.btn.btn--ghost',
						{ type: 'button', onclick: attrs.onCancel },
						t('tableAssignment.cancel'),
					),
				]),
			],
		);
	},
};
