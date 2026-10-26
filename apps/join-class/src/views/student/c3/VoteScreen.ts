import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import '@/styles/student-c3.scss';
import { StudentFrame } from '@/components/StudentFrame';
import { t } from '@/lib/i18n';
import { getChallengeQuestion } from '@/lib/lesson';
import { getSubQuestions } from '@/lib/store';
import { castVote } from '@/lib/classroom/studentWrites';
import { listenMyVote } from '@/lib/classroom/c3Data';
import { VoteCaster } from '@/lib/classroom/voteCaster';
import {
	consensusOf,
	countsOf,
	keepOrder,
	liveResultsOn,
	orderBallot,
	voteOrderOf,
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
	closed: 'voting.closed_hint',
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
	voteStop: Unsubscribe | null = null;
	voteFor: string | null = null;
	/** Pick = vote: every tap is written at once, the latest pick wins. */
	caster: VoteCaster | null = null;
	/** The order the cards were last shown in (ties keep it; frozen while a pick is pending). */
	order: string[] = [];
}

/**
 * The vote (UX §2.8): radio cards of the frozen ballot. Picking a card IS the
 * vote (no submit button): it is written at once, a different card moves the
 * vote until the ballot closes, and "Your vote was counted" confirms it. While
 * the teacher has the vote paused the cards are locked; the vote already cast
 * is kept. Live results (on unless the teacher hides them) add each
 * proposal's share. The cards follow the teacher's order (C_p by default,
 * votes, or one shared random order); a closed ballot is ordered by votes,
 * winner first. While a pick is being written the order is frozen (IA 21.3).
 */
export const VoteScreen: m.ClassComponent<VoteScreenAttrs> = {
	oninit(vnode) {
		const self = new VoteState();
		(vnode.state as { self?: VoteState }).self = self;
		self.caster = new VoteCaster({
			write: (optionId) => {
				const { main } = vnode.attrs;
				const challengeId = getChallengeQuestion(getSubQuestions())?.statementId;
				if (!challengeId) return Promise.reject(new Error('no challenge'));

				return castVote(main.statementId, challengeId, optionId);
			},
			onChange: () => m.redraw(),
			onError: (error) =>
				console.error('[C3] vote write failed:', vnode.attrs.main.statementId, error),
		});
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
					self.caster?.sync(optionId);
					m.redraw();
				},
				(error) => console.error('[C3] vote listener error:', error),
			);
		}
		const closed = !!ballot?.closedAt;
		const paused = !closed && typeof ballot?.pausedAt === 'number';
		const ballotIds = ballot?.candidateIds ?? [];
		const tally = voteResults(ballotIds, challenge?.selections);
		const mode = voteOrderOf(challenge);
		const caster = self.caster as VoteCaster;
		const stillCandidate = (id: string | null): boolean => !!id && ballotIds.includes(id);
		const pending = !closed && caster.pending && stillCandidate(caster.wanted);
		self.order = pending
			? keepOrder(ballotIds, self.order)
			: orderBallot(
					ballotIds,
					closed ? 'result' : mode,
					{ consensus: consensusOf(self.feed.options), votes: countsOf(tally) },
					self.order,
					challengeId ?? '',
				);
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
		const selected = pending || caster.failed ? caster.wanted : self.votedId;
		const open = !closed && !paused;
		const writing = pending && !caster.failed;
		const counted = open && !writing && !!selected && selected === self.votedId;
		let statusKey: string | null = null;
		if (closed) statusKey = 'voting.closed';
		else if (paused) statusKey = 'voting.paused';
		else if (writing) statusKey = 'voting.saving';
		else if (counted) statusKey = 'voting.counted';

		return m(
			StudentFrame,
			{
				headerLine: t('voting.title'),
				instruction: instructionOf(
					ballot ? (closed ? 'closed' : paused ? 'paused' : 'open') : 'waiting',
				),
				action: ballot
					? m(
							'p.vote__status',
							{
								class: counted ? 'vote__status--counted' : '',
								role: 'status',
								'aria-live': 'polite',
								'data-testid': 'vote-status',
							},
							statusKey ? t(statusKey) : '',
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
									animateReorder: mode !== 'random' || closed,
									winnerId: closed ? (ballot?.decisionId ?? null) : null,
									onSelect: (id: string) => {
										if (open) caster.pick(id);
									},
								}),
						m(ErrorLine, {
							message: caster.failed ? t('voting.failed') : null,
							onRetry: () => caster.retry(),
						}),
					]
				: null,
		);
	},
};
