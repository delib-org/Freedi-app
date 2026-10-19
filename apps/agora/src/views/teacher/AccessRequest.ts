import m from 'mithril';
import { t } from '../../lib/i18n';
import { getUserState, signInWithGoogle } from '../../lib/user';
import {
	accessState,
	getAccessStore,
	loadAccess,
	submitAccessRequest,
	takeAccessFlash,
} from '../../lib/access';
import {
	buildSubmitRequest,
	currentRequestOf,
	submitOutcomeOf,
	validateAccessForm,
	type AccessFormErrorKey,
	type AccessFormField,
	type AccessFormValue,
} from '../../lib/accessLogic';
import { AGORA_ACCESS } from '@freedi/shared-types';
import type { AgoraAccessRole } from '@freedi/shared-types';
import { AccessPanel } from '../../components/AccessPanel';
import { LanguagePicker } from '../../components/LanguagePicker';
import { SignOutLink } from '../../components/SignOutLink';

/**
 * /teach/request — ask to be a teacher (or a regional coordinator). The school
 * comes from the school's own sign-up link (`?school=<id>`); without one the
 * teacher types the school's name and city and the system admins place them.
 * The same address shows where the request stands once it is sent, and sends
 * an approved teacher on to /teach.
 */
export function AccessRequest(): m.Component {
	const schoolId = (m.route.param('school') as string | undefined)?.trim() || undefined;
	const flash = takeAccessFlash();
	const form: AccessFormValue = {
		role: 'teacher',
		fullName: '',
		...(schoolId ? { schoolId } : {}),
		schoolNameText: '',
		city: '',
		note: '',
	};
	let seededName = false;
	let touched = false;
	let submitting = false;
	let submitError: string | null = null;
	let signInFailed = false;

	function role(next: AgoraAccessRole): void {
		form.role = next;
	}

	async function submit(uid: string): Promise<void> {
		touched = true;
		submitError = null;
		if (submitting || Object.keys(validateAccessForm(form)).length > 0) return;
		submitting = true;
		m.redraw();
		try {
			await submitAccessRequest(buildSubmitRequest(form));
			await loadAccess(uid, true);
		} catch (error) {
			console.error('[Access] Sending the access request failed:', error);
			const outcome = submitOutcomeOf(error);
			if (outcome.kind === 'status') await loadAccess(uid, true);
			else submitError = outcome.key;
		}
		submitting = false;
		m.redraw();
	}

	function field(
		name: AccessFormField,
		label: string,
		errors: Partial<Record<AccessFormField, AccessFormErrorKey>>,
		attrs: { maxlength: number; multiline?: boolean; autocomplete?: string },
	): m.Children {
		const id = `access-${name}`;
		const error = touched ? errors[name] : undefined;
		const control = attrs.multiline ? 'textarea' : 'input[type=text]';

		return m('.access-form__field', [
			m('label.access-form__label', { for: id }, label),
			m(`${control}.access-form__input`, {
				id,
				value: form[name],
				maxlength: attrs.maxlength,
				autocomplete: attrs.autocomplete,
				rows: attrs.multiline ? 3 : undefined,
				disabled: submitting,
				'aria-invalid': error ? 'true' : 'false',
				'aria-describedby': error ? `${id}-error` : undefined,
				oninput: (event: InputEvent) => {
					form[name] = (event.target as HTMLInputElement).value;
				},
			}),
			error ? m('p.access-form__error', { id: `${id}-error`, role: 'alert' }, t(error)) : null,
		]);
	}

	function roleChoice(): m.Children {
		// A sign-up link is a teacher's door; the choice exists only without one
		if (schoolId) return null;

		return m('fieldset.access-form__field', [
			m('legend.access-form__label', t('access.role')),
			(['teacher', 'supervisor'] as const).map((value) =>
				m('label.access-form__choice', { key: value }, [
					m('input[type=radio][name=access-role]', {
						value,
						checked: form.role === value,
						disabled: submitting,
						onchange: () => role(value),
					}),
					m('span', t(value === 'teacher' ? 'access.role_teacher' : 'role.coordinator')),
				]),
			),
		]);
	}

	function formView(uid: string): m.Children {
		const errors = validateAccessForm(form);
		const declined = currentRequestOf(getAccessStore().requests);
		const needsSchool = form.role === 'teacher' && !schoolId;

		return m(
			'form.access-form',
			{
				novalidate: true,
				onsubmit: (event: Event) => {
					event.preventDefault();
					void submit(uid);
				},
			},
			[
				declined?.status === 'declined'
					? m('p.access-flash', [
							t('access.declined_text'),
							declined.declineReason
								? ` ${t('access.declined_reason', { reason: declined.declineReason })}`
								: '',
						])
					: null,
				m('p.access-form__hint', t(schoolId ? 'access.to_school' : 'access.to_admin')),
				field('fullName', t('access.full_name'), errors, {
					maxlength: AGORA_ACCESS.MAX_NAME_LENGTH,
					autocomplete: 'name',
				}),
				roleChoice(),
				needsSchool
					? [
							field('schoolNameText', t('access.school_name'), errors, {
								maxlength: AGORA_ACCESS.MAX_SCHOOL_TEXT_LENGTH,
							}),
							field('city', t('access.city'), errors, {
								maxlength: AGORA_ACCESS.MAX_CITY_LENGTH,
							}),
						]
					: null,
				field('note', t('access.note'), errors, {
					maxlength: AGORA_ACCESS.MAX_NOTE_LENGTH,
					multiline: true,
				}),
				submitError ? m('p.access-form__error', { role: 'alert' }, t(submitError)) : null,
				m(
					'button.btn.btn--primary.access-form__submit',
					{ type: 'submit', disabled: submitting },
					t(submitting ? 'access.submitting' : 'access.submit'),
				),
			],
		);
	}

	function shell(children: m.Children, withAccount = true): m.Children {
		return m('.shell', [
			m('.shell__content.access-page', [
				m('.sec-head', [m('h2.sec-head__title', t('access.title')), m(LanguagePicker)]),
				withAccount ? m(SignOutLink) : null,
				children,
				m(
					'button.btn.btn--ghost',
					{ type: 'button', onclick: () => m.route.set('/teach') },
					t('common.back'),
				),
			]),
		]);
	}

	function signInView(): m.Children {
		return shell(
			[
				m.route.param('signedOut') === '1'
					? m('p.access-flash', { role: 'status' }, t('teacher.signed_out'))
					: null,
				m('p.access-panel__text', t('teacher.sign_in_required')),
				signInFailed
					? m('p.access-panel__error', { role: 'alert' }, t('teacher.sign_in_failed'))
					: null,
				m(
					'button.btn.btn--primary',
					{
						type: 'button',
						onclick: () => {
							signInFailed = false;
							signInWithGoogle().catch((error: unknown) => {
								console.error('[Access] Sign-in failed:', error);
								signInFailed = true;
								m.redraw();
							});
						},
					},
					t('home.sign_in'),
				),
			],
			false,
		);
	}

	return {
		view() {
			const { tier, loading, user } = getUserState();
			if (loading) {
				return m(
					'.shell',
					m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				);
			}
			if (tier !== 2 || !user) return signInView();

			void loadAccess(user.uid);
			if (!seededName) {
				seededName = true;
				form.fullName = user.displayName ?? '';
			}
			const store = getAccessStore();
			if (!store.loaded) {
				return m(
					'.shell',
					m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				);
			}

			const state = accessState();
			if (state === 'approved') {
				m.route.set('/teach', undefined, { replace: true });

				return null;
			}
			if (store.failed) {
				return shell([
					m('p.access-panel__error', { role: 'alert' }, t('access.status_error')),
					m(
						'button.btn.btn--secondary',
						{ type: 'button', onclick: () => void loadAccess(user.uid, true) },
						t('access.retry'),
					),
				]);
			}

			return shell([
				flash ? m('p.access-flash', { role: 'status' }, t(flash)) : null,
				state === 'pending'
					? m(AccessPanel, { state: 'pending', uid: user.uid })
					: formView(user.uid),
			]);
		},
	};
}
