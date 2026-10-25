import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import '@/styles/student-c3.scss';
import { StudentFrame } from '@/components/StudentFrame';
import { t } from '@/lib/i18n';
import { getChallengeQuestion } from '@/lib/lesson';
import { getSubQuestions } from '@/lib/store';
import { castVote } from '@/lib/classroom/studentWrites';
import { listenMyVote } from '@/lib/classroom/c3Data';
import {
	liveResultsOn,
	orderBySupport,
	sortBySupportOn,
	voteResults,
} from '@/lib/classroom/voteResults';
import type { Unsubscribe } from '@/lib/firebase';
import { ErrorLine } from './ErrorLine';
import { FlowFeed } from './FlowFeed';
import { VoteList } from './VoteList';

const INSTRUCTION_KEY = {
	waiting: 'voting.waiting',
	open: 'voting.pick_one',
	paused: 'voting.paused_hint',
} as const;

function instructionOf(state: keyof typeof INSTRUCTION_KEY): string {
	return t(INSTRUCTION_KEY[state]);
}

export interface VoteScreenAttrs {
	main: Statement;
}

class VoteState {
	feed = new FlowFeed();
	votedId: string | null = null;
	/** The last proposal this phone had voted for (to tell "removed" from "never voted"). */
	lastVotedId: string | null = null;
	selectedId: string | null = null;
	voteStop: Unsubscribe | null = null;
	voteFor: string | null = null;
	saving = false;
	error: string | null = null;
	/** The order the cards were last shown in (ties keep it when sorting by support). */
	order: string[] = [];
}

/**
 * The vote (UX §2.8): radio cards of the frozen ballot, "Vote" casts (two
 * taps), "You voted" in teal; a different card turns the button into "Change
 * vote" until the ballot closes. While the teacher has the vote paused the
 * cards are locked and the button says so; the vote already cast is kept.
 * Live results (on unless the teacher hides them) add each proposal's share;
 * ordering by support (off unless switched on) puts the most voted on top.
 */
export const VoteScreen: m.ClassComponent<VoteScreenAttrs> = {
	oninit(vnode) {
		(vnode.state as { self?: VoteState }).self = new VoteState();
	},

	onremove(vnode) {
		const self = (vnode.state as { self?: VoteState }).self;
		self?.feed.stop();
		self?.voteStop?.();
	},

	view(vnode) {
		const self = (vnode.state as { self?: VoteState }).self as VoteState;
		const { main } = vnode.attrs;
		const challenge = getChallengeQuestion(getSubQuestions());
		const ballot = challenge?.statementSettings?.ballot;
		self.feed.sync(main, main.statementId, null, [], false);
		const challengeId = challenge?.statementId ?? null;
		if (challengeId && challengeId !== self.voteFor) {
			self.voteFor = challengeId;
			self.voteStop?.();
			self.voteStop = listenMyVote(
				challengeId,
				(optionId) => {
					self.votedId = optionId;
					m.redraw();
				},
				(error) => console.error('[C3] vote listener error:', error),
			);
		}
		const closed = !!ballot?.closedAt;
		const paused = !closed && typeof ballot?.pausedAt === 'number';
		const ballotIds = ballot?.candidateIds ?? [];
		const tally = voteResults(ballotIds, challenge?.selections);
		const sorted = sortBySupportOn(challenge);
		self.order = sorted ? orderBySupport(ballotIds, tally, self.order) : [...ballotIds];
		const candidates = self.order
			.map((id) => self.feed.options.find((o) => o.statementId === id))
			.filter((o): o is Statement => !!o);
		const results = liveResultsOn(challenge) ? tally : null;
		if (self.votedId) self.lastVotedId = self.votedId;
		// The teacher hid the proposal this phone voted for: its vote is withdrawn.
		const choiceRemoved =
			!!ballot &&
			!closed &&
			!self.votedId &&
			!!self.lastVotedId &&
			!ballotIds.includes(self.lastVotedId);
		const stillCandidate = (id: string | null): boolean => !!id && ballotIds.includes(id);
		const selected = stillCandidate(self.selectedId) ? self.selectedId : self.votedId;
		const changed = !!selected && selected !== self.votedId;

		const cast = (): void => {
			if (!challengeId || !selected || self.saving || paused || closed) return;
			self.saving = true;
			self.error = null;
			castVote(main.statementId, challengeId, selected)
				.catch(() => {
					self.error = t('voting.failed');
				})
				.finally(() => {
					self.saving = false;
					m.redraw();
				});
		};

		let label = t('voting.vote');
		let disabled = !selected;
		let variant = 'btn--primary';
		if (closed) {
			label = t('voting.closed');
			disabled = true;
			variant = 'btn--secondary';
		} else if (paused) {
			label = t('voting.paused');
			disabled = true;
			variant = 'btn--secondary';
		} else if (self.saving) {
			label = t('voting.saving');
			disabled = true;
		} else if (self.votedId && !changed) {
			label = t('voting.voted');
			disabled = true;
			variant = 'btn--agree';
		} else if (self.votedId && changed) {
			label = t('voting.change');
		}

		return m(
			StudentFrame,
			{
				headerLine: t('voting.title'),
				instruction: instructionOf(ballot ? (paused ? 'paused' : 'open') : 'waiting'),
				action: ballot
					? m(
							'button.btn',
							{
								class: variant,
								type: 'button',
								'data-testid': 'vote-send',
								disabled: disabled || undefined,
								onclick: cast,
							},
							label,
						)
					: null,
			},
			ballot
				? [
						choiceRemoved ? m('p.vote__empty', { role: 'status' }, t('vote.choice_removed')) : null,
						candidates.length === 0
							? m('p.vote__empty', t('voting.empty'))
							: m(VoteList, {
									candidates,
									selectedId: selected,
									locked: closed || paused,
									results,
									animateReorder: sorted,
									onSelect: (id: string) => {
										self.selectedId = id;
									},
								}),
						m(ErrorLine, { message: self.error, onRetry: cast }),
					]
				: null,
		);
	},
};
