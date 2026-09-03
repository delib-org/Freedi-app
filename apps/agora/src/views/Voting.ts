import m from 'mithril';
import { t } from '../lib/i18n';
import { stalledBanner } from '../components/StalledBanner';
import { CarriedContext } from '../components/CarriedContext';
import { castVote, getVotingState, totalVotes } from '../lib/voting';
import { ballotOrderKey, rankBallot } from '../lib/ballotOrder';
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
 *
 * The list is live-sorted, most supported first (lib/ballotOrder.ts), and a
 * row that changes place SLIDES there rather than teleporting — the movement
 * is the message ("that one just overtook"), and a row that jumps under a
 * reading finger just loses the reader their place.
 */
export function Voting(): m.Component<VotingAttrs> {
	let saving = false;

	/** statementId → where its row last sat in the list, for the FLIP move */
	const rowOffsets = new Map<string, number>();
	/** The order the ballot last rendered, and whether it just changed */
	let orderKey = '';
	let resorted = false;
	const reducedMotion =
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	function rememberRow(dom: HTMLElement, id: string): void {
		rowOffsets.set(id, dom.offsetTop);
	}

	/**
	 * FLIP: the row is already in its new place when this runs, so put it
	 * back where the eye left it and let it travel. offsetTop, not
	 * getBoundingClientRect — scrolling must not read as motion. Only when
	 * the ORDER changed: rows also shift when the hint line appears below
	 * them, and that is layout, not a race.
	 *
	 * The Web Animations API rather than an inline transform, so the row's
	 * own hover transition and the bar's fill are never fought with.
	 */
	function flipRow(dom: HTMLElement, id: string): void {
		const now = dom.offsetTop;
		const before = rowOffsets.get(id);
		rowOffsets.set(id, now);
		if (before === undefined || reducedMotion || !resorted) return;
		const delta = before - now;
		if (Math.abs(delta) < 2 || typeof dom.animate !== 'function') return;
		dom.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], {
			duration: 600,
			easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
		});
	}

	return {
		view(vnode) {
			const { session, readOnly = false } = vnode.attrs;
			const candidates: VotingCandidate[] = session.voting?.candidates ?? [];
			const { selections, myVoteStatementId, loaded } = getVotingState();
			const total = totalVotes();
			const single = candidates.length === 1;

			// Most supported first; the number each candidate wears is its
			// place on the ballot, not its place in the race
			const ranked = rankBallot(candidates, selections);
			const key = ballotOrderKey(ranked);
			resorted = orderKey !== '' && key !== orderKey;
			orderKey = key;

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
				flip = false,
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
						oncreate: (vnode: m.VnodeDOM) => {
							if (flip) rememberRow(vnode.dom as HTMLElement, statementId);
						},
						onupdate: (vnode: m.VnodeDOM) => {
							if (flip) flipRow(vnode.dom as HTMLElement, statementId);
						},
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
								ranked.map((entry) =>
									option(
										entry.candidate.statementId,
										entry.candidate.statement,
										`${entry.number}`,
										undefined,
										true,
									),
								),
							),

					m('p.voting__total', t('voting.total_votes', { n: String(total) })),
					myVoteStatementId && !readOnly ? m('p.voting__hint', t('voting.change_hint')) : null,
				]),
			);
		},
	};
}
