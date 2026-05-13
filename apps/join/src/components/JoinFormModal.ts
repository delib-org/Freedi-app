import m from 'mithril';
import { translate } from '@/lib/i18n';
import type { JoinFormConfig, JoinFormField } from '@freedi/shared-types';
import {
	saveJoinFormSubmission,
	toggleJoining,
	getCreator,
	getCachedJoinFormSubmissionData,
	getJoinFormSubmissionData,
	getOptionById,
	JoinRole,
} from '@/lib/store';

interface JoinFormModalAttrs {
	joinForm: JoinFormConfig;
	questionId: string;
	optionId: string;
	role: JoinRole;
	onClose: () => void;
}

let formValues: Record<string, string> = {};
let submitting = false;

/** Pick the field we'll treat as the user's display name — either the field
 *  whose id is exactly "name", or (failing that) the first text field. */
function findNameField(fields: JoinFormField[]): JoinFormField | undefined {
	return fields.find((f) => f.id === 'name') ?? fields.find((f) => f.type === 'text');
}

function getNameValue(fields: JoinFormField[]): string {
	const nameField = findNameField(fields);
	if (!nameField) return '';

	return (formValues[nameField.id] || '').trim();
}

/** Copy saved submission values into the module-level formValues, matched by
 *  field id. If the stored displayName is non-empty and the name field is
 *  empty/missing from values, fall back to displayName. */
function applySubmissionValues(
	fields: JoinFormField[],
	values: Record<string, string>,
	displayName: string,
): void {
	for (const field of fields) {
		const saved = values[field.id];
		if (saved !== undefined && saved !== '') {
			formValues[field.id] = saved;
		}
	}
	const nameField = findNameField(fields);
	if (nameField && !formValues[nameField.id] && displayName) {
		formValues[nameField.id] = displayName;
	}
}

export const JoinFormModal: m.Component<JoinFormModalAttrs> = {
	oninit(vnode) {
		formValues = {};
		submitting = false;

		const fields = vnode.attrs.joinForm.fields ?? [];
		for (const field of fields) {
			formValues[field.id] = '';
		}

		const creator = getCreator();
		if (!creator) return;

		const { questionId } = vnode.attrs;

		// Hydrate from the user's prior submission so fields don't start blank on
		// repeat visits. Use the synchronous cache first (instant UX), then kick
		// off a background fetch to correct anything stale.
		const cached = getCachedJoinFormSubmissionData(questionId, creator.uid);
		if (cached) {
			applySubmissionValues(fields, cached.values, cached.displayName);
		}

		getJoinFormSubmissionData(questionId, creator.uid)
			.then((latest) => {
				if (!latest) return;
				applySubmissionValues(fields, latest.values, latest.displayName);
				m.redraw();
			})
			.catch(() => {
				/* ignore — form stays blank, user can type */
			});
	},

	view(vnode) {
		const { joinForm, questionId, optionId, role, onClose } = vnode.attrs;
		const fields = joinForm.fields ?? [];
		const canSubmit = !submitting && getNameValue(fields).length > 0;
		// Render the modal chrome in the language the admin saved the form in —
		// otherwise the title/buttons can drift from the stored field labels.
		const formLang = joinForm.formLanguage;
		const tf = (key: string) => translate(key, formLang);

		return m(
			'.modal__overlay',
			{
				onclick: (e: Event) => {
					if (e.target === e.currentTarget) onClose();
				},
			},
			[
				m('.modal__body', [
					m('h2.modal__title', tf('form.title')),

					fields.map((field) =>
						m('.modal__field', { key: field.id }, [
							m(
								'label.modal__label',
								{ for: `join-${field.id}` },
								`${field.label}${field.required ? ' *' : ''}`,
							),
							m('input.modal__input', {
								id: `join-${field.id}`,
								type: field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text',
								value: formValues[field.id] || '',
								required: field.required,
								oninput: (e: InputEvent) => {
									formValues[field.id] = (e.target as HTMLInputElement).value;
								},
							}),
						]),
					),

					m('.modal__actions', [
						m('button.btn.btn--secondary.btn--small', { onclick: onClose }, tf('form.cancel')),
						m(
							'button.btn.btn--primary.btn--small',
							{
								disabled: !canSubmit,
								onclick: () => handleSubmit(questionId, optionId, role, fields, onClose),
							},
							submitting ? tf('form.submitting') : tf('form.submit'),
						),
					]),
				]),
			],
		);
	},
};

async function handleSubmit(
	questionId: string,
	optionId: string,
	role: JoinRole,
	fields: JoinFormField[],
	onClose: () => void,
): Promise<void> {
	const creator = getCreator();
	const displayName = getNameValue(fields);
	if (!creator || !displayName) return;

	submitting = true;
	m.redraw();

	try {
		const option = getOptionById(optionId);
		const optionTitle = option?.statement ?? '';
		await saveJoinFormSubmission(
			questionId,
			creator.uid,
			displayName,
			formValues,
			role,
			optionId,
			optionTitle,
		);
		await toggleJoining(optionId, questionId, role);
		onClose();
	} catch (err) {
		console.error('[JoinForm] Submission failed:', err);
	} finally {
		submitting = false;
		m.redraw();
	}
}
