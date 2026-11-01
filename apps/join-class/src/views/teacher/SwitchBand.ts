import m from 'mithril';
import type { ClassVoteOrder, LessonStepKey } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { ALL_TABLES_RATE_STEPS } from '@/lib/classroom/consoleHelpers';
import type { IntroVideo } from '@/lib/classroom/introVideos';
import { ProjectorPick } from './ProjectorPick';
import { VoteBar } from './VoteBar';
import type { VoteScopeAttrs } from './VoteScopeSwitch';
import { isBusy } from './consoleState';
import type { ConsoleView } from './consoleState';

/**
 * The switch band (UX section 5, 48 px): the current step's actions as
 * secondary buttons at the start, the "tables | what they wrote" segment at the
 * end. Never primary: primary is reserved for the rail's forward control.
 */

export interface SwitchBandAttrs {
	/** Paused or ended: the step actions are disabled (looking stays possible). */
	held?: boolean;
	/** The lesson is over: the resets (which work while paused) are held too. */
	ended?: boolean;
	stepKey: LessonStepKey;
	view: ConsoleView;
	hasTables: boolean;
	hasChallenge: boolean;
	plenum: boolean;
	ballotFrozen: boolean;
	ballotPaused: boolean;
	ballotClosed: boolean;
	// >>> voteSummary BEGIN
	/** Every student present has voted (the ballot is still the teacher's to close). */
	allVoted?: boolean;
	/** Students with a vote on the running ballot, and students in the room. */
	votedCount?: number;
	presentCount?: number;
	// >>> voteSummary END
	/** The lesson's introduction videos and the one the projector shows (Opening step). */
	introVideos: readonly IntroVideo[];
	projectorVideoId: string | null;
	/** Unseen language flags (IA 24.4): a count on the "what they wrote" switch. */
	flagCount?: number;
	onView: (view: ConsoleView) => void;
	onSplit: (replace: boolean) => void;
	onAllToRate: () => void;
	/** Proposals (IA 25.6): the next turn at every table. */
	onAnotherTurnAll: () => void;
	onPlenum: () => void;
	onFreeze: () => void;
	/** The order of the proposals on every phone and the projector (Vote step). */
	voteOrder: ClassVoteOrder;
	onVoteOrder: (order: ClassVoteOrder) => void;
	/** All proposals / only those above the goal (Vote step). */
	voteScope?: VoteScopeAttrs;
	onPauseVote: (paused: boolean) => void;
	onCloseVote: () => void;
	onResetTurns: () => void;
	onResetVote: () => void;
	onProject: (id: string | null) => void;
	// >>> allProposals BEGIN
	/** "כל ההצעות": the live "n of m students rated everything · at least k ratings" line. */
	allRatedLine?: string;
	// >>> allProposals END
}

const TEST_IDS: Record<string, string> = {
	assign: 'console-assign-tables',
	'all:rate': 'console-all-rate',
	'all:newTurn': 'console-all-new-turn',
	plenum: 'console-plenum',
	freeze: 'console-freeze-vote',
	pauseVote: 'console-pause-vote',
	close: 'console-close-vote',
	'reset:turns:all': 'console-reset-turns',
	'reset:vote': 'console-reset-vote',
};

/** Set by the view before it draws the actions below. */
let heldNow = false;
let endedNow = false;

function action(label: string, key: string, onclick: () => void, disabled = false): m.Vnode {
	return m(
		'button.btn.btn--secondary.switch-band__action',
		{
			type: 'button',
			'data-action': key,
			'data-testid': TEST_IDS[key],
			disabled: disabled || heldNow || isBusy(key),
			onclick,
		},
		label,
	);
}

/**
 * A reset: destructive-outline, never primary. Unlike the step actions it
 * works while the lesson is paused (the server refuses only an ended lesson).
 */
function resetAction(label: string, key: string, onclick: () => void, disabled = false): m.Vnode {
	return m(
		'button.btn.btn--danger-outline.switch-band__action.switch-band__action--reset',
		{
			type: 'button',
			'data-action': key,
			'data-testid': TEST_IDS[key],
			disabled: disabled || endedNow || isBusy(key),
			onclick,
		},
		label,
	);
}

