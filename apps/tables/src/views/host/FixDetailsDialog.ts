import m from 'mithril';
import { TABLE_ASSIGNMENT_TITLE_MAX_LENGTH } from '@freedi/shared-types';
import type { TableAssignment, TableAssignmentTopic } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { Action } from '@/lib/action';
import { tablesApi } from '@/lib/tableAssignment/client';
import { Modal } from '@/components/Modal';

export interface FixDetailsDialogAttrs {
	session: TableAssignment;
	topics: readonly TableAssignmentTopic[];
	onClose: () => void;
}

interface TopicField {
	topicId: string;
	title: string;
}

function isFilled(text: string): boolean {
	return text.trim().length > 0;
}

/** "Fix details": the gathering name and topic titles only. Choices and seats are untouched. */
export const FixDetailsDialog: m.ClosureComponent<FixDetailsDialogAttrs> = ({ attrs: first }) => {
	const save = new Action('tables.host.fixDetails', 'tableAssignment.error.generic');
	const sessionId = first.session.tableAssignmentId;
	let title = first.session.title;
	const fields: TopicField[] = first.topics.map(({ topicId, title: topicTitle }) => ({
		topicId,
		title: topicTitle,
	}));

	async function submit(attrs: FixDetailsDialogAttrs): Promise<void> {
		const saved = await save.run(
			() =>
				tablesApi.fixDetails({
					sessionId,
					title: title.trim(),
					topics: fields.map((field) => ({ ...field, title: field.title.trim() })),
				}),
			{ sessionId },
		);

		if (saved) attrs.onClose();
	}

	function fieldInput(
		value: string,
		onInput: (text: string) => void,
		extra: Record<string, unknown>,
	): m.Vnode {
		return m('input.field__input', {
			type: 'text',
			dir: 'auto',
			value,
			required: true,
			maxlength: TABLE_ASSIGNMENT_TITLE_MAX_LENGTH,
			disabled: save.busy,
			oninput: (event: Event) => onInput((event.target as HTMLInputElement).value),
			...extra,
		});
	}

	return {
		view({ attrs }) {
			const complete = isFilled(title) && fields.every((field) => isFilled(field.title));

			return m(
				Modal,
				{
					title: t('tableAssignment.fixDetails'),
					onClose: attrs.onClose,
					locked: save.busy,
					closeLabel: t('tableAssignment.a11y.close'),
				},
				m(
					'form.fix-details',
					{
						onsubmit: (event: Event) => {
							event.preventDefault();
							void submit(attrs);
						},
					},
					[
						m('label.field', [
							m('span.field__label.field__label--small', t('tableAssignment.fixDetails.name')),
							fieldInput(title, (text) => (title = text), {}),
						]),
						m('.field', [
							m('span.field__label.field__label--small', t('tableAssignment.fixDetails.topics')),
							fields.map((field, index) =>
								fieldInput(
									field.title,
									(text) => {
										field.title = text;
									},
									{
										key: field.topicId,
										'aria-label': t('tableAssignment.setup.topic.label', { number: index + 1 }),
									},
								),
							),
						]),
						m('p.modal__text', t('tableAssignment.fixDetails.note')),
						save.errorKey ? m('p.notice.notice--error', { role: 'alert' }, t(save.errorKey)) : null,
						m('.fix-details__actions', [
							m(
								'button.btn.btn--primary',
								{ type: 'submit', disabled: save.busy || !complete },
								t(save.busy ? 'tableAssignment.saving' : 'tableAssignment.save'),
							),
							m(
								'button.btn.btn--outline',
								{ type: 'button', disabled: save.busy, onclick: attrs.onClose },
								t('tableAssignment.cancel'),
							),
						]),
					],
				),
			);
		},
	};
};
