import m from 'mithril';
import { isRTL, t } from '../lib/i18n';
import { Icon } from './Icon';
import { AGORA_ROUND, type AgoraUnitRating } from '@freedi/shared-types';

export interface UnitScaleAttrs {
	/**
	 * The question these five steps answer — PRINTED above them, and the
	 * accessible name of the group. It is a prop rather than one string
	 * inside the component because a need and a vision ask different things.
	 */
	ask: string;
	value?: AgoraUnitRating;
	/**
	 * A rating of this text is already in flight, so a second press would be
	 * dropped. Not the `disabled` attribute: disabling the button a keyboard
	 * user just pressed throws their focus to the body and the arrow keys go
	 * dead. It says so instead, and refuses the press.
	 */
	busy?: boolean;
	/**
	 * The last press on this text never reached the server. It is said out
	 * loud: a rating that vanishes silently is the one bug a student cannot
	 * work around, because nothing on the screen disagrees with them.
	 */
	failed?: boolean;
	onPick: (value: AgoraUnitRating) => void;
}

/**
 * Which step an arrow key moves the FOCUS to, or null when the key is not
 * ours. RTL flips the horizontal pair: in Hebrew the step to the right of the
 * one you are standing on is the previous one, not the next.
 *
 * Focus moves, selection does not follow it. The usual radiogroup contract
 * selects on arrow, and here every selection is a write that pays a classmate
 * a point — arrowing across the row would pay four of them on the way past.
 * Space and Enter answer, which is what the native button already does.
 */
export function stepAfterKey(
	key: string,
	index: number,
	count: number,
	rtl: boolean,
): number | null {
	const previous = rtl ? 'ArrowRight' : 'ArrowLeft';
	const next = rtl ? 'ArrowLeft' : 'ArrowRight';
	if (key === previous || key === 'ArrowUp') return (index - 1 + count) % count;
	if (key === next || key === 'ArrowDown') return (index + 1) % count;
	if (key === 'Home') return 0;
	if (key === 'End') return count - 1;

	return null;
}

/** One id per mounted scale — a card's question must name its own group */
let nextId = 0;

/**
 * The 0…1 scale of the needs and vision rounds: five steps from "not at all"
 * to "very much". A radiogroup, not five buttons — the steps are one question
 * with five answers, and the question is on the screen rather than hidden in
 * an aria-label. No firebase here; the view writes.
 */
export function UnitScale(): m.Component<UnitScaleAttrs> {
	const askId = `unit-ask-${++nextId}`;
	let steps: HTMLElement | null = null;
	/** Where the keyboard is standing. Null = follow the answer. */
	let focused: number | null = null;

	function focusStep(index: number): void {
		focused = index;
		steps?.querySelectorAll<HTMLElement>('[role="radio"]')[index]?.focus();
	}

	return {
		view(vnode) {
			const { ask, value, busy, failed, onPick } = vnode.attrs;
			const count = AGORA_ROUND.UNIT_STEPS.length;
			const chosen =
				value === undefined ? -1 : (AGORA_ROUND.UNIT_STEPS as readonly number[]).indexOf(value);
			const answered = chosen >= 0;
			// The one tab stop of the group: my answer, or the first step
			const stop = focused ?? (answered ? chosen : 0);

			return m('.unit-scale', { class: answered ? 'unit-scale--answered' : undefined }, [
				m('p.unit-scale__ask', { id: askId }, [
					m('span.unit-scale__question', ask),
					answered ? null : m('span.unit-scale__todo', t('round.unit_todo')),
				]),
				m(
					'.unit-scale__steps',
					{
						role: 'radiogroup',
						'aria-labelledby': askId,
						'aria-busy': busy === true ? 'true' : undefined,
						oncreate: (node: m.VnodeDOM) => {
							steps = node.dom as HTMLElement;
						},
						onremove: () => {
							steps = null;
						},
						onkeydown: (event: KeyboardEvent) => {
							const target = stepAfterKey(event.key, stop, count, isRTL());
							if (target === null) return;
							event.preventDefault();
							focusStep(target);
						},
					},
					AGORA_ROUND.UNIT_STEPS.map((step, index) => {
						const on = index === chosen;

						return m(
							'button.unit-scale__step',
							{
								key: step,
								type: 'button',
								role: 'radio',
								'aria-checked': on ? 'true' : 'false',
								'aria-disabled': busy === true ? 'true' : undefined,
								class: on ? 'unit-scale__step--on' : undefined,
								'data-step': String(index),
								tabindex: index === stop ? 0 : -1,
								onclick: () => {
									focused = index;
									if (busy === true) return;
									onPick(step);
								},
							},
							[
								m('span.unit-scale__disc', { 'aria-hidden': 'true' }),
								m('span.unit-scale__label', t(`round.unit_${index}`)),
								on
									? m(
											'span.unit-scale__check',
											{ 'aria-hidden': 'true' },
											m(Icon, { name: 'check', size: 12 }),
										)
									: null,
							],
						);
					}),
				),
				failed === true
					? m('p.unit-scale__failed', { role: 'status' }, t('round.rate_failed'))
					: null,
			]);
		},
	};
}