function stepActions(attrs: SwitchBandAttrs): m.Children {
	const { stepKey } = attrs;
	const actions: m.Children[] = [];
	if (stepKey === 'opening' && attrs.introVideos.length > 0) {
		actions.push(
			m(ProjectorPick, {
				videos: attrs.introVideos,
				projectorVideoId: attrs.projectorVideoId,
				held: heldNow,
				onPick: attrs.onProject,
			}),
		);
	}
	if (stepKey === 'tables') {
		actions.push(
			attrs.hasTables
				? action(t('console.resplit'), 'assign', () => attrs.onSplit(true))
				: action(t('console.split'), 'assign', () => attrs.onSplit(false)),
		);
	}
	if (stepKey === 'tableTalk' && attrs.hasTables) {
		actions.push(resetAction(t('console.reset_turns_all'), 'reset:turns:all', attrs.onResetTurns));
	}
	if (ALL_TABLES_RATE_STEPS.includes(stepKey)) {
		actions.push(action(t('console.all_tables_rate'), 'all:rate', attrs.onAllToRate));
	}
	if (stepKey === 'proposals') {
		actions.push(
			action(
				t('console.another_turn_all'),
				'all:newTurn',
				attrs.onAnotherTurnAll,
				!attrs.hasTables,
			),
		);
		actions.push(
			attrs.plenum
				? m(
						'button.btn.switch-band__action.switch-band__action--on',
						{
							type: 'button',
							disabled: true,
							'data-action': 'plenum',
							'data-testid': TEST_IDS.plenum,
						},
						t('console.plenum_on'),
					)
				: action(t('console.plenum'), 'plenum', attrs.onPlenum, !attrs.hasChallenge),
		);
	}
	// >>> allProposals BEGIN
	if (stepKey === 'allProposals' && attrs.allRatedLine) {
		actions.push(
			m(
				'p.switch-band__line',
				{ role: 'status', 'aria-live': 'polite', 'data-testid': 'console-all-rated' },
				attrs.allRatedLine,
			),
		);
	}
	// >>> allProposals END
	if (stepKey === 'vote') {
		actions.push(
			m(VoteBar, {
				held: heldNow,
				ended: endedNow,
				ballotFrozen: attrs.ballotFrozen,
				ballotPaused: attrs.ballotPaused,
				ballotClosed: attrs.ballotClosed,
				votedCount: attrs.votedCount ?? 0,
				presentCount: attrs.presentCount ?? 0,
				allVoted: attrs.allVoted === true,
				hasChallenge: attrs.hasChallenge,
				voteOrder: attrs.voteOrder,
				onVoteOrder: attrs.onVoteOrder,
				scope: attrs.voteScope,
				onFreeze: attrs.onFreeze,
				onPauseVote: attrs.onPauseVote,
				onCloseVote: attrs.onCloseVote,
				onResetVote: attrs.onResetVote,
			}),
		);
	}

	return actions;
}

function segment(attrs: SwitchBandAttrs): m.Vnode {
	const item = (view: ConsoleView, labelKey: string): m.Vnode =>
		m(
			'button.switch-band__segment-btn',
			{
				type: 'button',
				'data-view': view,
				'aria-pressed': attrs.view === view ? 'true' : 'false',
				class: attrs.view === view ? 'switch-band__segment-btn--on' : '',
				onclick: () => attrs.onView(view),
			},
			[
				t(labelKey),
				view === 'texts' && (attrs.flagCount ?? 0) > 0
					? m('span.switch-band__badge', { 'data-testid': 'flags-badge' }, String(attrs.flagCount))
					: null,
			],
		);

	return m('div.switch-band__segment', { role: 'group', 'aria-label': t('console.view_label') }, [
		item('tables', 'console.tables'),
		item('texts', 'console.texts'),
	]);
}

export const SwitchBand: m.Component<SwitchBandAttrs> = {
	view({ attrs }) {
		heldNow = attrs.held === true;
		endedNow = attrs.ended === true;

		return m('div.switch-band', [
			m('div.switch-band__actions', stepActions(attrs)),
			segment(attrs),
		]);
	},
};
