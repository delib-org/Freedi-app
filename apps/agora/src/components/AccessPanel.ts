import m from 'mithril';
import { t } from '../lib/i18n';
import { currentRequestOf, type AccessState } from '../lib/accessLogic';
import { getAccessStore, loadAccess, withdrawAccessRequest } from '../lib/access';

export interface AccessPanelAttrs {
	/** Which of the three non-approved states to show */
	state: Exclude<AccessState, 'approved'>;
	/** The signed-in account, so the status can be re-read after a withdraw */
	uid: string;
}

/**
 * Where a teacher's request stands, as a card: nothing asked yet (a way to the
 * form), waiting for approval (with "withdraw"), or declined (the reason and a
 * way to ask again). It stands in for the whole teacher home until approval.
 */
export function AccessPanel(): m.Component<AccessPanelAttrs> {
	let confirming = false;
	let busy = false;
	let failed = false;

	async function withdraw(requestId: string, uid: string): Promise<void> {
		if (busy) return;
		busy = true;
		failed = false;
		m.redraw();
		try {
			await withdrawAccessRequest(requestId);
			confirming = false;
			await loadAccess(uid, true);
		} catch (error) {
			console.error('[Access] Withdrawing the request failed:', error);
			failed = true;
		}
		busy = false;
		m.redraw();
	}

	function toForm(label: string): m.Children {
		return m(
			'button.btn.btn--primary',
			{ type: 'button', onclick: () => m.route.set('/teach/request') },
			label,
		);
	}

	function pending(uid: string): m.Children {
		const request = currentRequestOf(getAccessStore().requests);

		return [
			m('span.access-chip.access-chip--pending', t('access.pending')),
			m('p.access-panel__text', t('access.pending_text')),
			request?.schoolName
				? m('p.access-panel__meta', t('access.for_school', { school: request.schoolName }))
				: null,
			confirming
				? m(
						'.access-panel__actions',
						{ role: 'group', 'aria-label': t('access.withdraw_confirm') },
						[
							m('p.access-panel__text', { id: 'access-withdraw-q' }, t('access.withdraw_confirm')),
							m(
								'button.btn.btn--secondary',
								{
									type: 'button',
									disabled: busy,
									onclick: () => request && void withdraw(request.requestId, uid),
								},
								t('access.withdraw_yes'),
							),
							m(
								'button.btn.btn--ghost',
								{
									type: 'button',
									disabled: busy,
									onclick: () => {
										confirming = false;
										failed = false;
									},
								},
								t('access.withdraw_no'),
							),
						],
					)
				: m(
						'.access-panel__actions',
						m(
							'button.btn.btn--ghost',
							{
								type: 'button',
								onclick: () => {
									confirming = true;
								},
							},
							t('access.withdraw'),
						),
					),
			failed ? m('p.access-panel__error', { role: 'alert' }, t('access.withdraw_error')) : null,
		];
	}

	function declined(): m.Children {
		const request = currentRequestOf(getAccessStore().requests);

		return [
			m('span.access-chip.access-chip--declined', t('access.declined')),
			m('p.access-panel__text', t('access.declined_text')),
			request?.declineReason
				? m(
						'p.access-panel__reason',
						t('access.declined_reason', { reason: request.declineReason }),
					)
				: null,
			m('.access-panel__actions', toForm(t('access.new_request'))),
		];
	}

	function none(): m.Children {
		return [
			m('h2.access-panel__title', t('access.title')),
			m('p.access-panel__text', t('access.intro')),
			m('.access-panel__actions', toForm(t('access.cta'))),
		];
	}

	return {
		view({ attrs }) {
			return m(
				'section.access-panel',
				{ 'aria-live': 'polite' },
				attrs.state === 'pending'
					? pending(attrs.uid)
					: attrs.state === 'declined'
						? declined()
						: none(),
			);
		},
	};
}
