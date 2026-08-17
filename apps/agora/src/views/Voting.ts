import m from 'mithril';
import { t } from '../lib/i18n';
import { castVote, getVotingState, totalVotes } from '../lib/voting';
import { getSessionState } from '../lib/session';
import { AgoraParticipant, AgoraSession, VotingCandidate } from '@freedi/shared-types';

export interface VotingAttrs {
	session: AgoraSession;
	myParticipant: AgoraParticipant;
	userId: string;
	/**
	 * Render the tallies whatever the class setting says. The teacher's own
	 * board always shows them — they are the one deciding when to reveal, and
	 * they cannot decide blind.
	 */
	alwaysShowResults?: boolean;
	/** The teacher's board is a projector, not a ballot */
	readOnly?: boolean;
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
 *
 * By default voters do NOT see the tallies. A running count is an argument —
 * the leading option would gather votes for leading — so the teacher reveals
 * them deliberately. What is never hidden is how many people have voted: that
 * is the room's own progress, and it belongs to everyone.
 */
export function Voting(): m.Component<VotingAttrs> {
	let saving = false;

	return {
		view(vnode) {
			const { session, alwaysShowResults, readOnly } = vnode.attrs;
			const candidates: VotingCandidate[] = session.voting?.candidates ?? [];
			const { selections, myVoteStatementId, voterUids, loaded } = getVotingState();
			const total = totalVotes();

			const settings = session.votingSettings;
			const showResults = alwaysShowResults === true || settings?.showResults === true;
			// Reordering by a hidden number would leak it, and a ballot that moves
			// under a voter's finger loses their place.
			const liveReorder = showResults && settings?.liveReorder === true;

			// Everyone always knows how much of the class has spoken
			const classSize = getSessionState().participants.length;
			const votedCount = voterUids.size;

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
				if (readOnly || saving) return;
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

			// The ballot's own order is the agreement order it was drawn in. Under
			// live reorder it follows the count instead — ties keep the original
			// order so the list cannot jitter between equal options.
			const ordered = candidates.map((candidate, index) => ({ candidate, index }));
			if (liveReorder) {
				ordered.sort((a, b) => {
					const byVotes =
						(selections[b.candidate.statementId] ?? 0) - (selections[a.candidate.statementId] ?? 0);

					return byVotes !== 0 ? byVotes : a.index - b.index;
				});
			}

			return m(
				'.shell',
				m('.shell__content.voting', [
					m('h2.voting__title', t('voting.title')),
					m('p.voting__instruction', t(readOnly ? 'voting.teacher_hint' : 'voting.instruction')),

					m(
						'.voting__list',
						ordered.map(({ candidate, index }) => {
							const count = selections[candidate.statementId] ?? 0;
							const mine = !readOnly && myVoteStatementId === candidate.statementId;
							// Before the first snapshot every bar would read 0% — show
							// no bar at all rather than a confident wrong number.
							const share = loaded && total > 0 ? Math.round((count / total) * 100) : 0;

							return m(
								readOnly ? 'div.voting__option.voting__option--static' : 'button.voting__option',
								{
									key: candidate.statementId,
									class: mine ? 'voting__option--mine' : undefined,
									'aria-pressed': readOnly ? undefined : mine ? 'true' : 'false',
									disabled: readOnly ? undefined : saving,
									onclick: readOnly ? undefined : () => vote(candidate.statementId),
								},
								[
									// The fill sits behind the text; the number beside it is
									// what a student actually reads.
									showResults
										? m('span.voting__bar', {
												style: { inlineSize: `${share}%` },
												'aria-hidden': 'true',
											})
										: null,
									m('span.voting__body', [
										// The number is the proposal's identity on the ballot, so
										// it stays with the proposal even when the list re-sorts.
										m('span.voting__number', `${index + 1}`),
										m('span.voting__label', candidate.statement),
									]),
									showResults
										? m('span.voting__count', [
												m('span.voting__votes', String(count)),
												loaded && total > 0 ? m('span.voting__share', `${share}%`) : null,
											])
										: null,
								],
							);
						}),
					),

					// Always: how much of the room has spoken. Never: for whom.
					m(
						'p.voting__turnout',
						classSize > 0
							? t('voting.turnout', { n: String(votedCount), total: String(classSize) })
							: t('voting.total_votes', { n: String(votedCount) }),
					),
					!readOnly && myVoteStatementId ? m('p.voting__hint', t('voting.change_hint')) : null,
					!showResults && !readOnly ? m('p.voting__hint', t('voting.results_hidden')) : null,
				]),
			);
		},
	};
}
