import m from 'mithril';
import { t } from '../lib/i18n';
import { EraMap } from '../components/EraMap';
import { Collapsible } from '../components/Collapsible';
import { ExplainHint } from '../components/ExplainHint';
import { Icon, iconLabel, type IconName } from '../components/Icon';
import type { AgoraParticipant } from '@freedi/shared-types';

export interface LobbyAttrs {
	participants: AgoraParticipant[];
	myParticipant: AgoraParticipant | null;
	/** Open the style sheet — the wait is the one idle moment in the game, and this fills it */
	onOpenLook?: () => void;
}

interface IntroCard {
	icon: IconName;
	titleKey: string;
	textKey: string;
}

/** The three things the facilitator says before anyone speaks (the WizCol guide, "opening") */
const INTRO_CARDS: readonly IntroCard[] = [
	{ icon: 'target', titleKey: 'intro.goal_title', textKey: 'intro.goal_text' },
	{ icon: 'talk', titleKey: 'intro.listen_title', textKey: 'intro.listen_text' },
	{ icon: 'flag', titleKey: 'intro.end_title', textKey: 'intro.end_text' },
];

/**
 * The opening, folded into the wait: why a group is wiser than its loudest
 * member, and what will happen at the end. A card the student may unfold
 * while the room fills — never a step, never gated, nothing stored.
 */
function introCard(open: boolean, onToggle: () => void): m.Children {
	return m('.card.intro.lobby__intro', [
		m(
			'button.lobby__intro-toggle',
			{ type: 'button', onclick: onToggle, 'aria-expanded': String(open) },
			[
				m('span.intro__icon', { 'aria-hidden': 'true' }, m(Icon, { name: 'spark', size: 22 })),
				m('span.intro__title', t('intro.title')),
			],
		),
		open
			? m(
					Collapsible,
					m('.stack', [
						m('p.intro__lead', t('intro.lead')),
						m(
							'ul.intro__rows',
							INTRO_CARDS.map((card) =>
								m('li.icon-row', { key: card.titleKey }, [
									m(
										'span.icon-row__icon',
										{ 'aria-hidden': 'true' },
										m(Icon, { name: card.icon, size: 28 }),
									),
									m('strong.icon-row__body', t(card.titleKey)),
									// The sentence behind the words is the reason, one tap away
									m(ExplainHint, { text: t(card.textKey) }),
								]),
							),
						),
					]),
				)
			: null,
	]);
}

/** Whether the opening card is unfolded — one lobby per tab, so module state is the screen's */
let introOpen = false;

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
					m('p.lobby__status', iconLabel('people', ` ${t('lobby.joined')}`, 18)),
				]),

				m(
					'p.lobby__status.lobby__waiting-dots.text-center',
					iconLabel('watch', t('lobby.waiting'), 20),
				),

				introCard(introOpen, () => {
					introOpen = !introOpen;
				}),

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
