import m from 'mithril';
import { Icon, iconLabel, type IconName } from './Icon';
import { AgoraSession } from '@freedi/shared-types';
import { t } from '../lib/i18n';
import { getDeliberationState, rateProposal, type AgoraRating } from '../lib/proposals';
import { noteReWeighed } from '../lib/improvementSignals';

/**
 * The five-level rating scale, ordered strongest-against → strongest-for.
 */
export const RATE_OPTIONS: ReadonlyArray<{
	value: AgoraRating;
	variant: string;
	icon: IconName;
	labelKey: string;
}> = [
	{
		value: -1,
		variant: 'strong-against',
		icon: 'face-strong-against',
		labelKey: 'rate.strong_against',
	},
	{ value: -0.5, variant: 'against', icon: 'face-against', labelKey: 'rate.against' },
	{ value: 0, variant: 'abstain', icon: 'face-neutral', labelKey: 'rate.abstain' },
	{ value: 0.5, variant: 'for', icon: 'face-for', labelKey: 'rate.for' },
	{ value: 1, variant: 'strong-for', icon: 'face-strong-for', labelKey: 'rate.strong_for' },
];

/** The face for a value, for callers that report a rating rather than take one */
export function rateOptionFor(value: number): (typeof RATE_OPTIONS)[number] | undefined {
	return RATE_OPTIONS.find((option) => option.value === value);
}

export interface RateScaleAttrs {
	session: AgoraSession;
	proposalId: string;
	/**
	 * Mark the face I already gave. TRUE out on the square, where the standing
	 * vote is orientation. FALSE wherever a student is being asked to weigh a
	 * revision: a marked previous answer is a consistency anchor, and anchoring
	 * someone right before they re-rate is how a scale gets bought.
	 */
	showCurrent?: boolean;
	/** Fires ONLY when this press is my first-ever rating of this proposal */
	onFirstVote?: () => void;
	/** Fires on every press, with whatever I had said before (undefined = nothing) */
	onVote?: (value: AgoraRating, previous: AgoraRating | undefined) => void;
}

/**
 * The compact five-face scale, wherever a student weighs a proposal.
 *
 * It owns its own acknowledgment: the press used to change a ring and nothing
 * else, which left the cycle's final step feeling like it hadn't registered.
 * Keeping the timer in here means every caller gets the answer without any of
 * them having to remember to clear it.
 */
export function RateScale(): m.Component<RateScaleAttrs> {
	let acked = false;
	let ackTimer: number | undefined;

	function ack(): void {
		acked = true;
		window.clearTimeout(ackTimer);
		ackTimer = window.setTimeout(() => {
			acked = false;
			m.redraw();
		}, 2600);
	}

	return {
		onremove() {
			window.clearTimeout(ackTimer);
		},

		view(vnode) {
			const { session, proposalId, showCurrent = true, onFirstVote, onVote } = vnode.attrs;
			const current = getDeliberationState().myRatings[proposalId]?.value as
				| AgoraRating
				| undefined;
			const marked = showCurrent ? current : undefined;

			return [
				// The cycle's final beat, answered in words, once, then it returns
				acked
					? m('p.helped__rerate-ack', { role: 'status' }, iconLabel('check', t('delib.rerate_ack')))
					: null,
				m(
					'.rate-scale.rate-scale--compact',
					{
						class: marked !== undefined ? 'rate-scale--has-selection' : undefined,
						role: 'radiogroup',
					},
					RATE_OPTIONS.map((option) => {
						const active = marked === option.value;

						return m(
							`button.rate-scale__option.rate-scale__option--${option.variant}`,
							{
								class: active ? 'rate-scale__option--selected' : undefined,
								role: 'radio',
								'aria-checked': String(active),
								onclick: () => {
									// Read BEFORE the write: rateProposal overwrites in place,
									// so a beat later there is no "first time" left to detect
									const previous = getDeliberationState().myRatings[proposalId]?.value as
										| AgoraRating
										| undefined;
									void rateProposal(session, proposalId, option.value);
									// Whatever edit is on the table, this press answers it
									noteReWeighed(proposalId);
									ack();
									onVote?.(option.value, previous);
									if (previous === undefined) onFirstVote?.();
								},
							},
							[
								m('span.rate-scale__emoji', m(Icon, { name: option.icon, size: 30 })),
								m('span.rate-scale__label', t(option.labelKey)),
								active
									? m(
											'span.rate-scale__check',
											{ 'aria-hidden': 'true' },
											m(Icon, { name: 'check', size: 14 }),
										)
									: null,
							],
						);
					}),
				),
			];
		},
	};
}
