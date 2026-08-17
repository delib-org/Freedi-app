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

	const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
	/** statementId → where its row last sat, for the FLIP move */
	const rowOffsets = new Map<string, number>();
	/** The order last rendered, and whether this render actually changed it */
	let orderKey = '';
	let resorted = false;

	/**
	 * A proposal overtaking another is the whole point of live reorder, so the
	 * overtake has to be visible: FLIP puts the row back where the eye left it
	 * and lets it slide to its new place. A row that teleports says nothing —
	 * the class sees a different list, not a proposal winning.
	 *
	 * `offsetTop`, not `getBoundingClientRect`: on a projector someone is always
	 * scrolling, and scrolling must never read as motion.
	 *
	 * Only when the ORDER changed. Rows also shift when the reveal adds the
	 * count column and every row grows — animating that displacement would fling
	 * the whole list at the moment the teacher is trying to show it something.
	 */
	function flipRow(dom: HTMLElement, id: string): void {
		const now = dom.offsetTop;
		const before = rowOffsets.get(id);
		rowOffsets.set(id, now);
		if (before === undefined || reducedMotion || !resorted) return;
		const delta = before - now;
		if (Math.abs(delta) < 2) return;
		// Frame 1: no transition, sitting at the old place
		dom.style.transition = 'none';
		dom.style.transform = `translateY(${delta}px)`;
		requestAnimationFrame(() => {
			// Frame 2: hand the transition back to the stylesheet and let go
			dom.style.transition = '';
			dom.style.transform = '';
		});
	}

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

			/**
			 * The student's ballot IS the page, so it wears the shell. The
			 * teacher's copy is one card among several on a page that already has
			 * one — and `.shell` is `min-height: 100dvh`, so nesting it opened a
			 * screen-height hole between the ballot and the join code.
			 */
			const frame = (children: m.Children): m.Children =>
				readOnly
					? m('.voting.voting--board', children)
					: m('.shell', m('.shell__content.voting', children));

			// A class that rated nothing has an empty ballot. Say so — the
			// alternative is a screen that looks broken while the teacher works
			// out what happened.
			if (candidates.length === 0) {
				return frame([
					m('h2.voting__title', t('voting.title')),
					m('p.voting__waiting', t('voting.waiting')),
				]);
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

			// Did the ORDER change this render, or did the rows merely move?
			// Only the first is a FLIP (see flipRow).
			const key = ordered.map((entry) => entry.candidate.statementId).join('|');
			resorted = orderKey !== '' && key !== orderKey;
			orderKey = key;

			return frame([
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
								oncreate: (node: m.VnodeDOM) =>
									rowOffsets.set(candidate.statementId, (node.dom as HTMLElement).offsetTop),
								onupdate: (node: m.VnodeDOM) =>
									flipRow(node.dom as HTMLElement, candidate.statementId),
							},
							[
								// The fill sits behind the text; the number beside it is
								// what a student actually reads. Only once there is
								// something to fill: a 0% bar still paints its mint
								// leading edge, and an empty row must be EMPTY.
								showResults && share > 0
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
				// Progress is drawn as progress everywhere in this game — a mint
				// meter — with the sentence under it carrying the numbers.
				m('.voting__turnout', [
					classSize > 0
						? m(
								'.voting__turnout-track',
								{ 'aria-hidden': 'true' },
								m('.voting__turnout-fill', {
									style: {
										inlineSize: `${Math.round((votedCount / classSize) * 100)}%`,
									},
								}),
							)
						: null,
					m(
						'p.voting__turnout-text',
						classSize > 0
							? t('voting.turnout', { n: String(votedCount), total: String(classSize) })
							: t('voting.total_votes', { n: String(votedCount) }),
					),
				]),
				!readOnly && myVoteStatementId ? m('p.voting__hint', t('voting.change_hint')) : null,
				!showResults && !readOnly ? m('p.voting__hint', t('voting.results_hidden')) : null,
			]);
		},
	};
}
