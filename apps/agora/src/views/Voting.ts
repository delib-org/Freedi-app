import m from 'mithril';
import { t } from '../lib/i18n';
import { stalledBanner } from '../components/StalledBanner';
import { CarriedContext } from '../components/CarriedContext';
import { castVote, getVotingState, totalVotes } from '../lib/voting';
import { getCurrentPlanIndex } from '../lib/session';
import {
	VOTE_AGAINST,
	type AgoraParticipant,
	type AgoraSession,
	type VotingCandidate,
} from '@freedi/shared-types';

export interface VotingAttrs {
	session: AgoraSession;
	myParticipant: AgoraParticipant;
	userId: string;
	/** The vote is over (or the player stepped back to it): tallies only */
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
 * Two shapes. Several candidates: pick one. ONE candidate: the question is
 * not "which" but "do we adopt this?" — for or against, the against side
 * counted under its own sentinel in the same vote doc.
 *
 * One vote each, changeable until the teacher closes the stage: tapping
 * another option moves the vote, tapping your own withdraws it. Counts are the
 * server's, so the projector and the phones cannot disagree.
 */
export function Voting(): m.Component<VotingAttrs> {
	let saving = false;

	return {
		view(vnode) {
			const { session, readOnly = false } = vnode.attrs;
			const candidates: VotingCandidate[] = session.voting?.candidates ?? [];
			const { selections, myVoteStatementId, loaded } = getVotingState();
			const total = totalVotes();
			const single = candidates.length === 1;

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
				if (saving || readOnly) return;
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

			const option = (
				statementId: string,
				label: m.Children,
				number: string | null,
				extraClass?: string,
			): m.Children => {
				const count = selections[statementId] ?? 0;
				const mine = myVoteStatementId === statementId;
				// Before the first snapshot every bar would read 0% — show
				// no bar at all rather than a confident wrong number.
				const share = loaded && total > 0 ? Math.round((count / total) * 100) : 0;

				return m(
					'button.voting__option',
					{
						key: statementId,
						class:
							[mine ? 'voting__option--mine' : '', extraClass ?? ''].join(' ').trim() || undefined,
						'aria-pressed': mine ? 'true' : 'false',
						disabled: saving || readOnly,
						onclick: () => vote(statementId),
					},
					[
						// The fill sits behind the text; the number beside it is
						// what a student actually reads.
						m('span.voting__bar', { style: { inlineSize: `${share}%` }, 'aria-hidden': 'true' }),
						m('span.voting__body', [
							number ? m('span.voting__number', number) : null,
							m('span.voting__label', label),
						]),
						m('span.voting__count', [
							m('span.voting__votes', String(count)),
							loaded && total > 0 ? m('span.voting__share', `${share}%`) : null,
						]),
					],
				);
			};

			return m(
				'.shell',
				m('.shell__content.voting', [
					m('h2.voting__title', t('voting.title')),
					m(
						'p.voting__instruction',
						t(
							readOnly
								? 'voting.closed'
								: single
									? 'voting.single_instruction'
									: 'voting.instruction',
						),
					),

					m(CarriedContext, { session, beforeIndex: getCurrentPlanIndex(), defaultOpen: false }),

					// A ballot disabled by a vote that never lands looks broken with
					// no explanation — this screen has no HUD, so the stalled-write
					// line has to live here itself.
					readOnly ? null : stalledBanner(),

					single
						? [
								m('.card.voting__motion', [m('p.voting__motion-text', candidates[0].statement)]),
								m('.voting__list.voting__list--binary', [
									option(candidates[0].statementId, t('voting.for'), null, 'voting__option--for'),
									option(VOTE_AGAINST, t('voting.against'), null, 'voting__option--against'),
								]),
							]
						: m(
								'.voting__list',
								candidates.map((candidate, index) =>
									option(candidate.statementId, candidate.statement, `${index + 1}`),
								),
							),

					m('p.voting__total', t('voting.total_votes', { n: String(total) })),
					myVoteStatementId && !readOnly ? m('p.voting__hint', t('voting.change_hint')) : null,
				]),
			);
		},
	};
}
