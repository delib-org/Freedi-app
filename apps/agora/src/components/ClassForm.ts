import m from 'mithril';
import { t } from '../lib/i18n';
import { AGORA_GRADES } from '../lib/teacher';
import { AGORA_CLASSROOM } from '@freedi/shared-types';

/** What the form hands back: the grade as picked (a number, or free text), the label */
export interface ClassFormValue {
	gradeLevel: string;
	name: string;
	schoolId?: string;
}

export interface ClassFormAttrs {
	/** Pre-filled for a rename; empty for a new class */
	initial?: { gradeLevel?: string; name: string };
	/** Offered only when the teacher belongs to more than one school */
	schools?: ReadonlyArray<{ schoolId: string; name: string }>;
	submitLabel: string;
	busyLabel: string;
	busy: boolean;
	/** A message to print under the form, when the last submit failed */
	error?: string | null;
	onSubmit: (value: ClassFormValue) => void;
	onCancel?: () => void;
}

const OTHER = 'other';

/**
 * The grade + label of a class — the one form behind "new class", the
 * dashboard's add card, and the class page's rename. Props in, vnodes out;
 * the caller talks to the server.
 */
export function ClassForm(): m.Component<ClassFormAttrs> {
	let grade = '';
	let otherGrade = '';
	let name = '';
	let schoolId = '';
	let seeded = false;

	return {
		view(vnode) {
			const { initial, schools, submitLabel, busyLabel, busy, error, onSubmit, onCancel } =
				vnode.attrs;
			if (!seeded) {
				seeded = true;
				const given = (initial?.gradeLevel ?? '').trim();
				if (given && AGORA_GRADES.includes(given)) grade = given;
				else if (given) {
					grade = OTHER;
					otherGrade = given;
				}
				name = initial?.name ?? '';
				schoolId = schools?.[0]?.schoolId ?? '';
			}
			const gradeValue = grade === OTHER ? otherGrade.trim() : grade;
			const canSubmit =
				!busy &&
				name.trim().length > 0 &&
				name.trim().length <= AGORA_CLASSROOM.MAX_NAME_LENGTH &&
				(!schools || schools.length <= 1 || schoolId !== '');

			return m(
				'form.class-form',
				{
					onsubmit: (event: Event) => {
						event.preventDefault();
						if (!canSubmit) return;
						onSubmit({
							gradeLevel: gradeValue,
							name: name.trim(),
							...(schools && schools.length > 1 ? { schoolId } : {}),
						});
					},
				},
				[
					m('.class-form__row', [
						m('label.plan-editor__field.class-form__grade', [
							m('span.teacher__section-title', t('classForm.grade')),
							m(
								'select.plan-editor__text',
								{
									value: grade,
									disabled: busy,
									onchange: (event: Event) => {
										grade = (event.target as HTMLSelectElement).value;
									},
								},
								[
									m('option', { value: '' }, t('classForm.grade_none')),
									...AGORA_GRADES.map((value) =>
										m('option', { value, selected: grade === value }, t(`grade.g${value}`)),
									),
									m(
										'option',
										{ value: OTHER, selected: grade === OTHER },
										t('classForm.grade_other'),
									),
								],
							),
						]),
						grade === OTHER
							? m('label.plan-editor__field.class-form__grade', [
									m('span.teacher__section-title', t('classForm.grade_other')),
									m('input.plan-editor__text[type=text]', {
										value: otherGrade,
										maxlength: AGORA_CLASSROOM.MAX_NAME_LENGTH,
										disabled: busy,
										oninput: (event: InputEvent) => {
											otherGrade = (event.target as HTMLInputElement).value;
										},
									}),
								])
							: null,
						m('label.plan-editor__field.class-form__label', [
							m('span.teacher__section-title', t('classForm.label')),
							m('input.plan-editor__text[type=text]', {
								value: name,
								maxlength: AGORA_CLASSROOM.MAX_NAME_LENGTH,
								placeholder: t('classForm.label_placeholder'),
								disabled: busy,
								oninput: (event: InputEvent) => {
									name = (event.target as HTMLInputElement).value;
								},
							}),
						]),
					]),
					schools && schools.length > 1
						? m('label.plan-editor__field', [
								m('span.teacher__section-title', t('startGame.class_school')),
								m(
									'select.plan-editor__text',
									{
										value: schoolId,
										disabled: busy,
										onchange: (event: Event) => {
											schoolId = (event.target as HTMLSelectElement).value;
										},
									},
									schools.map((school) =>
										m(
											'option',
											{ value: school.schoolId, selected: schoolId === school.schoolId },
											school.name,
										),
									),
								),
							])
						: null,
					error ? m('p.join__error', error) : null,
					m('.teacher__mode-row', [
						m(
							'button.btn.btn--primary',
							{ type: 'submit', disabled: !canSubmit },
							busy ? busyLabel : submitLabel,
						),
						onCancel
							? m(
									'button.btn.btn--secondary',
									{ type: 'button', disabled: busy, onclick: onCancel },
									t('common.cancel'),
								)
							: null,
					]),
				],
			);
		},
	};
}
