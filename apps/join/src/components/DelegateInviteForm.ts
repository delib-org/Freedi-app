import m from 'mithril';
import { t } from '@/lib/i18n';
import { createJoinDelegateInvite } from '@/lib/store';
import { showFacilitatorToast } from '@/lib/facilitatorToast';

interface DelegateInviteFormAttrs {
	questionId: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let email = '';
let canManageOrganizer = false;
let canManageParticipant = false;
let emailTouched = false;
let submitting = false;
let formError = '';

function reset(): void {
	email = '';
	canManageOrganizer = false;
	canManageParticipant = false;
	emailTouched = false;
	submitting = false;
	formError = '';
}

function buildSummary(): string | null {
	const trimmed = email.trim().toLowerCase();
	if (!trimmed) return null;
	if (!canManageOrganizer && !canManageParticipant) return null;

	const verbKey =
		canManageOrganizer && canManageParticipant
			? 'delegates.perm.summary.both'
			: canManageOrganizer
				? 'delegates.perm.summary.organizer'
				: 'delegates.perm.summary.participant';

	return t('delegates.perm.summary', { email: trimmed, verbList: t(verbKey) });
}

async function copyToClipboard(text: string): Promise<boolean> {
	if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);

			return true;
		} catch {
			/* fall through */
		}
	}

	return false;
}

async function handleSubmit(questionId: string): Promise<void> {
	if (submitting) return;

	const normalized = email.trim().toLowerCase();
	if (!normalized || !EMAIL_REGEX.test(normalized)) {
		emailTouched = true;
		m.redraw();

		return;
	}
	if (!canManageOrganizer && !canManageParticipant) {
		formError = t('delegates.form.permsRequired');
		m.redraw();

		return;
	}

	submitting = true;
	formError = '';
	m.redraw();

	try {
		const result = await createJoinDelegateInvite({
			questionId,
			email: normalized,
			canManageOrganizer,
			canManageParticipant,
		});

		const copied = await copyToClipboard(result.inviteLink);
		showFacilitatorToast(
			copied ? t('delegates.toast.linkAndEmailSent') : t('delegates.toast.copyFailed'),
		);
		reset();
	} catch (err) {
		console.error('[DelegateInviteForm] Failed to create invite:', err);
		formError = t('delegates.form.error');
	} finally {
		submitting = false;
		m.redraw();
	}
}

export const DelegateInviteForm: m.Component<DelegateInviteFormAttrs> = {
	oninit() {
		reset();
	},

	view({ attrs: { questionId } }) {
		const trimmedEmail = email.trim().toLowerCase();
		const emailIsInvalid = emailTouched && (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail));
		const canSubmit =
			!submitting &&
			!!trimmedEmail &&
			EMAIL_REGEX.test(trimmedEmail) &&
			(canManageOrganizer || canManageParticipant);
		const summary = buildSummary();

		return m('.delegates__form', { role: 'form' }, [
			m('.delegates__field', [
				m(
					'label.delegates__label',
					{ for: 'delegate-invite-email' },
					t('delegates.form.emailLabel'),
				),
				m('input.delegates__email', {
					id: 'delegate-invite-email',
					type: 'email',
					autocomplete: 'email',
					inputmode: 'email',
					dir: 'ltr',
					placeholder: t('delegates.form.emailPlaceholder'),
					value: email,
					'aria-invalid': emailIsInvalid ? 'true' : 'false',
					'aria-describedby': emailIsInvalid ? 'delegate-invite-email-error' : undefined,
					oninput: (e: InputEvent) => {
						email = (e.target as HTMLInputElement).value;
					},
					onblur: () => {
						emailTouched = true;
						m.redraw();
					},
				}),
				emailIsInvalid
					? m(
							'.delegates__validation',
							{ id: 'delegate-invite-email-error', role: 'alert' },
							t('delegates.form.emailInvalid'),
						)
					: null,
			]),

			m('.delegates__perms', [
				m('.delegates__perms-heading', t('delegates.form.permsHeading')),
				m(
					'label.delegates__perm',
					{
						class: canManageOrganizer ? 'delegates__perm--checked' : '',
					},
					[
						m('input', {
							type: 'checkbox',
							checked: canManageOrganizer,
							onchange: (e: Event) => {
								canManageOrganizer = (e.target as HTMLInputElement).checked;
								if (canManageOrganizer || canManageParticipant) formError = '';
							},
						}),
						m('span.delegates__perm-body', [
							m('span.delegates__perm-label', t('delegates.perm.organizer.label')),
							m('span.delegates__perm-help', t('delegates.perm.organizer.help')),
						]),
					],
				),
				m(
					'label.delegates__perm',
					{
						class: canManageParticipant ? 'delegates__perm--checked' : '',
					},
					[
						m('input', {
							type: 'checkbox',
							checked: canManageParticipant,
							onchange: (e: Event) => {
								canManageParticipant = (e.target as HTMLInputElement).checked;
								if (canManageOrganizer || canManageParticipant) formError = '';
							},
						}),
						m('span.delegates__perm-body', [
							m('span.delegates__perm-label', t('delegates.perm.participant.label')),
							m('span.delegates__perm-help', t('delegates.perm.participant.help')),
						]),
					],
				),
			]),

			summary ? m('.delegates__summary', { 'aria-live': 'polite' }, summary) : null,

			formError ? m('.delegates__form-error', { role: 'alert' }, formError) : null,

			m(
				'button.btn.btn--primary.delegates__submit',
				{
					type: 'button',
					disabled: !canSubmit,
					'aria-busy': submitting ? 'true' : 'false',
					onclick: () => {
						void handleSubmit(questionId);
					},
				},
				submitting ? t('delegates.form.submitting') : t('delegates.form.submit'),
			),
		]);
	},
};
