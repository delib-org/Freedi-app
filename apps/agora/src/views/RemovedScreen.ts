import m from 'mithril';
import { iconLabel } from '../components/Icon';
import { isRejoinDeclined, isRejoinPending, type AgoraRemoval } from '@freedi/shared-types';
import { t } from '../lib/i18n';

export interface RemovedScreenAttrs {
	removal: AgoraRemoval;
	/** The join door — where a removed student knocks to come back */
	onAsk: () => void;
	onLeave: () => void;
}

/**
 * What a removed student's device shows instead of any stage. Calm, never an
 * error, and live: it reads the removal entry on the session doc this screen
 * already listens to, so "waiting" turns into the game by itself the moment
 * the teacher lets them back, and survives a reload because nothing here is
 * local.
 *
 *   removed, no request → why, and "ask to come back" (the join door)
 *   request pending     → "waiting for your teacher"
 *   request declined    → "not now", and the door again (after a pause the
 *                         server enforces)
 */
export function RemovedScreen(): m.Component<RemovedScreenAttrs> {
	return {
		view({ attrs }) {
			const { removal } = attrs;
			const pending = isRejoinPending(removal);
			const declined = isRejoinDeclined(removal);
			const state = pending ? 'waiting' : declined ? 'declined' : 'removed';
			const title = pending
				? 'game.rejoin_waiting_title'
				: declined
					? 'game.rejoin_declined_title'
					: 'game.removed_title';
			const body = pending
				? 'game.rejoin_waiting_body'
				: declined
					? 'game.rejoin_declined_body'
					: 'game.removed_body';

			return m(
				'.shell',
				m(
					'.shell__content.text-center.game-removed',
					{
						role: 'status',
						'data-state': state,
						style: { justifyContent: 'center', gap: 'var(--space-lg)' },
					},
					[
						m('h2', t(title)),
						m('p.lobby__status', iconLabel(pending ? 'watch' : 'lock', t(body), 18)),
						pending ? m('.spinner', { 'aria-hidden': 'true' }) : null,
						pending
							? null
							: m(
									'button.btn.btn--primary.game-removed__ask',
									{ type: 'button', onclick: attrs.onAsk },
									t(declined ? 'game.rejoin_ask_again' : 'game.rejoin_ask'),
								),
						m(
							'button.btn.btn--secondary',
							{ type: 'button', onclick: attrs.onLeave },
							t('common.back'),
						),
					],
				),
			);
		},
	};
}
