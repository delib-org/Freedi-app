import m from 'mithril';
import type { ClassVoteOrder } from '@freedi/shared-types';
import '@/styles/console-vote-bar.scss';
import { t } from '@/lib/i18n';
import { icon } from './ConsoleIcon';
import { isBusy } from './consoleState';
import { VoteOrderSwitch } from './VoteOrderSwitch';
import { voteBarState } from './voteBarState';
import type { VoteActionKey, VoteBarAction } from './voteBarState';

/**
 * The Vote step's control bar: a status chip with the voted count, the ballot
 * buttons (only the next sensible action is primary), the order of the
 * proposals, and the reset at the end edge. (Trello e3EMqQP2, IA 22.)
 */

export interface VoteBarAttrs {
	/** Paused or ended lesson: the ballot buttons are disabled. */
	held: boolean;
	/** The lesson is over: the reset is held too. */
	ended: boolean;
	ballotFrozen: boolean;
	ballotPaused: boolean;
	ballotClosed: boolean;
	/** Students with a vote / students in the room. */
	votedCount: number;
	presentCount: number;
	allVoted: boolean;
	hasChallenge: boolean;
	voteOrder: ClassVoteOrder;
	onVoteOrder: (order: ClassVoteOrder) => void;
	onFreeze: () => void;
	onPauseVote: (paused: boolean) => void;
	onCloseVote: () => void;
	onResetVote: () => void;
}

const TEST_IDS: Record<VoteActionKey, string> = {
	freeze: 'console-freeze-vote',
	pauseVote: 'console-pause-vote',
	close: 'console-close-vote',
};

const RESET_HINT_ID = 'vote-reset-hint';

function ballotButton(attrs: VoteBarAttrs, spec: VoteBarAction, primary: boolean): m.Vnode {
	const onclick = (): void => {
		if (spec.key === 'freeze') attrs.onFreeze();
		else if (spec.key === 'close') attrs.onCloseVote();
		else attrs.onPauseVote(!attrs.ballotPaused);
	};

	return m(
		`button.btn.${primary ? 'btn--primary' : 'btn--secondary'}.vote-bar__action`,
		{
			key: spec.key,
			type: 'button',
			'data-action': spec.key,
			'data-testid': TEST_IDS[spec.key],
			disabled: attrs.held || isBusy(spec.key),
			onclick,
		},
		[icon(spec.icon), m('span.vote-bar__action-text', t(spec.labelKey))],
	);
}

function progress(attrs: VoteBarAttrs): m.Children {
	if (!attrs.ballotFrozen && !attrs.ballotClosed) return null;
	if (attrs.allVoted) {
		return m(
			'p.vote-bar__progress.vote-bar__progress--done',
			{ 'data-testid': 'console-all-voted' },
			[icon('check'), t('console.all_voted')],
		);
	}
	if (attrs.presentCount === 0) return null;

	return m(
		'p.vote-bar__progress',
		{ 'data-testid': 'console-vote-progress' },
		t('console.vote_progress', { voted: attrs.votedCount, present: attrs.presentCount }),
	);
}

export const VoteBar: m.Component<VoteBarAttrs> = {
	view({ attrs }) {
		const state = voteBarState(attrs);
		const canReset = attrs.ballotClosed || attrs.ballotPaused;
		const hint = t('console.vote_reset_hint');

		return m('div.vote-bar', { 'data-testid': 'vote-bar', 'data-phase': state.phase }, [
			m('div.vote-bar__group.vote-bar__group--status', [
				m(
					`span.vote-status.vote-status--${state.phase}`,
					{ role: 'status', 'aria-live': 'polite', 'data-testid': 'vote-status-chip' },
					[icon(state.chip.icon), m('span', t(state.chip.labelKey))],
				),
				progress(attrs),
			]),
			state.primary
				? m(
						'div.vote-bar__group.vote-bar__group--controls',
						// Keyed buttons: Mithril refuses a null hole beside them, so the list holds only real buttons.
						[
							ballotButton(attrs, state.primary, true),
							...(state.secondary ? [ballotButton(attrs, state.secondary, false)] : []),
						],
					)
				: null,
			m(VoteOrderSwitch, {
				value: attrs.voteOrder,
				disabled: !attrs.hasChallenge || isBusy('voteDisplay:order'),
				onChange: attrs.onVoteOrder,
			}),
			m('div.vote-bar__group.vote-bar__group--reset', [
				m(
					'button.btn.btn--danger-outline.vote-bar__action.vote-bar__action--reset',
					{
						type: 'button',
						'data-action': 'reset:vote',
						'data-testid': 'console-reset-vote',
						disabled: !canReset || attrs.ended || isBusy('reset:vote'),
						title: canReset ? undefined : hint,
						'aria-describedby': canReset ? undefined : RESET_HINT_ID,
						onclick: attrs.onResetVote,
					},
					[icon('reset'), m('span.vote-bar__action-text', t('console.reset_vote'))],
				),
				canReset ? null : m(`span.visually-hidden#${RESET_HINT_ID}`, hint),
			]),
		]);
	},
};
