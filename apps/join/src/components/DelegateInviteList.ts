import m from 'mithril';
import { JoinDelegateInvitation, JoinDelegateInvitationStatus } from '@freedi/shared-types';
import { t, isRTL, getLang } from '@/lib/i18n';
import { getDelegateInvitationsForQuestion, revokeJoinDelegate } from '@/lib/store';
import { showFacilitatorToast } from '@/lib/facilitatorToast';
import { formatRemaining } from '@/lib/timeFormat';

interface DelegateInviteListAttrs {
	questionId: string;
}

let confirmingId: string | null = null;
let busyId: string | null = null;

function buildInviteLink(token: string): string {
	const base = `${window.location.origin}/invite`;

	return `${base}?token=${encodeURIComponent(token)}`;
}

function renderBadges(permissions: JoinDelegateInvitation['permissions']): m.Vnode[] {
	const badges: m.Vnode[] = [];
	if (permissions.canManageOrganizerSolutions) {
		badges.push(
			m('span.delegates__badge.delegates__badge--organizer', t('delegates.row.perms.organizer')),
		);
	}
	if (permissions.canManageParticipantSolutions) {
		badges.push(
			m(
				'span.delegates__badge.delegates__badge--participant',
				t('delegates.row.perms.participant'),
			),
		);
	}

	return badges;
}

async function copyInviteLink(invite: JoinDelegateInvitation): Promise<void> {
	const link = buildInviteLink(invite.token);
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(link);
			showFacilitatorToast(t('delegates.toast.linkCopied'));

			return;
		}
	} catch {
		/* fall through */
	}
	showFacilitatorToast(t('delegates.toast.copyFailed'));
}

async function handleRevoke(invite: JoinDelegateInvitation): Promise<void> {
	if (busyId === invite.invitationId) return;
	busyId = invite.invitationId;
	confirmingId = null;
	m.redraw();

	try {
		await revokeJoinDelegate({ invitationId: invite.invitationId });
		showFacilitatorToast(t('delegates.toast.revoked'));
	} catch (err) {
		console.error('[DelegateInviteList] Revoke failed:', err);
		showFacilitatorToast(t('delegates.toast.error'));
	} finally {
		busyId = null;
		m.redraw();
	}
}

function visibleInvites(): JoinDelegateInvitation[] {
	const now = Date.now();

	return getDelegateInvitationsForQuestion().filter((inv) => {
		if (inv.status === JoinDelegateInvitationStatus.revoked) return false;
		if (inv.status === JoinDelegateInvitationStatus.accepted) return false;
		if (inv.status === JoinDelegateInvitationStatus.expired) return false;
		if (inv.expiresAt < now) return false;

		return inv.status === JoinDelegateInvitationStatus.pending;
	});
}

function renderRow(invite: JoinDelegateInvitation): m.Vnode {
	const isConfirming = confirmingId === invite.invitationId;
	const isBusy = busyId === invite.invitationId;
	const remaining = formatRemaining(invite.expiresAt - Date.now());
	const expiresIn = remaining
		? t('delegates.row.expiresIn', { remaining })
		: t('delegates.row.expired');

	return m(
		'.delegates__row',
		{
			class: isConfirming ? 'delegates__row--confirming' : '',
			key: invite.invitationId,
		},
		[
			m('.delegates__row-main', [
				m(
					'.delegates__row-email',
					{ dir: 'ltr' },
					m('span', { 'aria-hidden': 'true' }, '✉ '),
					m('bdi', invite.invitedEmail),
				),
				m('.delegates__row-meta', [
					...renderBadges(invite.permissions),
					m('span.delegates__row-expiry', expiresIn),
				]),
			]),
			m(
				'.delegates__row-actions',
				isConfirming
					? [
							m('span.delegates__confirm-prompt', t('delegates.row.revoke.prompt')),
							m(
								'button.btn.btn--secondary.btn--small',
								{
									type: 'button',
									disabled: isBusy,
									onclick: () => {
										confirmingId = null;
										m.redraw();
									},
								},
								t('delegates.row.revoke.cancel'),
							),
							m(
								'button.btn.btn--danger.btn--small',
								{
									type: 'button',
									disabled: isBusy,
									'aria-busy': isBusy ? 'true' : 'false',
									onclick: () => {
										void handleRevoke(invite);
									},
								},
								t('delegates.row.revoke.confirm'),
							),
						]
					: [
							m(
								'button.btn.btn--secondary.btn--small',
								{
									type: 'button',
									'aria-label': t('delegates.row.copyAria', { email: invite.invitedEmail }),
									onclick: () => {
										void copyInviteLink(invite);
									},
								},
								t('delegates.row.copy'),
							),
							m(
								'button.delegates__revoke',
								{
									type: 'button',
									'aria-label': t('delegates.row.revokeAria', { email: invite.invitedEmail }),
									onclick: () => {
										confirmingId = invite.invitationId;
										m.redraw();
									},
								},
								t('delegates.row.revoke'),
							),
						],
			),
		],
	);
}

function renderEmpty(): m.Vnode {
	return m('.delegates__empty', [
		m('span.delegates__empty-icon', { 'aria-hidden': 'true' }, '✉️'),
		m('.delegates__empty-title', t('delegates.pending.empty.title')),
		m('.delegates__empty-body', t('delegates.pending.empty.body')),
	]);
}

export const DelegateInviteList: m.Component<DelegateInviteListAttrs> = {
	view() {
		// `getLang` and `isRTL` are used implicitly by `t()` — re-reading on
		// each render keeps the row labels in sync after a language flip.
		void getLang();
		void isRTL();

		const invites = visibleInvites();

		return m('.delegates__list', [
			m('.delegates__list-heading', t('delegates.pending.heading')),
			invites.length === 0 ? renderEmpty() : invites.map(renderRow),
		]);
	},
};
