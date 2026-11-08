import m from 'mithril';
import { ClassForm, type ClassFormValue } from '../../../components/ClassForm';
import { teacherClass } from '../../../lib/callables';
import { t } from '../../../lib/i18n';
import { classLabel, fetchTeacherClass, type TeacherClassDetail } from '../../../lib/teacher';

export interface ClassSettingsAttrs {
	classId: string;
	detail: TeacherClassDetail;
	/** The class as the server now has it, after a rename or a co-teacher change */
	onDetail: (detail: TeacherClassDetail) => void;
	onClose: () => void;
}

/**
 * Behind the cog on the class page: the class code (to read out and to copy),
 * the name, the teachers, archive. The page itself is the class's
 * achievements, students and lessons; settings are not.
 */
export function ClassSettings(): m.Component<ClassSettingsAttrs> {
	let renaming = false;
	let saving = false;
	let error: string | null = null;
	/** Archive asks twice — the second press is the one that counts */
	let archiveArmed = false;
	let coTeacherEmail = '';
	let addingTeacher = false;
	let teacherError: string | null = null;
	let removingUid: string | null = null;
	let codeCopied = false;

	function copyClassCode(code: string): void {
		void navigator.clipboard?.writeText(code).then(() => {
			codeCopied = true;
			m.redraw();
			window.setTimeout(() => {
				codeCopied = false;
				m.redraw();
			}, 1600);
		});
	}

	async function rename(attrs: ClassSettingsAttrs, value: ClassFormValue): Promise<void> {
		if (saving) return;
		saving = true;
		error = null;
		m.redraw();
		try {
			await teacherClass({
				classId: attrs.classId,
				action: 'rename',
				name: value.name,
				...(value.gradeLevel !== undefined ? { gradeLevel: value.gradeLevel } : {}),
			});
			const fresh = await fetchTeacherClass(attrs.classId);
			if (fresh) attrs.onDetail(fresh);
			renaming = false;
		} catch (caught) {
			console.error('[Teacher] Renaming the class failed:', caught);
			error = t('classForm.error');
		}
		saving = false;
		m.redraw();
	}

	async function archive(attrs: ClassSettingsAttrs): Promise<void> {
		if (saving) return;
		if (!archiveArmed) {
			archiveArmed = true;

			return;
		}
		saving = true;
		error = null;
		m.redraw();
		try {
			await teacherClass({ classId: attrs.classId, action: 'archive' });
			m.route.set('/teach');

			return;
		} catch (caught) {
			console.error('[Teacher] Archiving the class failed:', caught);
			error = t('classForm.error');
		}
		saving = false;
		archiveArmed = false;
		m.redraw();
	}

	async function addTeacher(attrs: ClassSettingsAttrs): Promise<void> {
		const email = coTeacherEmail.trim().toLowerCase();
		if (addingTeacher || !email) return;
		addingTeacher = true;
		teacherError = null;
		m.redraw();
		try {
			await teacherClass({ classId: attrs.classId, action: 'addTeacher', teacherEmail: email });
			const fresh = await fetchTeacherClass(attrs.classId);
			if (fresh) attrs.onDetail(fresh);
			coTeacherEmail = '';
		} catch (caught) {
			console.error('[Teacher] Adding a co-teacher failed:', caught);
			teacherError = t('classForm.error_no_account');
		}
		addingTeacher = false;
		m.redraw();
	}

	async function removeTeacher(attrs: ClassSettingsAttrs, teacherUid: string): Promise<void> {
		if (removingUid) return;
		removingUid = teacherUid;
		teacherError = null;
		m.redraw();
		try {
			await teacherClass({ classId: attrs.classId, action: 'removeTeacher', teacherUid });
			const fresh = await fetchTeacherClass(attrs.classId);
			if (fresh) attrs.onDetail(fresh);
		} catch (caught) {
			console.error('[Teacher] Removing a co-teacher failed:', caught);
			teacherError = t('classForm.error');
		}
		removingUid = null;
		m.redraw();
	}

	return {
		view({ attrs }) {
			const current = attrs.detail;
			const lastTeacher = current.teachers.length <= 1;

			return m('section.card.stack.teacher-settings', { 'aria-label': t('teach.class_settings') }, [
				m('.class-progress__head', [
					m('h2.teacher__section-title', t('roster.settings')),
					m(
						'button.btn.btn--sm.btn--ghost',
						{
							type: 'button',
							onclick: () => {
								renaming = false;
								archiveArmed = false;
								attrs.onClose();
							},
						},
						t('teacher.settings_close'),
					),
				]),

				m('.stack.teacher-settings__section', [
					m(
						'p.home-explanation.home-explanation--start',
						t('roster.class_code', { code: '' }).trim(),
					),
					m('.roster__code-row', [
						m('.teacher__code', current.classCode),
						m(
							'button.btn.btn--secondary.btn--sm',
							{ type: 'button', onclick: () => copyClassCode(current.classCode) },
							t(codeCopied ? 'roster.code_copied' : 'roster.copy_code'),
						),
					]),
				]),

				m('.stack.teacher-settings__section', [
					m('p.teacher-settings__label', t('roster.rename')),
					renaming
						? m(ClassForm, {
								initial: { gradeLevel: current.gradeLevel, name: current.name },
								submitLabel: t('classForm.save'),
								busyLabel: t('teacher.creating'),
								busy: saving,
								error,
								onSubmit: (value) => void rename(attrs, value),
								onCancel: () => {
									renaming = false;
								},
							})
						: m('.teacher__mode-row', [
								m('span.roster__setting-value', classLabel(current)),
								m(
									'button.btn.btn--sm.btn--secondary',
									{
										type: 'button',
										onclick: () => {
											renaming = true;
										},
									},
									t('roster.rename'),
								),
							]),
				]),

				m('.stack.teacher-settings__section', [
					m('p.teacher-settings__label', t('roster.teachers')),
					m(
						'ul.roster__teachers',
						{ role: 'list' },
						current.teachers.map((teacher) =>
							m('li.roster__teacher', { key: teacher.uid }, [
								m('span', teacher.name),
								m(
									'button.btn.btn--sm.btn--ghost',
									{
										type: 'button',
										disabled: lastTeacher || removingUid !== null,
										title: lastTeacher ? t('roster.last_teacher') : undefined,
										onclick: () => void removeTeacher(attrs, teacher.uid),
									},
									t('roster.remove_teacher'),
								),
							]),
						),
					),
					m(
						'form.roster__add-teacher',
						{
							onsubmit: (event: Event) => {
								event.preventDefault();
								void addTeacher(attrs);
							},
						},
						[
							m('input.plan-editor__text[type=email]', {
								value: coTeacherEmail,
								placeholder: t('roster.teacher_email'),
								'aria-label': t('roster.teacher_email'),
								disabled: addingTeacher,
								oninput: (event: InputEvent) => {
									coTeacherEmail = (event.target as HTMLInputElement).value;
								},
							}),
							m(
								'button.btn.btn--secondary',
								{ type: 'submit', disabled: addingTeacher || !coTeacherEmail.trim() },
								addingTeacher ? t('teacher.creating') : t('roster.add_teacher'),
							),
						],
					),
					teacherError ? m('p.join__error', teacherError) : null,
				]),

				m('.stack.teacher-settings__section', [
					m('p.teacher-settings__label', t('roster.archive')),
					m('p.home-explanation', t('roster.archive_confirm')),
					m('.teacher__mode-row', [
						m(
							'button.btn.btn--sm',
							{
								type: 'button',
								class: archiveArmed ? 'btn--primary' : 'btn--secondary',
								disabled: saving,
								onclick: () => void archive(attrs),
							},
							archiveArmed ? t('roster.archive_now') : t('roster.archive'),
						),
						archiveArmed
							? m(
									'button.btn.btn--sm.btn--ghost',
									{
										type: 'button',
										onclick: () => {
											archiveArmed = false;
										},
									},
									t('common.cancel'),
								)
							: null,
					]),
					error && !renaming ? m('p.join__error', error) : null,
				]),
			]);
		},
	};
}
