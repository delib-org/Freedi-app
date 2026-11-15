import m from 'mithril';
import { TABLE_ASSIGNMENT_TITLE_MAX_LENGTH } from '@freedi/shared-types';
import type { TableAssignment, TableAssignmentTopic } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { Action } from '@/lib/action';
import { tablesApi } from '@/lib/tableAssignment/client';
import { Modal } from '@/components/Modal';
import {
	canFixRegistration,
	fixDetailsDraft,
	fixDetailsProblem,
	fixDetailsRequest,
} from '@/logic/fixDetails';
import type { SetupDraft } from '@/logic/setupDraft';
import { FixDetailsRegistration } from '@/views/host/FixDetailsRegistration';
import { SetupEvent } from '@/views/host/SetupEvent';

export interface FixDetailsDialogAttrs {
	session: TableAssignment;
	topics: readonly TableAssignmentTopic[];
	onClose: () => void;
}

/**
 * "Fix details": the name, topic titles and event at any stage; while registration is open also
 * table size, expected people, return by name and the question's wording. Never the topics
 * themselves, the question's ends or anyone's answers, so choices and seats are untouched.
 */
export const FixDetailsDialog: m.ClosureComponent<FixDetailsDialogAttrs> = ({ attrs: first }) => {
	const save = new Action('tables.host.fixDetails', 'tableAssignment.error.generic');
	const sessionId = first.session.tableAssignmentId;
	const draft = fixDetailsDraft(first.session, first.topics);
	const { setup, topics: fields } = draft;

	function change(patch: Partial<SetupDraft>): void {
		Object.assign(setup, patch);
	}

	async function submit(attrs: FixDetailsDialogAttrs): Promise<void> {
		const request = fixDetailsRequest(attrs.session, draft);

		if (!request) return;

		const saved = await save.run(() => tablesApi.fixDetails(request), { sessionId });

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
			const problem = fixDetailsProblem(attrs.session, draft);
			const atOpen = canFixRegistration(attrs.session);

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
							fieldInput(setup.title, (text) => (setup.title = text), {}),
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
						m(SetupEvent, { draft: setup, onChange: change }),
						atOpen
							? m(FixDetailsRegistration, {
									session: attrs.session,
									draft: setup,
									disabled: save.busy,
									onChange: change,
								})
							: m('p.modal__text', t('tableAssignment.fixDetails.open.locked')),
						m('p.modal__text', t('tableAssignment.fixDetails.note')),
						problem && problem !== 'name' && problem !== 'topics'
							? m(
									'p.notice.notice--error',
									{ role: 'alert' },
									t(`tableAssignment.setup.problem.${problem}`),
								)
							: null,
						save.errorKey ? m('p.notice.notice--error', { role: 'alert' }, t(save.errorKey)) : null,
						m('.fix-details__actions', [
							m(
								'button.btn.btn--primary',
								{ type: 'submit', disabled: save.busy || problem !== null },
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
