import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import '@/styles/student-c3.scss';
import { StudentFrame } from '@/components/StudentFrame';
import { t } from '@/lib/i18n';
import { getChallengeQuestion } from '@/lib/lesson';
import { getSubQuestions } from '@/lib/store';
import { castVote } from '@/lib/classroom/studentWrites';
import { listenMyVote } from '@/lib/classroom/c3Data';
import type { Unsubscribe } from '@/lib/firebase';
import { ErrorLine } from './ErrorLine';
import { FlowFeed } from './FlowFeed';
import { VoteList } from './VoteList';

export interface VoteScreenAttrs {
	main: Statement;
}

class VoteState {
	feed = new FlowFeed();
	votedId: string | null = null;
	selectedId: string | null = null;
	voteStop: Unsubscribe | null = null;
	voteFor: string | null = null;
	saving = false;
	error: string | null = null;
}

/**
 * The vote (UX §2.8): radio cards of the frozen ballot, "Vote" casts (two
 * taps), "You voted" in teal; a different card turns the button into "Change
 * vote" until the ballot closes.
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
		const candidates = (ballot?.candidateIds ?? [])
			.map((id) => self.feed.options.find((o) => o.statementId === id))
			.filter((o): o is Statement => !!o);
		const selected = self.selectedId ?? self.votedId;
		const changed = !!selected && selected !== self.votedId;

		const cast = (): void => {
			if (!challengeId || !selected || self.saving) return;
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
				instruction: ballot ? t('voting.pick_one') : t('voting.waiting'),
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
						candidates.length === 0
							? m('p.vote__empty', t('voting.empty'))
							: m(VoteList, {
									candidates,
									selectedId: selected,
									closed,
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
