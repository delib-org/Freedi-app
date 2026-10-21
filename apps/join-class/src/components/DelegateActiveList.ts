import m from 'mithril';
import { JoinDelegate } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { getDelegatesForQuestion, revokeJoinDelegate } from '@/lib/store';
import { showFacilitatorToast } from '@/lib/facilitatorToast';

interface DelegateActiveListAttrs {
	questionId: string;
}

let confirmingDelegateId: string | null = null;
let busyDelegateId: string | null = null;

function renderBadges(permissions: JoinDelegate['permissions']): m.Vnode[] {
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

function formatJoinedDate(ms: number): string {
	if (!ms) return '';
	try {
		const formatter = new Intl.DateTimeFormat(undefined, {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
		});

		return formatter.format(new Date(ms));
	} catch {
		return new Date(ms).toDateString();
	}
}

async function handleRemove(questionId: string, delegate: JoinDelegate): Promise<void> {
	if (busyDelegateId === delegate.delegateId) return;
	busyDelegateId = delegate.delegateId;
	confirmingDelegateId = null;
	m.redraw();

	try {
		await revokeJoinDelegate({ questionId, userId: delegate.userId });
		showFacilitatorToast(t('delegates.toast.removed'));
	} catch (err) {
		console.error('[DelegateActiveList] Remove failed:', err);
		showFacilitatorToast(t('delegates.toast.error'));
	} finally {
		busyDelegateId = null;
		m.redraw();
	}
}

function renderRow(questionId: string, delegate: JoinDelegate): m.Vnode {
	const isConfirming = confirmingDelegateId === delegate.delegateId;
	const isBusy = busyDelegateId === delegate.delegateId;
	const joined = delegate.addedAt
		? t('delegates.row.joined', { date: formatJoinedDate(delegate.addedAt) })
		: '';
	const displayName = delegate.displayName?.trim() || delegate.email;

	return m(
		'.delegates__row.delegates__row--active',
		{
			class: isConfirming ? 'delegates__row--confirming' : '',
			key: delegate.delegateId,
		},
		[
			m('.delegates__row-main', [
				m('.delegates__row-email', [
					m('span', { 'aria-hidden': 'true' }, '👤 '),
					m('span.delegates__row-name', displayName),
					delegate.email && delegate.email !== displayName
						? m('bdi.delegates__row-email-secondary', { dir: 'ltr' }, ` (${delegate.email})`)
						: null,
				]),
				m('.delegates__row-meta', [
					...renderBadges(delegate.permissions),
					joined ? m('span.delegates__row-joined', joined) : null,
				]),
			]),
			m(
				'.delegates__row-actions',
				isConfirming
					? [
							m(
								'span.delegates__confirm-prompt',
								t('delegates.row.revoke.activePrompt', { email: delegate.email }),
							),
							m(
								'button.btn.btn--secondary.btn--small',
								{
									type: 'button',
									disabled: isBusy,
									onclick: () => {
										confirmingDelegateId = null;
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
										void handleRemove(questionId, delegate);
									},
								},
								t('delegates.row.revoke.activeConfirm'),
							),
						]
					: [
							m(
								'button.delegates__revoke',
								{
									type: 'button',
									'aria-label': t('delegates.row.revokeAria', { email: delegate.email }),
									onclick: () => {
										confirmingDelegateId = delegate.delegateId;
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
		m('span.delegates__empty-icon', { 'aria-hidden': 'true' }, '👥'),
		m('.delegates__empty-title', t('delegates.active.empty.title')),
		m('.delegates__empty-body', t('delegates.active.empty.body')),
	]);
}

export const DelegateActiveList: m.Component<DelegateActiveListAttrs> = {
	view({ attrs: { questionId } }) {
		const delegates = getDelegatesForQuestion();

		return m('.delegates__list', [
			m('.delegates__list-heading', t('delegates.active.heading')),
			delegates.length === 0 ? renderEmpty() : delegates.map((d) => renderRow(questionId, d)),
		]);
	},
};
