import m from 'mithril';
import { t } from '../lib/i18n';
import { EraMap } from '../components/EraMap';
import type { AgoraParticipant } from '@freedi/shared-types';

export interface LobbyAttrs {
	participants: AgoraParticipant[];
	myParticipant: AgoraParticipant | null;
	/** Open the style sheet — the wait is the one idle moment in the game, and this fills it */
	onOpenLook?: () => void;
}

/** Student lobby — the night city with travelers materializing by the portal */
export const Lobby: m.Component<LobbyAttrs> = {
	view(vnode) {
		const { participants, myParticipant, onOpenLook } = vnode.attrs;

		return m('.shell.shell--wide', [
			m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
				m(EraMap, {
					participants,
					myParticipantId: myParticipant?.participantId,
				}),

				myParticipant
					? m('p.lobby__name', [`${t('lobby.you_are')} `, m('strong', myParticipant.anonName)])
					: null,

				m('.text-center', [
					m('span.lobby__count', String(participants.length)),
					m('p.lobby__status', ` ${t('lobby.joined')}`),
				]),

				m('p.lobby__status.lobby__waiting-dots.text-center', t('lobby.waiting')),

				// While you wait: pick how the game looks on your screen. Offered
				// here because the lobby is the one place a student has nothing
				// to do yet, and a look chosen now is worn for the whole lesson.
				onOpenLook && myParticipant
					? m('.card.lobby__look', [
							m('p.lobby__status', t('look.lobby_prompt')),
							m(
								'button.btn.btn--secondary',
								{ type: 'button', onclick: onOpenLook },
								t('look.open'),
							),
						])
					: null,
			]),
		]);
	},
};
