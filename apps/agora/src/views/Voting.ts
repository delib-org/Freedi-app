import m from 'mithril';
import { t } from '../lib/i18n';
import { castVote, getVotingState, totalVotes } from '../lib/voting';
import { AgoraParticipant, AgoraSession, VotingCandidate } from '@freedi/shared-types';

export interface VotingAttrs {
	session: AgoraSession;
	myParticipant: AgoraParticipant;
	userId: string;
}

/**
 * The ballot.
 *
 * Candidates come from `session.voting` — the snapshot taken when the stage
 * opened — and never from the question's live `results`, which the shared
 * selector keeps rewriting as ratings arrive. A class must not watch the
 * ballot change while it votes.
 *
 * One vote each, changeable until the teacher closes the stage: tapping
 * another option moves the vote, tapping your own withdraws it. Counts are the
 * server's, so the projector and the phones cannot disagree.
 */
export function Voting(): m.Component<VotingAttrs> {
	let saving = false;

	return {
		view(vnode) {
			const { session } = vnode.attrs;
			const candidates: VotingCandidate[] = session.voting?.candidates ?? [];
			const { selections, myVoteStatementId, loaded } = getVotingState();
			const total = totalVotes();

			// A class that rated nothing has an empty ballot. Say so — the
			// alternative is a screen that looks broken while the teacher works
			// out what happened.
			if (candidates.length === 0) {
				return m(
					'.shell',
					m('.shell__content.voting', [
						m('h2.voting__title', t('voting.title')),
						m('p.voting__waiting', t('voting.waiting')),
					]),
				);
			}

			function vote(statementId: string): void {
				if (saving) return;
				saving = true;
				castVote(session, statementId)
					.catch((error: unknown) => {
						console.error('[Voting] Casting the vote failed:', error);
					})
					.finally(() => {
						saving = false;
						m.redraw();
					});
			}

			return m(
				'.shell',
				m('.shell__content.voting', [
					m('h2.voting__title', t('voting.title')),
					m('p.voting__instruction', t('voting.instruction')),

					m(
						'.voting__list',
						candidates.map((candidate, index) => {
							const count = selections[candidate.statementId] ?? 0;
							const mine = myVoteStatementId === candidate.statementId;
							// Before the first snapshot every bar would read 0% — show
							// no bar at all rather than a confident wrong number.
							const share = loaded && total > 0 ? Math.round((count / total) * 100) : 0;

							return m(
								'button.voting__option',
								{
									key: candidate.statementId,
									class: mine ? 'voting__option--mine' : undefined,
									'aria-pressed': mine ? 'true' : 'false',
									disabled: saving,
									onclick: () => vote(candidate.statementId),
								},
								[
									// The fill sits behind the text; the number beside it is
									// what a student actually reads.
									m('span.voting__bar', {
										style: { inlineSize: `${share}%` },
										'aria-hidden': 'true',
									}),
									m('span.voting__body', [
										m('span.voting__number', `${index + 1}`),
										m('span.voting__label', candidate.statement),
									]),
									m('span.voting__count', [
										m('span.voting__votes', String(count)),
										loaded && total > 0 ? m('span.voting__share', `${share}%`) : null,
									]),
								],
							);
						}),
					),

					m('p.voting__total', t('voting.total_votes', { n: String(total) })),
					myVoteStatementId ? m('p.voting__hint', t('voting.change_hint')) : null,
				]),
			);
		},
	};
}
