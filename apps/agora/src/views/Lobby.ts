import m from 'mithril';
import { t } from '../lib/i18n';
import { EraMap } from '../components/EraMap';
import type { AgoraParticipant } from '@freedi/shared-types';

export interface LobbyAttrs {
	participants: AgoraParticipant[];
	myParticipant: AgoraParticipant | null;
}

/** Student lobby — the night city with travelers materializing by the portal */
export const Lobby: m.Component<LobbyAttrs> = {
	view(vnode) {
		const { participants, myParticipant } = vnode.attrs;

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
			]),
		]);
	},
};
