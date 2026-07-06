import m from 'mithril';
import { t } from '../lib/i18n';
import { ensureUser } from '../lib/user';
import { listenToSession, stopListening, getSessionState } from '../lib/session';
import { Lobby } from './Lobby';
import { AgoraStage } from '@freedi/shared-types';

/**
 * Student game controller — routes the current view from the session doc's
 * stage (single source of truth). Phase 1 covers lobby → framing; later
 * stages land here as camera moves on the era map.
 */
export function GameController(initialVnode: m.Vnode<{ id: string }>): m.Component<{ id: string }> {
	const sessionId = initialVnode.attrs.id;

	void ensureUser().then((user) => {
		listenToSession(sessionId, user.uid);
	});

	return {
		onremove() {
			stopListening();
		},

		view() {
			const { session, participants, myParticipant, loading, error } = getSessionState();

			if (loading || (!session && !error)) {
				return m(
					'.shell',
					m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				);
			}

			if (error || !session) {
				return m(
					'.shell',
					m('.shell__content.text-center', { style: { justifyContent: 'center' } }, [
						m('p.join__error', t('common.error')),
						m('button.btn.btn--secondary', { onclick: () => m.route.set('/') }, t('common.back')),
					]),
				);
			}

			switch (session.stage) {
				case AgoraStage.lobby:
					return m(Lobby, { participants, myParticipant });

				case AgoraStage.framing:
				default:
					// Phase 3 replaces this with the full scene flow on the map
					return m('.shell', [
						m(
							'.shell__content.text-center',
							{ style: { justifyContent: 'center', gap: 'var(--space-lg)' } },
							[m('h2', t('lobby.get_ready')), m('p.lobby__status', session.stage)],
						),
					]);
			}
		},
	};
}
