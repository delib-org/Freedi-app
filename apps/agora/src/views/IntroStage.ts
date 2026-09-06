import m from 'mithril';
import { t } from '../lib/i18n';
import { Icon, type IconName } from '../components/Icon';
import { reportStageProgress } from '../lib/session';
import { AgoraStage, type AgoraSession } from '@freedi/shared-types';

export interface IntroStageAttrs {
	session: AgoraSession;
	userId: string;
	/** The room is ON this stage. False when a player stepped back to re-read it. */
	live: boolean;
}

interface IntroCard {
	icon: IconName;
	titleKey: string;
	textKey: string;
}

/** The three things the facilitator says before anyone speaks (the WizCol guide, "opening") */
const CARDS: readonly IntroCard[] = [
	{ icon: 'bridge', titleKey: 'intro.goal_title', textKey: 'intro.goal_text' },
	{ icon: 'thought', titleKey: 'intro.listen_title', textKey: 'intro.listen_text' },
	{ icon: 'scales', titleKey: 'intro.end_title', textKey: 'intro.end_text' },
];

/**
 * The opening: why a group is wiser than its loudest member, and what will
 * happen at the end. Three cards read at the student's own pace — "got it"
 * turns the next one over; never a timer, never a reveal the reader waits
 * on. Progress goes to the teacher's board so the room knows when to move.
 */
export function IntroStage(): m.Component<IntroStageAttrs> {
	let seen = 0;

	return {
		view(vnode) {
			const { session, userId, live } = vnode.attrs;
			const total = CARDS.length;
			const shown = live ? Math.min(total, seen + 1) : total;
			const done = seen >= total;

			return m('.shell', [
				m('.shell__content.intro', { style: { gap: 'var(--space-lg)' } }, [
					m('.card.intro__ask', [
						m('span.intro__icon', { 'aria-hidden': 'true' }, m(Icon, { name: 'spark', size: 28 })),
						m('h2.intro__title', t('intro.title')),
						m('p.intro__lead', t('intro.lead')),
					]),
					m(
						'ol.intro__cards',
						CARDS.slice(0, shown).map((card, index) =>
							m('li.card.intro__card', { key: card.titleKey, 'data-step': String(index + 1) }, [
								m('.intro__card-head', [
									m(
										'span.intro__card-icon',
										{ 'aria-hidden': 'true' },
										m(Icon, { name: card.icon, size: 22 }),
									),
									m('h3.intro__card-title', t(card.titleKey)),
								]),
								m('p.intro__card-text', t(card.textKey)),
							]),
						),
					),
					live && !done
						? m(
								'button.btn.btn--primary.btn--full.intro__next',
								{
									type: 'button',
									onclick: () => {
										seen = Math.min(total, seen + 1);
										reportStageProgress(session.sessionId, userId, AgoraStage.intro, seen, total);
									},
								},
								t(seen + 1 >= total ? 'intro.done' : 'intro.got_it'),
							)
						: live
							? m('p.intro__ready', t('intro.ready'))
							: null,
				]),
			]);
		},
	};
}
