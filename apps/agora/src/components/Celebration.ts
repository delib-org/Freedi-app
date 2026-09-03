import m from 'mithril';
import { t } from '../lib/i18n';
import { getCelebration, dismissCelebration, type CelebrationPayload } from '../lib/celebration';
import { Icon } from './Icon';
import { isSoundOn, playApplause, playGoal, toggleSound } from '../lib/sound';

const SPARK_COUNT = 18;

/**
 * Full-screen "הידד!" moment: a burst of golden sparks around a popup that
 * quotes the improvement being celebrated. Positive reinforcement for the
 * behavior the game most wants to teach — making ideas better.
 * Animation is pure CSS and collapses to a static popup under
 * prefers-reduced-motion.
 *
 * These popups are the emotional core of the reward system, so they are
 * built as a real dialog: announced to screen readers, focus moved onto the
 * primary action, and Escape closes. A celebration nobody can perceive or
 * dismiss without a mouse is a reward the student never receives.
 */
export function CelebrationOverlay(): m.Component {
	/**
	 * Which moment the card is currently showing. Celebrations queue now, so a
	 * dismissal can swap the payload underneath a DOM node Mithril happily
	 * reuses — `oncreate` alone would announce the first moment and stay mute
	 * for every one behind it.
	 */
	let announced: CelebrationPayload | null = null;

	function announce(dom: HTMLElement, payload: CelebrationPayload): void {
		if (announced === payload) return;
		announced = payload;
		// Focus lands on the action the loop wants next (the travel button when
		// there is one, otherwise plain close)
		(dom.querySelector<HTMLElement>('button.btn--primary') ?? dom).focus();
		if (payload.sound === 'applause') playApplause();
		if (payload.sound === 'goal') playGoal();
	}

	return {
		view() {
			const payload = getCelebration();
			if (!payload) {
				announced = null;

				return null;
			}
			const isGoal = payload.kind === 'goal';
			const headline = t(isGoal ? 'celebrate.goal' : 'celebrate.hooray');

			return m(
				'.celebration',
				{
					onclick: (event: MouseEvent) => {
						if ((event.target as HTMLElement).classList.contains('celebration')) {
							dismissCelebration();
						}
					},
					onkeydown: (event: KeyboardEvent) => {
						if (event.key === 'Escape') dismissCelebration();
					},
				},
				[
					m(
						'.celebration__card',
						{
							class: isGoal ? 'celebration__card--goal' : undefined,
							role: 'alertdialog',
							'aria-modal': 'true',
							'aria-label': `${headline} ${payload.message}`,
							tabindex: '-1',
							oncreate: (vnode: m.VnodeDOM) => {
								announce(vnode.dom as HTMLElement, payload);
							},
							onupdate: (vnode: m.VnodeDOM) => {
								announce(vnode.dom as HTMLElement, payload);
							},
						},
						[
							// The quiet switch, in the corner where mute controls live —
							// deliberately OUT of the button flow, so the last button on
							// the card stays the dismissal
							payload.sound
								? m(
										'button.celebration__mute',
										{
											type: 'button',
											'aria-pressed': String(!isSoundOn()),
											'aria-label': t(isSoundOn() ? 'celebrate.mute' : 'celebrate.unmute'),
											onclick: () => {
												toggleSound();
											},
										},
										m(Icon, { name: isSoundOn() ? 'sound-on' : 'sound-off', size: 18 }),
									)
								: null,
							m(
								'.celebration__sparks',
								{ 'aria-hidden': 'true' },
								Array.from({ length: SPARK_COUNT }, (_, index) =>
									m('span.celebration__spark', {
										style: { '--spark-index': String(index) },
									}),
								),
							),
							// The stadium: a goal at the top of the card and the ball shot
							// up into it from the bottom edge. Decoration to a screen reader
							// — the headline and the message already say everything it does.
							isGoal
								? m('.celebration__pitch', { 'aria-hidden': 'true' }, [
										m('.celebration__goal', m('.celebration__net')),
										m('.celebration__ball', m(Icon, { name: 'ball', size: 40 })),
									])
								: null,
							m(
								'.celebration__hooray',
								{
									'aria-hidden': 'true',
									class: isGoal ? 'celebration__hooray--goal' : undefined,
								},
								headline,
							),
							m('p.celebration__message', payload.message),
							payload.detail ? m('.celebration__detail', payload.detail) : null,
							// The one good-news moment with no button still says where the
							// loop goes next — the wait for "+2" becomes anticipation
							// instead of an invisible state
							payload.hint ? m('p.celebration__hint', payload.hint) : null,
							// With a continuation, IT is the star and plain-close steps
							// back: the popup invites the loop's next move, not a shrug
							payload.action
								? m(
										'button.btn.btn--primary.btn--full',
										{
											onclick: () => {
												payload.action?.run();
												dismissCelebration();
											},
										},
										payload.action.label,
									)
								: null,
							m(
								payload.action
									? 'button.btn.btn--ghost.btn--full'
									: 'button.btn.btn--primary.btn--full',
								{ onclick: dismissCelebration },
								t('celebrate.close'),
							),
						],
					),
				],
			);
		},
	};
}
